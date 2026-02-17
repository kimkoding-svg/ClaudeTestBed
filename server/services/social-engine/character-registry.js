/**
 * Character Registry — stores and manages all characters in the social simulation.
 *
 * Simulator-agnostic: knows about personality traits, mood, and state,
 * but nothing about offices, pixels, or positions.
 */

const FIRST_NAMES_M = [
  'James', 'Marcus', 'David', 'Chen', 'Omar', 'Lucas', 'Raj', 'Felix',
  'Andre', 'Kenji', 'Noah', 'Ethan', 'Viktor', 'Hassan', 'Diego',
];
const FIRST_NAMES_F = [
  'Alice', 'Sofia', 'Priya', 'Maya', 'Luna', 'Zara', 'Ingrid', 'Yuki',
  'Grace', 'Fatima', 'Clara', 'Elena', 'Nia', 'Harper', 'Mei',
];
const LAST_NAMES = [
  'Chen', 'Smith', 'Patel', 'Garcia', 'Kim', 'Brown', 'Müller', 'Santos',
  'Wilson', 'Nakamura', 'Davis', 'Lee', 'Okafor', 'Ross', 'Johansson',
  'Reyes', 'Park', 'Taylor', 'Ahmed', 'Petrov',
];

const SKIN_TONES = ['#f5d0a9', '#d4a574', '#c49a6c', '#e8b88a', '#a0724a', '#8d5e3c'];
const HAIR_COLORS = ['#1a1a2e', '#4a2800', '#8b4513', '#2d1b00', '#5c2d00', '#d4a017', '#3d0c02', '#1a1a1a', '#c0392b'];
const OUTFIT_COLORS = [
  '#3b82f6', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899', '#f97316',
  '#14b8a6', '#6366f1', '#f59e0b', '#06b6d4', '#d946ef', '#84cc16',
  '#e11d48', '#0ea5e9', '#a855f7',
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const log = require('../../logger').child('CHAR-REGISTRY');

class CharacterRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this.characters = new Map();
    this._usedNames = new Set();
  }

  /**
   * Generate a random character with unique name and randomised traits.
   * @param {string} id
   * @param {object} [overrides] - partial character data to merge
   * @returns {object} the created character
   */
  generateCharacter(id, overrides = {}) {
    const gender = Math.random() < 0.5 ? 'M' : 'F';
    const firstName = this._pickUniqueName(gender);
    const lastName = pick(LAST_NAMES);
    const name = `${firstName} ${lastName}`;

    const primary = pick(OUTFIT_COLORS);
    // Secondary: slightly different from primary
    let secondary = pick(OUTFIT_COLORS);
    while (secondary === primary) secondary = pick(OUTFIT_COLORS);

    const character = {
      id,
      name,
      gender,
      appearance: {
        spriteColors: {
          primary,
          secondary,
          skin: pick(SKIN_TONES),
          hair: pick(HAIR_COLORS),
        },
        gender,
      },
      traits: {
        friendliness: rand(15, 90),
        humor: rand(10, 95),
        seriousness: rand(10, 90),
        empathy: rand(15, 90),
        assertiveness: rand(10, 85),
      },
      mood: rand(45, 80),
      needs: { bladder: rand(0, 20), hunger: rand(0, 25), thirst: rand(0, 30) },
      state: 'idle', // idle | talking | busy (simulator maps to more specific states)
      isTemp: false,
      stats: {
        socialInteractions: 0,
        memorableMoments: 0,
      },
      ...overrides,
    };

    this.characters.set(id, character);
    log.info('Character generated', { id, name, gender });
    return character;
  }

  /**
   * Add a pre-built character (e.g. from saved state or manual creation).
   */
  addCharacter(character) {
    // Ensure defaults for required fields
    if (!character.state) character.state = 'idle';
    if (character.mood === undefined) character.mood = 50;
    if (!character.needs) character.needs = { bladder: 0, hunger: 0, thirst: 0 };
    this.characters.set(character.id, character);
    this._usedNames.add(character.name.split(' ')[0]);
    log.debug('Character registered', { id: character.id, name: character.name });
    return character;
  }

  /**
   * Remove a character by id.
   */
  removeCharacter(id) {
    const ch = this.characters.get(id);
    if (ch) {
      log.info('Character removed', { id, name: ch.name });
      this._usedNames.delete(ch.name.split(' ')[0]);
      this.characters.delete(id);
    }
    return ch;
  }

  getCharacter(id) {
    return this.characters.get(id) || null;
  }

  getAllCharacters() {
    return Array.from(this.characters.values());
  }

  getCharacterIds() {
    return Array.from(this.characters.keys());
  }

  /**
   * Update mood for a character. Clamps 0-100.
   */
  setMood(id, mood) {
    const ch = this.characters.get(id);
    if (ch) ch.mood = Math.max(0, Math.min(100, mood));
  }

  /**
   * Adjust mood by delta. Clamps 0-100.
   */
  adjustMood(id, delta) {
    const ch = this.characters.get(id);
    if (ch) ch.mood = Math.max(0, Math.min(100, ch.mood + delta));
  }

  /**
   * Set character state (idle, talking, busy).
   */
  setState(id, state) {
    const ch = this.characters.get(id);
    if (ch) ch.state = state;
  }

  /**
   * Get a summary of a character suitable for another agent's prompt context.
   * Does NOT include the character's private relationship data.
   */
  getPublicSummary(id) {
    const ch = this.characters.get(id);
    if (!ch) return null;
    return {
      id: ch.id,
      name: ch.name,
      gender: ch.gender,
      traits: { ...ch.traits },
      mood: ch.mood,
      state: ch.state,
      isTemp: ch.isTemp,
    };
  }

  /**
   * Pick a first name not yet used by another character.
   */
  _pickUniqueName(gender) {
    const pool = gender === 'M' ? FIRST_NAMES_M : FIRST_NAMES_F;
    const available = pool.filter(n => !this._usedNames.has(n));
    const name = available.length > 0 ? pick(available) : pick(pool); // fallback if all used
    this._usedNames.add(name);
    return name;
  }

  /**
   * Return serialisable snapshot of all characters.
   */
  getState() {
    return this.getAllCharacters().map(ch => ({ ...ch }));
  }
}

module.exports = { CharacterRegistry };
