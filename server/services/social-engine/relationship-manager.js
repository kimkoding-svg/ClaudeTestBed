/**
 * Relationship Manager — directional relationship storage and evolution.
 *
 * Key design: A→B is a separate relationship from B→A.
 * A might trust B deeply while B barely knows A.
 * Memory notes are private per direction.
 */

const log = require('../../logger').child('RELATIONSHIPS');

class RelationshipManager {
  constructor() {
    /** @type {Map<string, object>} keyed by "fromId→toId" */
    this.relationships = new Map();
  }

  /**
   * Initialize all directional pairs for a set of character ids.
   */
  initializeAll(characterIds) {
    for (const from of characterIds) {
      for (const to of characterIds) {
        if (from === to) continue;
        this._ensureRelationship(from, to);
      }
    }
  }

  /**
   * Add relationships for a new character joining the simulation.
   */
  addCharacter(newId, existingIds) {
    for (const otherId of existingIds) {
      if (otherId === newId) continue;
      this._ensureRelationship(newId, otherId);
      this._ensureRelationship(otherId, newId);
    }
  }

  /**
   * Remove all relationships involving a character.
   */
  removeCharacter(removedId) {
    for (const key of this.relationships.keys()) {
      if (key.startsWith(removedId + '→') || key.endsWith('→' + removedId)) {
        this.relationships.delete(key);
      }
    }
  }

  /**
   * Get the directional relationship from → to.
   */
  getRelationship(fromId, toId) {
    return this._ensureRelationship(fromId, toId);
  }

  /**
   * Get both directions for a pair: { aToB, bToA }.
   */
  getMutualRelationship(id1, id2) {
    return {
      aToB: this.getRelationship(id1, id2),
      bToA: this.getRelationship(id2, id1),
    };
  }

  /**
   * Get all relationships FROM a specific character (their view of everyone).
   */
  getRelationshipsFor(fromId) {
    const result = {};
    for (const [key, rel] of this.relationships) {
      if (key.startsWith(fromId + '→')) {
        result[rel.toId] = rel;
      }
    }
    return result;
  }

  /**
   * Update a relationship after an encounter.
   * @param {string} fromId - the character whose view is being updated
   * @param {string} toId - the other character
   * @param {number} sentiment - the encounter sentiment from this character's perspective (-1 to +1)
   * @param {string} [memoryNote] - AI-generated memory note from this character's perspective
   */
  updateAfterEncounter(fromId, toId, sentiment, memoryNote) {
    const rel = this._ensureRelationship(fromId, toId);
    const oldRapport = this.getRapportLevel(fromId, toId);

    // Sentiment affects relationship dimensions
    const delta = sentiment * 5; // scale -1..+1 to -5..+5
    rel.trust = clamp(rel.trust + delta * 0.8, 0, 100);
    rel.liking = clamp(rel.liking + delta * 1.0, 0, 100);
    rel.respect = clamp(rel.respect + delta * 0.5, 0, 100);
    rel.familiarity = clamp(rel.familiarity + 2, 0, 100); // always increases

    // Track sentiment history
    rel.recentSentiments.push(sentiment);
    if (rel.recentSentiments.length > 10) rel.recentSentiments.shift();

    rel.interactionCount++;
    rel.lastInteraction = Date.now();

    // Store memory note (FIFO, max 10)
    if (memoryNote) {
      rel.memoryNotes.push(memoryNote);
      if (rel.memoryNotes.length > 10) rel.memoryNotes.shift();
    }

    const newRapport = this.getRapportLevel(fromId, toId);
    if (oldRapport !== newRapport) {
      log.info('Rapport changed', { from: fromId, to: toId, oldRapport, newRapport, familiarity: Math.round(rel.familiarity) });
    }

    return rel;
  }

  /**
   * Get the rapport level label for display.
   */
  getRapportLevel(fromId, toId) {
    const rel = this.getRelationship(fromId, toId);
    const f = rel.familiarity;
    if (f >= 50) return 'close friend';
    if (f >= 30) return 'friend';
    if (f >= 15) return 'acquaintance';
    if (f >= 5) return 'colleague';
    return 'stranger';
  }

  /**
   * Get context string for an agent's system prompt —
   * their view of all other characters they know.
   */
  getRelationshipContext(fromId) {
    const rels = this.getRelationshipsFor(fromId);
    const lines = [];
    for (const [toId, rel] of Object.entries(rels)) {
      if (rel.familiarity < 1 && rel.interactionCount === 0) continue; // skip total strangers
      const rapport = this.getRapportLevel(fromId, toId);
      let line = `- ${toId}: ${rapport} (trust:${Math.round(rel.trust)} liking:${Math.round(rel.liking)} respect:${Math.round(rel.respect)})`;
      if (rel.memoryNotes.length > 0) {
        const recent = rel.memoryNotes.slice(-3);
        line += `\n  Recent memories: ${recent.join('; ')}`;
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  /**
   * Check behavioral triggers (for the adapter to use).
   */
  shouldSeekProximity(fromId, toId) {
    const rel = this.getRelationship(fromId, toId);
    return rel.liking > 70;
  }

  shouldAvoid(fromId, toId) {
    const rel = this.getRelationship(fromId, toId);
    return rel.liking < 25 && rel.familiarity > 5;
  }

  /**
   * Return full serialisable state.
   */
  getState() {
    const all = [];
    for (const [key, rel] of this.relationships) {
      all.push({ key, ...rel });
    }
    return all;
  }

  // ─── Internal ─────────────────────────────────────────

  _key(fromId, toId) {
    return `${fromId}→${toId}`;
  }

  _ensureRelationship(fromId, toId) {
    const key = this._key(fromId, toId);
    if (!this.relationships.has(key)) {
      this.relationships.set(key, {
        fromId,
        toId,
        trust: 50,       // neutral start
        liking: 50,       // neutral start
        respect: 50,      // neutral start
        familiarity: 0,   // starts at 0 — they don't know each other
        interactionCount: 0,
        recentSentiments: [],
        memoryNotes: [],
        lastInteraction: null,
      });
    }
    return this.relationships.get(key);
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

module.exports = { RelationshipManager };
