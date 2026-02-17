/**
 * Social Engine — main orchestrator for the reusable social interaction system.
 *
 * Simulator-agnostic: manages characters, relationships, encounters, needs,
 * and events. Any simulator theme (office, school, spaceship, etc.) plugs
 * in via an adapter that provides spatial/contextual information.
 *
 * Usage:
 *   const engine = new SocialEngine(config);
 *   engine.addCharacter(charData);
 *   engine.setAdapter(myAdapter);
 *   const events = await engine.tick(simulatorContext);
 */

const { CharacterRegistry } = require('./character-registry');
const { RelationshipManager } = require('./relationship-manager');
const { EncounterManager } = require('./encounter-manager');
const { NeedsManager } = require('./needs-manager');
const { EventManager } = require('./event-manager');
const { TaskManager } = require('./task-manager');
const { SocialAgent } = require('./social-agent');
const log = require('../../logger').child('SOCIAL-ENGINE');

class SocialEngine {
  /**
   * @param {object} config
   * @param {string} [config.model='haiku'] - Claude model for agent responses
   * @param {object} [config.anthropicClient] - Anthropic SDK client (null = stub mode)
   * @param {object} [config.costTracker] - shared cost tracker instance
   * @param {number} [config.budgetCap=1.0] - maximum spend in dollars
   * @param {number} [config.encounterRateLimitMs=3000] - ms between encounter processing
   * @param {number} [config.encounterCooldownTicks=15] - ticks between encounters for same character
   */
  constructor(config = {}) {
    this.config = {
      model: config.model || 'haiku',
      anthropicClient: config.anthropicClient || null,
      costTracker: config.costTracker || null,
      budgetCap: config.budgetCap ?? 1.0,
      encounterRateLimitMs: config.encounterRateLimitMs ?? 3000,
      encounterCooldownTicks: config.encounterCooldownTicks ?? 15,
    };

    // Sub-managers
    this.characterRegistry = new CharacterRegistry();
    this.relationshipManager = new RelationshipManager();
    this.encounterManager = new EncounterManager({
      relationshipManager: this.relationshipManager,
      characterRegistry: this.characterRegistry,
      costTracker: this.config.costTracker,
    });
    this.needsManager = new NeedsManager();
    this.eventManager = new EventManager();
    this.taskManager = new TaskManager();

    // Configure encounter manager
    this.encounterManager.rateLimitMs = this.config.encounterRateLimitMs;
    this.encounterManager.cooldownTicks = this.config.encounterCooldownTicks;

    /** @type {object|null} simulator adapter implementing canEncounter, getEncounterContext, etc. */
    this.adapter = null;

    /** @type {number} current simulation tick */
    this.tick = 0;

    /** @type {string} running | paused | stopped */
    this.status = 'stopped';

    /** @type {Array<function>} event subscribers */
    this._subscribers = [];

    /** @type {number} total $ spent on AI calls */
    this._totalSpent = 0;
  }

  // ─── Adapter ──────────────────────────────────────────

  /**
   * Set the simulator adapter that bridges domain-specific logic.
   * Adapter should implement:
   *   canEncounter(id1, id2): boolean
   *   getEncounterContext(id1, id2): string
   *   onNeedUrgent(characterId, need, value): void
   *   onEvent(event): void
   */
  setAdapter(adapter) {
    this.adapter = adapter;
  }

  // ─── Character Management ─────────────────────────────

  /**
   * Add a character to the simulation.
   * Creates the character record, relationships, needs, and a SocialAgent.
   * @param {object} charData - character overrides (id, name, traits, etc.)
   * @returns {object} the created character
   */
  addCharacter(charData) {
    // Normalize character data: ensure traits and mood exist
    const normalized = {
      ...charData,
      traits: charData.traits || charData.baseTraits || { friendliness: 50, humor: 50, seriousness: 50, empathy: 50, assertiveness: 50 },
      mood: charData.mood ?? 50,
    };
    const character = this.characterRegistry.addCharacter(normalized);

    // Create relationships with all existing characters
    const existingIds = this.characterRegistry.getCharacterIds().filter(id => id !== character.id);
    this.relationshipManager.addCharacter(character.id, existingIds);

    // Register needs
    this.needsManager.register(character.id, character.needs);

    // Create a SocialAgent (independent AI mind)
    const agent = new SocialAgent(character, {
      model: this.config.model,
      anthropicClient: this.config.anthropicClient,
      costTracker: this.config.costTracker,
      characterRegistry: this.characterRegistry,
    });
    this.encounterManager.registerAgent(character.id, agent);

    return character;
  }

