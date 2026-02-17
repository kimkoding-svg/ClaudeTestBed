/**
 * Encounter Manager — orchestrates back-and-forth conversations
 * between independent social agents.
 *
 * Each agent thinks for itself: Agent A generates a line, then Agent B
 * responds seeing what A said. The number of exchanges scales with
 * familiarity and mood.
 *
 * Phase 2: Functional with stub agents (no real AI).
 * Phase 3: Real Claude API calls via SocialAgent.respond().
 */

const log = require('../../logger').child('ENCOUNTERS');

class EncounterManager {
  /**
   * @param {object} deps - { relationshipManager, characterRegistry, costTracker }
   */
  constructor(deps) {
    this.relationshipManager = deps.relationshipManager;
    this.characterRegistry = deps.characterRegistry;
    this.costTracker = deps.costTracker || null;

    /** @type {Map<string, SocialAgent>} characterId → SocialAgent */
    this.agents = new Map();

    /** @type {Array<object>} encounter queue */
    this.queue = [];

    /** @type {object|null} currently processing encounter */
    this.activeEncounter = null;

    /** @type {Map<string, number>} characterId → tick of last encounter */
    this.encounterCooldowns = new Map();

    /** @type {number} minimum ticks between encounters for same character */
    this.cooldownTicks = 15;

    /** @type {number} ms between processing queued encounters */
    this.rateLimitMs = 3000;

    this._lastProcessTime = 0;
    this._nextEncounterId = 1;

    /** @type {Array<object>} completed encounters log (last 100) */
    this.encounterLog = [];
  }

  /**
   * Register a social agent for a character.
   */
  registerAgent(characterId, agent) {
    this.agents.set(characterId, agent);
  }

  /**
   * Remove a social agent.
   */
  unregisterAgent(characterId) {
    this.agents.delete(characterId);
  }

  /**
   * Check if a character is on encounter cooldown.
   */
  isOnCooldown(characterId, currentTick) {
    const last = this.encounterCooldowns.get(characterId);
    if (last === undefined) return false;
    return (currentTick - last) < this.cooldownTicks;
  }

  /**
   * Queue an encounter between two characters.
   * Returns the encounter id, or null if invalid.
   */
  queueEncounter(id1, id2, tick, themeContext = '') {
    // Validate
    if (id1 === id2) return null;
    if (!this.agents.has(id1) || !this.agents.has(id2)) return null;
    if (this.isOnCooldown(id1, tick) || this.isOnCooldown(id2, tick)) return null;

    // Check not already queued or active
    const alreadyQueued = this.queue.some(e =>
      (e.participants[0] === id1 && e.participants[1] === id2) ||
      (e.participants[0] === id2 && e.participants[1] === id1)
    );
    if (alreadyQueued) return null;
    if (this.activeEncounter &&
      (this.activeEncounter.participants.includes(id1) || this.activeEncounter.participants.includes(id2))) {
      return null;
    }

    const encounter = {
      id: `enc_${this._nextEncounterId++}`,
      participants: [id1, id2],
      tick,
      themeContext,
      dialogue: [],
      sentiments: { [id1]: 0, [id2]: 0 },
      memoryNotes: { [id1]: '', [id2]: '' },
      status: 'queued',
    };

    this.queue.push(encounter);
    return encounter.id;
  }

