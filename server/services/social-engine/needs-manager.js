/**
 * Needs Manager — tracks human needs per character (bladder, hunger, thirst).
 *
 * Simulator-agnostic: emits events when needs become urgent,
 * but does NOT decide where characters go — the adapter handles that.
 */

const DEFAULT_CONFIG = {
  // Rise rates per tick (1 tick ≈ 1 simulated minute)
  bladderRate: 0.15,    // ~80 in ~9 hours (540 min)
  hungerRate: 0.10,     // ~80 in ~13 hours
  thirstRate: 0.20,     // ~80 in ~7 hours

  // Thresholds that trigger urgent events
  bladderUrgent: 80,
  hungerUrgent: 70,
  thirstUrgent: 75,

  // Mood penalty per tick when a need is above urgent threshold
  moodPenaltyPerTick: 0.3,
};

const log = require('../../logger').child('NEEDS');

class NeedsManager {
  /**
   * @param {object} [config] - override default rates/thresholds
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    /** @type {Map<string, object>} characterId → needs state */
    this.needs = new Map();
    /** @type {Set<string>} track which needs are currently urgent (to avoid repeat events) */
    this._urgentFlags = new Set(); // "charId:need"
  }

  /**
   * Register a character's initial needs.
   */
  register(characterId, initialNeeds = {}) {
    this.needs.set(characterId, {
      bladder: initialNeeds.bladder || 0,
      hunger: initialNeeds.hunger || 0,
      thirst: initialNeeds.thirst || 0,
    });
  }

  /**
   * Remove a character (left the simulation).
   */
  unregister(characterId) {
    this.needs.delete(characterId);
    // Clean up urgent flags
    for (const key of this._urgentFlags) {
      if (key.startsWith(characterId + ':')) this._urgentFlags.delete(key);
    }
  }

  /**
   * Process one tick: increase needs, return events for any that became urgent.
   * @returns {Array<{type: string, characterId: string, need: string, value: number}>}
   */
  tick() {
    const events = [];
    const cfg = this.config;

    for (const [charId, needs] of this.needs) {
      // Increase needs
      needs.bladder = Math.min(100, needs.bladder + cfg.bladderRate);
      needs.hunger = Math.min(100, needs.hunger + cfg.hungerRate);
      needs.thirst = Math.min(100, needs.thirst + cfg.thirstRate);

      // Check each need for urgency
      for (const [need, threshold] of [
        ['bladder', cfg.bladderUrgent],
        ['hunger', cfg.hungerUrgent],
        ['thirst', cfg.thirstUrgent],
      ]) {
        const flag = `${charId}:${need}`;
        if (needs[need] >= threshold && !this._urgentFlags.has(flag)) {
          this._urgentFlags.add(flag);
          log.info('Urgent need', { characterId: charId, need, value: Math.round(needs[need]) });
          events.push({
            type: 'need_urgent',
            characterId: charId,
            need,
            value: needs[need],
          });
        }
      }
    }

    return events;
  }

  /**
   * Satisfy a need (character went to bathroom, ate, drank).
   */
  satisfy(characterId, need) {
    const needs = this.needs.get(characterId);
    if (!needs) return;
    needs[need] = Math.max(0, needs[need] - 80); // drop significantly but not always to 0
    this._urgentFlags.delete(`${characterId}:${need}`);
  }

  /**
   * Get needs for a character.
   */
  getNeeds(characterId) {
    return this.needs.get(characterId) || null;
  }

  /**
   * Calculate mood penalty for a character based on unmet needs.
   * Returns negative number (penalty) or 0.
   */
  getMoodPenalty(characterId) {
    const needs = this.needs.get(characterId);
    if (!needs) return 0;

    let penalty = 0;
    const cfg = this.config;
    if (needs.bladder >= cfg.bladderUrgent) penalty -= cfg.moodPenaltyPerTick;
    if (needs.hunger >= cfg.hungerUrgent) penalty -= cfg.moodPenaltyPerTick;
    if (needs.thirst >= cfg.thirstUrgent) penalty -= cfg.moodPenaltyPerTick;
    return penalty;
  }

  /**
   * Return serialisable state.
   */
  getState() {
    const result = {};
    for (const [id, needs] of this.needs) {
      result[id] = { ...needs };
    }
    return result;
  }
}

module.exports = { NeedsManager };