  /**
   * Remove a character from the simulation.
   */
  removeCharacter(id) {
    this.characterRegistry.removeCharacter(id);
    this.relationshipManager.removeCharacter(id);
    this.needsManager.unregister(id);
    this.encounterManager.unregisterAgent(id);
  }

  /**
   * Generate N random characters and add them.
   * @param {number} count
   * @param {Array<object>} [overrides] - per-character overrides
   * @returns {Array<object>} created characters
   */
  generateCharacters(count, overrides = []) {
    const characters = [];
    for (let i = 0; i < count; i++) {
      const charData = overrides[i] || {};
      characters.push(this.addCharacter(charData));
    }
    return characters;
  }

  // ─── Simulation Lifecycle ─────────────────────────────

  start() {
    if (this.status === 'running') return;
    this.status = 'running';
    log.info('Social engine started', { tick: this.tick });
    this._emit({ type: 'engine_start', tick: this.tick });
  }

  pause() {
    if (this.status !== 'running') return;
    this.status = 'paused';
    log.info('Social engine paused', { tick: this.tick });
    this._emit({ type: 'engine_pause', tick: this.tick });
  }

  resume() {
    if (this.status !== 'paused') return;
    this.status = 'running';
    log.info('Social engine resumed', { tick: this.tick });
    this._emit({ type: 'engine_resume', tick: this.tick });
  }

  stop() {
    this.status = 'stopped';
    log.info('Social engine stopped', { tick: this.tick });
    this._emit({ type: 'engine_stop', tick: this.tick });
  }

  // ─── Main Tick ────────────────────────────────────────

  /**
   * Advance the simulation by one tick.
   * Returns all events generated during this tick.
   * @param {object} [simulatorContext] - adapter-provided context (positions, zones, etc.)
   * @returns {Promise<Array<object>>}
   */
  async tickOnce(simulatorContext = {}) {
    if (this.status !== 'running') return [];

    this.tick++;
    const events = [];

    // 1. Advance needs
    const needEvents = this.needsManager.tick();
    for (const ne of needEvents) {
      events.push({ ...ne, tick: this.tick });
      // Notify adapter about urgent needs
      if (ne.type === 'need_urgent' && this.adapter) {
        this.adapter.onNeedUrgent(ne.characterId, ne.need, ne.value);
      }
    }

    // 2. Apply mood penalties from unmet needs
    for (const id of this.characterRegistry.getCharacterIds()) {
      const penalty = this.needsManager.getMoodPenalty(id);
      if (penalty < 0) {
        this.characterRegistry.adjustMood(id, penalty);
      }
    }

    // 2.5. Progress work tasks
    const taskContext = this.adapter ? {
      getCharacterZone: (id) => this.adapter.characterZones.get(id),
      getCharacterState: (id) => {
        const ch = this.characterRegistry.getCharacter(id);
        return ch ? ch.state : null;
      },
    } : {};
    const taskEvents = this.taskManager.tick(this.tick, taskContext);
    for (const te of taskEvents) {
      events.push({ ...te, tick: this.tick });
      // Apply mood boost on task completion
      if (te.type === 'task_completed' && te.task) {
        for (const charId of te.task.assignedTo) {
          this.characterRegistry.adjustMood(charId, te.task.completionMoodBoost || 5);
          this.characterRegistry.setState(charId, 'idle');
        }
      }
    }

    // 2.6. Apply mood drain from active work tasks
    for (const task of this.taskManager.getActiveTasks()) {
      for (const charId of task.assignedTo) {
        if (task.moodEffect) {
          this.characterRegistry.adjustMood(charId, task.moodEffect);
        }
      }
    }

    // 3. Process events (random triggers + expiration of active events)
    const eventResults = this.eventManager.tick(
      this.tick,
      { characterIds: this.characterRegistry.getCharacterIds() }
    );
    for (const evt of eventResults) {
      if (evt.action === 'start') {
        events.push({ type: 'event_start', event: evt, tick: this.tick });
        if (this.adapter) {
          this.adapter.onEvent(evt);
        }
      } else if (evt.action === 'end') {
        events.push({ type: 'event_end', event: evt, tick: this.tick });
      }
    }

    // 5. Check budget cap before encounters
    if (this._isOverBudget()) {
      return events;
    }

    // 6. Detect potential encounters via adapter
    if (this.adapter) {
      const potentialPairs = this.adapter.getEncounterCandidates
        ? this.adapter.getEncounterCandidates(this.tick)
        : [];
      for (const [id1, id2] of potentialPairs) {
        if (this.adapter.canEncounter(id1, id2)) {
          const themeContext = this.adapter.getEncounterContext(id1, id2);
          this.encounterManager.queueEncounter(id1, id2, this.tick, themeContext);
        }
      }
    }

    // 7. Process next queued encounter
    const activeEventsSummary = this.eventManager.getActiveEventsSummary();
    const encounterEvents = await this.encounterManager.processNext(
      this.tick,
      activeEventsSummary
    );
    events.push(...encounterEvents);

    // 8. Emit all events to subscribers
    for (const event of events) {
      this._emit(event);
    }

    return events;
  }

