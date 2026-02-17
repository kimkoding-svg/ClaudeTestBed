/**
 * Event Manager — random and manually injected simulation events.
 *
 * Simulator-agnostic: provides a registry for event types that themes
 * can register. Built-in events are generic (birthday, sickness, celebration).
 * Each theme registers its own (office: toilet_clog, xmas_party, etc.).
 */

const log = require('../../logger').child('EVENTS');

class EventManager {
  constructor() {
    /** @type {Map<string, object>} registered event type definitions */
    this.eventTypes = new Map();
    /** @type {Array<object>} currently active events */
    this.activeEvents = [];
    /** @type {number} next event id counter */
    this._nextId = 1;
    /** @type {number} ticks since last random event check */
    this._ticksSinceRandom = 0;
    /** @type {number} minimum ticks between random events */
    this.randomEventCooldown = 60; // ~1 sim hour

    // Register built-in event types
    this._registerBuiltins();
  }

  /**
   * Register an event type that can be fired randomly or injected.
   * @param {string} type - unique event type id
   * @param {object} def - event definition
   * @param {string} def.name - display name
   * @param {string} def.description - what happens
   * @param {number} def.duration - how long the event lasts (in ticks)
   * @param {number} def.probability - chance per cooldown window (0-1)
   * @param {function} [def.onStart] - callback(characters, context) when event starts
   * @param {function} [def.onEnd] - callback(characters, context) when event ends
   * @param {string[]} [def.affectedZones] - theme-specific zone ids affected
   */
  registerEventType(type, def) {
    this.eventTypes.set(type, {
      type,
      name: def.name || type,
      description: def.description || '',
      duration: def.duration || 30,
      probability: def.probability || 0.05,
      onStart: def.onStart || null,
      onEnd: def.onEnd || null,
      affectedZones: def.affectedZones || [],
      ...def,
    });
  }

  /**
   * Process one tick: check for random events, progress active events.
   * @param {number} tick - current simulation tick
   * @param {object} context - { characters, getCharacterIds(), etc }
   * @returns {Array<object>} events that started or ended this tick
   */
  tick(tick, context) {
    const events = [];

    // Progress active events — remove expired ones
    const expired = [];
    for (const evt of this.activeEvents) {
      if (tick >= evt.startTick + evt.duration) {
        expired.push(evt);
        events.push({ ...evt, action: 'end' });
        // Call onEnd handler
        const def = this.eventTypes.get(evt.type);
        if (def && def.onEnd) {
          try { def.onEnd(context); } catch (e) { /* ignore handler errors */ }
        }
      }
    }
    this.activeEvents = this.activeEvents.filter(e => !expired.includes(e));

    // Random event check
    this._ticksSinceRandom++;
    if (this._ticksSinceRandom >= this.randomEventCooldown) {
      this._ticksSinceRandom = 0;
      const triggered = this._rollRandomEvent(tick, context);
      if (triggered) {
        events.push({ ...triggered, action: 'start' });
      }
    }

    return events;
  }

  /**
   * Manually inject an event (god-mode).
   * @param {string} type - registered event type
   * @param {number} tick - current tick
   * @param {object} context
   * @param {object} [overrides] - override duration, description, etc.
   * @returns {object|null} the created event, or null if type not found
   */
  injectEvent(type, tick, context, overrides = {}) {
    const def = this.eventTypes.get(type);
    if (!def) return null;

    const evt = {
      id: `evt_${this._nextId++}`,
      type: def.type,
      name: overrides.name || def.name,
      description: overrides.description || def.description,
      startTick: tick,
      duration: overrides.duration || def.duration,
      affectedZones: overrides.affectedZones || def.affectedZones,
    };

    this.activeEvents.push(evt);
    log.info('Event injected', { type: def.type, name: evt.name, duration: evt.duration });

    // Call onStart handler
    if (def.onStart) {
      try { def.onStart(context, evt); } catch (e) { /* ignore */ }
    }

    return evt;
  }

  /**
   * Check if a specific event type is currently active.
   */
  isEventActive(type) {
    return this.activeEvents.some(e => e.type === type);
  }

  /**
   * Get active events for prompt context.
   */
  getActiveEventsSummary() {
    return this.activeEvents.map(e => `${e.name}: ${e.description}`).join('. ');
  }

  /**
   * Get all registered event type names (for UI).
   */
  getRegisteredTypes() {
    return Array.from(this.eventTypes.values()).map(d => ({
      type: d.type,
      name: d.name,
      description: d.description,
    }));
  }

  /**
   * Return serialisable state.
   */
  getState() {
    return {
      activeEvents: this.activeEvents.map(e => ({ ...e })),
      registeredTypes: this.getRegisteredTypes(),
    };
  }

  // ─── Internal ─────────────────────────────────────────

  _rollRandomEvent(tick, context) {
    // Collect eligible event types (not currently active)
    const candidates = [];
    for (const [type, def] of this.eventTypes) {
      if (this.isEventActive(type)) continue;
      candidates.push(def);
    }

    // Roll probability for each candidate
    for (const def of candidates) {
      if (Math.random() < def.probability) {
        return this.injectEvent(def.type, tick, context);
      }
    }
    return null;
  }

  _registerBuiltins() {
    this.registerEventType('birthday', {
      name: 'Birthday Celebration',
      description: 'Someone is celebrating their birthday today!',
      duration: 60, // 1 sim hour
      probability: 0.02,
    });

    this.registerEventType('celebration', {
      name: 'Team Celebration',
      description: 'The team is celebrating an achievement.',
      duration: 30,
      probability: 0.01,
    });

    this.registerEventType('sickness', {
      name: 'Someone Called in Sick',
      description: 'A team member is feeling unwell and went home.',
      duration: 480, // rest of the day
      probability: 0.02,
    });

    this.registerEventType('new_arrival', {
      name: 'New Person Arrived',
      description: 'A new face has joined the group.',
      duration: 0, // instant — permanent change
      probability: 0.005,
    });
  }
}

module.exports = { EventManager };