  /**
   * Process the next encounter in the queue (if rate limit allows).
   * Returns events generated during processing, or empty array.
   * @param {number} tick
   * @param {string} activeEventsSummary - from event manager
   * @returns {Promise<Array<object>>}
   */
  async processNext(tick, activeEventsSummary = '') {
    const now = Date.now();
    if (now - this._lastProcessTime < this.rateLimitMs) return [];
    if (this.queue.length === 0) return [];

    this._lastProcessTime = now;
    const encounter = this.queue.shift();
    this.activeEncounter = encounter;
    encounter.status = 'active';

    const events = [];
    const [id1, id2] = encounter.participants;
    const agent1 = this.agents.get(id1);
    const agent2 = this.agents.get(id2);

    if (!agent1 || !agent2) {
      encounter.status = 'failed';
      this.activeEncounter = null;
      return [];
    }

    // Set characters to talking
    this.characterRegistry.setState(id1, 'talking');
    this.characterRegistry.setState(id2, 'talking');

    log.info('Encounter started', { id: encounter.id, participants: [id1, id2] });
    events.push({
      type: 'encounter_start',
      encounterId: encounter.id,
      participants: [id1, id2],
      tick,
    });

    // Determine conversation depth based on familiarity + mood
    const rel12 = this.relationshipManager.getRelationship(id1, id2);
    const rel21 = this.relationshipManager.getRelationship(id2, id1);
    const avgFamiliarity = (rel12.familiarity + rel21.familiarity) / 2;
    const avgMood = ((agent1.character.mood || 50) + (agent2.character.mood || 50)) / 2;
    const maxExchanges = this._calculateDepth(avgFamiliarity, avgMood);

    // Build relationship contexts for each agent
    const relContext1 = this.relationshipManager.getRelationshipContext(id1);
    const relContext2 = this.relationshipManager.getRelationshipContext(id2);
    const char1Summary = this.characterRegistry.getPublicSummary(id1);
    const char2Summary = this.characterRegistry.getPublicSummary(id2);

    let conversationSoFar = '';
    let totalSentiment1 = 0;
    let totalSentiment2 = 0;

    // Back-and-forth exchanges
    for (let exchange = 0; exchange < maxExchanges; exchange++) {
      // Agent 1 speaks
      const response1 = await agent1.respond({
        partnerName: agent2.name,
        partnerSummary: JSON.stringify(char2Summary),
        conversationSoFar: exchange === 0 ? '' : conversationSoFar,
        relationshipContext: relContext1,
        activeEvents: activeEventsSummary,
        themeContext: encounter.themeContext,
      });

      encounter.dialogue.push({
        speakerId: id1,
        speakerName: agent1.name,
        text: response1.text,
        timestamp: Date.now(),
      });
      totalSentiment1 += response1.sentiment;
      conversationSoFar += `${agent1.name}: ${response1.text}\n`;

      events.push({
        type: 'dialogue_line',
        encounterId: encounter.id,
        participants: [id1, id2],
        speakerId: id1,
        speakerName: agent1.name,
        partnerId: id2,
        partnerName: agent2.name,
        text: response1.text,
        tick,
      });

      // Agent 2 responds
      const response2 = await agent2.respond({
        partnerName: agent1.name,
        partnerSummary: JSON.stringify(char1Summary),
        conversationSoFar,
        relationshipContext: relContext2,
        activeEvents: activeEventsSummary,
        themeContext: encounter.themeContext,
      });

      encounter.dialogue.push({
        speakerId: id2,
        speakerName: agent2.name,
        text: response2.text,
        timestamp: Date.now(),
      });
      totalSentiment2 += response2.sentiment;
      conversationSoFar += `${agent2.name}: ${response2.text}\n`;

      events.push({
        type: 'dialogue_line',
        encounterId: encounter.id,
        participants: [id1, id2],
        speakerId: id2,
        speakerName: agent2.name,
        partnerId: id1,
        partnerName: agent1.name,
        text: response2.text,
        tick,
      });
    }

    // Average sentiments over exchanges
    const avgSentiment1 = totalSentiment1 / maxExchanges;
    const avgSentiment2 = totalSentiment2 / maxExchanges;
    encounter.sentiments[id1] = avgSentiment1;
    encounter.sentiments[id2] = avgSentiment2;

    // Each agent reflects independently
    const memory1 = await agent1.reflect({
      partnerName: agent2.name,
      dialogue: encounter.dialogue.map(d => `${d.speakerName}: ${d.text}`),
      mySentiment: avgSentiment1,
    });
    const memory2 = await agent2.reflect({
      partnerName: agent1.name,
      dialogue: encounter.dialogue.map(d => `${d.speakerName}: ${d.text}`),
      mySentiment: avgSentiment2,
    });

    encounter.memoryNotes[id1] = memory1;
    encounter.memoryNotes[id2] = memory2;

    // Update directional relationships independently
    this.relationshipManager.updateAfterEncounter(id1, id2, avgSentiment1, memory1);
    this.relationshipManager.updateAfterEncounter(id2, id1, avgSentiment2, memory2);

    // Set cooldowns
    this.encounterCooldowns.set(id1, tick);
    this.encounterCooldowns.set(id2, tick);

    // Reset character states
    this.characterRegistry.setState(id1, 'idle');
    this.characterRegistry.setState(id2, 'idle');

    // Complete encounter
    encounter.status = 'completed';
    this.activeEncounter = null;

    // Log encounter (keep last 100)
    this.encounterLog.push(encounter);
    if (this.encounterLog.length > 100) this.encounterLog.shift();

    log.info('Encounter complete', { id: encounter.id, participants: [id1, id2], exchanges: maxExchanges, sentiment1: avgSentiment1.toFixed(2), sentiment2: avgSentiment2.toFixed(2) });
    events.push({
      type: 'encounter_end',
      encounterId: encounter.id,
      participants: [id1, id2],
      sentiments: { [id1]: avgSentiment1, [id2]: avgSentiment2 },
      memoryNotes: { [id1]: memory1, [id2]: memory2 },
      dialogueLength: encounter.dialogue.length,
      tick,
    });

    return events;
  }

  /**
   * Force an encounter immediately (god-mode), bypassing queue and cooldowns.
   */
  async forceEncounter(id1, id2, tick, themeContext = '', activeEventsSummary = '') {
    // Reset cooldowns for these characters
    this.encounterCooldowns.delete(id1);
    this.encounterCooldowns.delete(id2);

    const encId = this.queueEncounter(id1, id2, tick, themeContext);
    if (!encId) return [];

    // Process immediately
    this._lastProcessTime = 0; // bypass rate limit
    return this.processNext(tick, activeEventsSummary);
  }

  /**
   * Get the state of the encounter system.
   */
  getState() {
    return {
      queueLength: this.queue.length,
      activeEncounter: this.activeEncounter ? {
        id: this.activeEncounter.id,
        participants: this.activeEncounter.participants,
      } : null,
      recentEncounters: this.encounterLog.slice(-10).map(e => ({
        id: e.id,
        participants: e.participants,
        dialogueLength: e.dialogue.length,
        sentiments: e.sentiments,
        status: e.status,
      })),
    };
  }

  // ─── Internal ─────────────────────────────────────────

  /**
   * Determine how many back-and-forth exchanges to have.
   * Strangers / bad mood → 1 exchange (2 lines)
   * Friends / good mood → 3-4 exchanges (6-8 lines)
   */
  _calculateDepth(avgFamiliarity, avgMood) {
    let depth = 1;
    if (avgFamiliarity > 10) depth = 2;
    if (avgFamiliarity > 30) depth = 3;
    if (avgFamiliarity > 50 && avgMood > 50) depth = 4;
    // Low mood reduces depth
    if (avgMood < 30) depth = Math.max(1, depth - 1);
    return depth;
  }
}

module.exports = { EncounterManager };