  // ─── God Mode / Manual Controls ───────────────────────

  /**
   * Force an encounter between two characters immediately.
   */
  async triggerEncounter(id1, id2) {
    const activeEventsSummary = this.eventManager.getActiveEventsSummary();
    const themeContext = this.adapter
      ? this.adapter.getEncounterContext(id1, id2)
      : '';
    const events = await this.encounterManager.forceEncounter(
      id1, id2, this.tick, themeContext, activeEventsSummary
    );
    for (const event of events) {
      this._emit(event);
    }
    return events;
  }

  /**
   * Inject a simulation event manually.
   */
  injectEvent(type, context = {}) {
    const event = this.eventManager.injectEvent(
      type,
      this.tick,
      context,
      { characterIds: this.characterRegistry.getCharacterIds() }
    );
    if (event) {
      this._emit({ type: 'event_start', event, tick: this.tick });
      if (this.adapter) {
        this.adapter.onEvent(event);
      }
    }
    return event;
  }

  /**
   * Set a character's mood directly.
   */
  setMood(characterId, mood) {
    this.characterRegistry.setMood(characterId, mood);
  }

  /**
   * Satisfy a character's need.
   */
  satisfyNeed(characterId, need) {
    this.needsManager.satisfy(characterId, need);
  }

  // ─── Queries ──────────────────────────────────────────

  getRelationship(fromId, toId) {
    return this.relationshipManager.getRelationship(fromId, toId);
  }

  getMutualRelationship(id1, id2) {
    return this.relationshipManager.getMutualRelationship(id1, id2);
  }

  getRelationshipsFor(id) {
    return this.relationshipManager.getRelationshipsFor(id);
  }

  getCharacterState(id) {
    const char = this.characterRegistry.getCharacter(id);
    if (!char) return null;
    return {
      ...char,
      needs: this.needsManager.getNeeds(id),
      relationships: this.relationshipManager.getRelationshipsFor(id),
    };
  }

  /**
   * Get full simulation state snapshot.
   */
  getState() {
    const characters = this.characterRegistry.getAllCharacters().map(ch => ({
      ...ch,
      needs: this.needsManager.getNeeds(ch.id),
    }));

    return {
      tick: this.tick,
      status: this.status,
      characters,
      relationships: this.relationshipManager.getState(),
      encounters: this.encounterManager.getState(),
      activeEvents: this.eventManager.activeEvents,
      totalSpent: this._totalSpent,
      ...this.taskManager.getState(),
    };
  }

  // ─── Event Subscription ───────────────────────────────

  /**
   * Subscribe to all engine events.
   * @param {function} callback - called with each event object
   * @returns {function} unsubscribe function
   */
  onEvent(callback) {
    this._subscribers.push(callback);
    return () => {
      this._subscribers = this._subscribers.filter(cb => cb !== callback);
    };
  }

  // ─── Internal ─────────────────────────────────────────

  _emit(event) {
    for (const cb of this._subscribers) {
      try {
        cb(event);
      } catch (err) {
        log.error('Event subscriber error', { error: err.message });
      }
    }
  }

  _isOverBudget() {
    if (!this.config.costTracker) return false;
    const spent = this.config.costTracker.getTotalCost
      ? this.config.costTracker.getTotalCost()
      : 0;
    this._totalSpent = spent;
    return spent >= this.config.budgetCap;
  }
}

module.exports = { SocialEngine };
