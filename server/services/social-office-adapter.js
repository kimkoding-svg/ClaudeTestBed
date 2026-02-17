/**
 * Social Office Adapter — bridges the office theme with the reusable social engine.
 *
 * Manages: positions, movement, schedules, zone-based encounter detection.
 * Implements the SocialEngineAdapter interface:
 *   canEncounter(id1, id2): boolean
 *   getEncounterContext(id1, id2): string
 *   getEncounterCandidates(tick): Array<[string, string]>
 *   onNeedUrgent(characterId, need, value): void
 *   onEvent(event): void
 */

const { STATIONERY_WORK_TASKS } = require('./social-engine/work-task-definitions');
const log = require('../logger').child('OFFICE-ADAPTER');

// ─── Zone Definitions (mirror frontend TileMap.ts) ──────

const ZONES = [
  { id: 'entrance',       name: 'Entrance',        type: 'entrance',    center: { x: 3, y: 2 },   capacity: 20 },
  { id: 'desk_area_1',    name: 'Desk Area 1',     type: 'desk',        center: { x: 9, y: 6 },   capacity: 4 },
  { id: 'desk_area_2',    name: 'Desk Area 2',     type: 'desk',        center: { x: 16, y: 6 },  capacity: 4 },
  { id: 'meeting_a',      name: 'Meeting Room A',  type: 'meeting',     center: { x: 24, y: 6 },  capacity: 6 },
  { id: 'kitchen_top',    name: 'Kitchenette',     type: 'kitchen',     center: { x: 31, y: 6 },  capacity: 3 },
  { id: 'water_cooler',   name: 'Water Cooler',    type: 'watercooler', center: { x: 36, y: 5 },  capacity: 3 },
  { id: 'breakroom',      name: 'Break Room',      type: 'breakroom',   center: { x: 9, y: 15 },  capacity: 10 },
  { id: 'kitchen',        name: 'Kitchen',         type: 'kitchen',     center: { x: 23, y: 15 }, capacity: 6 },
  { id: 'bathroom',       name: 'Bathroom',        type: 'bathroom',    center: { x: 34, y: 15 }, capacity: 4 },
  { id: 'desk_area_3',    name: 'Desk Area 3',     type: 'desk',        center: { x: 9, y: 24 },  capacity: 4 },
  { id: 'desk_area_4',    name: 'Desk Area 4',     type: 'desk',        center: { x: 17, y: 24 }, capacity: 4 },
  { id: 'meeting_b',      name: 'Meeting Room B',  type: 'meeting',     center: { x: 27, y: 24 }, capacity: 10 },
  { id: 'corridor_main',  name: 'Main Corridor',   type: 'corridor',    center: { x: 20, y: 11 }, capacity: 20 },
  { id: 'corridor_bottom',name: 'Bottom Corridor',  type: 'corridor',   center: { x: 20, y: 20 }, capacity: 20 },
];

const ZONE_MAP = new Map(ZONES.map(z => [z.id, z]));

// ─── Zone Routing (waypoint-based, avoids walls) ────────

// Each zone's exit path: waypoints to walk FROM zone center TO the nearest corridor.
// The entry path is the reverse. The main corridor is at y=11, bottom corridor at y=28.
// Vertical connections use the left corridor at x=3 (walkable y=1 to y=28).
const ZONE_EXIT_PATH = {
  entrance:       [{ x: 3, y: 3 }, { x: 3, y: 11 }],
  desk_area_1:    [{ x: 9, y: 10 }, { x: 9, y: 11 }],
  desk_area_2:    [{ x: 16, y: 10 }, { x: 16, y: 11 }],
  meeting_a:      [{ x: 23, y: 10 }, { x: 23, y: 11 }],
  kitchen_top:    [{ x: 31, y: 10 }, { x: 31, y: 11 }],
  water_cooler:   [{ x: 36, y: 10 }, { x: 36, y: 11 }],
  breakroom:      [{ x: 3, y: 15 }, { x: 3, y: 11 }],
  kitchen:        [{ x: 16, y: 15 }, { x: 16, y: 11 }],
  bathroom:       [{ x: 29, y: 15 }, { x: 29, y: 11 }],
  desk_area_3:    [{ x: 9, y: 28 }],
  desk_area_4:    [{ x: 17, y: 28 }],
  meeting_b:      [{ x: 26, y: 28 }],
  corridor_main:  [],
  corridor_bottom:[{ x: 3, y: 20 }],
};

// ─── Schedule Definitions ───────────────────────────────

// Simulated time: each tick ≈ 1 minute, 540 ticks ≈ 9-hour day
// Hour offsets based on schedule type
const SCHEDULE_OFFSETS = {
  early: -60,   // arrives 1 hour early
  normal: 0,
  late: 60,     // arrives 1 hour late
};

/**
 * Default daily schedule blocks (relative to 9:00 AM = tick 0).
 * Each block: { startTick, endTick, zone: zoneId or 'assigned_desk' }
 */
const DAILY_SCHEDULE = [
  { start: 0,   end: 30,  zone: 'entrance' },           // 9:00 - arrive
  { start: 30,  end: 150, zone: 'assigned_desk' },       // 9:30 - morning work
  { start: 150, end: 180, zone: 'water_cooler' },        // 11:30 - morning break
  { start: 180, end: 270, zone: 'assigned_desk' },       // 12:00 - work
  { start: 270, end: 330, zone: 'breakroom' },            // 13:30 - lunch
  { start: 330, end: 390, zone: 'assigned_desk' },       // 14:30 - afternoon work
  { start: 390, end: 420, zone: 'kitchen' },              // 15:30 - coffee break
  { start: 420, end: 510, zone: 'assigned_desk' },       // 16:00 - evening work
  { start: 510, end: 540, zone: 'entrance' },             // 17:30 - leaving
];

class SocialOfficeAdapter {
  /**
   * @param {object} socialEngine - SocialEngine instance
   */
  constructor(socialEngine) {
    this.engine = socialEngine;

    /** @type {Map<string, object>} characterId → position and movement state */
    this.positions = new Map();

    /** @type {Map<string, object>} characterId → office-specific data (assignedDesk, schedule) */
    this.characterData = new Map();

    /** @type {Map<string, string>} characterId → current zoneId */
    this.characterZones = new Map();

    /** @type {Map<string, string>} characterId → target zoneId (when moving) */
    this.targetZones = new Map();

    /** @type {Map<string, {waypoints: Array, index: number}>} characterId → waypoint movement state */
    this.characterWaypoints = new Map();

    /** @type {number} encounter proximity distance (tiles) */
    this.encounterDistance = 3;

    // Register self as adapter
    this.engine.setAdapter(this);

    // Register office-specific events
    this._registerOfficeEvents();

    // Register stationery work task types
    this._registerWorkTasks();

    /** @type {number} throttle auto-assign to every N ticks */
    this._autoAssignInterval = 10;
  }

  // ─── Character Setup ──────────────────────────────────

  /**
   * Add an office character to the simulation.
   * @param {object} charDef - from social-characters.js
   */
  addCharacter(charDef) {
    const character = this.engine.addCharacter(charDef);
    const zone = ZONE_MAP.get(charDef.assignedZone || 'desk_area_1');
    const center = zone ? zone.center : { x: 20, y: 11 };

    // Store office-specific data
    this.characterData.set(character.id, {
      assignedZone: charDef.assignedZone || 'desk_area_1',
      schedule: charDef.schedule || 'normal',
    });

    // Set initial position at their assigned desk
    this.positions.set(character.id, {
      x: center.x + (Math.random() * 2 - 1),
      y: center.y + (Math.random() * 2 - 1),
      direction: 'down',
    });

    this.characterZones.set(character.id, charDef.assignedZone || 'desk_area_1');

    log.info('Character added to office', { id: character.id, name: character.name, zone: charDef.assignedZone || 'desk_area_1' });
    return character;
  }

  // ─── Tick / Movement ──────────────────────────────────

  /**
   * Called each tick to update positions and schedule-based movement.
   * @param {number} tick - current tick
   */
  updatePositions(tick) {
    for (const [charId, data] of this.characterData) {
      const charState = this.engine.characterRegistry.getCharacter(charId);
      if (!charState) continue;

      // Skip characters that are talking
      if (charState.state === 'talking') continue;

      // Determine where the character should be based on schedule
      const scheduledZone = this._getScheduledZone(charId, tick);

      // Check if need overrides schedule
      const needOverride = this._getNeedOverrideZone(charId);

      // Check if character has an active task that determines zone
      const activeTask = this.engine.taskManager.getCharacterTask(charId);
      const taskZone = activeTask ? activeTask.zone : null;

      // Priority: need > task > schedule
      const finalTarget = needOverride || taskZone || scheduledZone;

      const currentZone = this.characterZones.get(charId);

      // If not where they should be, start moving
      if (currentZone !== finalTarget) {
        if (!this.targetZones.has(charId) || this.targetZones.get(charId) !== finalTarget) {
          this._startMoving(charId, finalTarget);
        }
      } else if (activeTask && currentZone === activeTask.zone && charState.state === 'idle') {
        // Already at task zone — switch to working
        this.engine.characterRegistry.setState(charId, 'working');
      }

      // Process waypoint-based movement
      const wpData = this.characterWaypoints.get(charId);
      if (wpData) {
        if (wpData.index >= wpData.waypoints.length) {
          // All waypoints reached — arrived at destination
          this.characterWaypoints.delete(charId);
          const target = this.targetZones.get(charId);
          this.targetZones.delete(charId);
          this.characterZones.set(charId, target);

          // If we arrived at a need-satisfying zone, satisfy the need
          this._checkNeedSatisfaction(charId, target);

          // If character has an active task at this zone, set to working
          const charTask = this.engine.taskManager.getCharacterTask(charId);
          if (charTask && charTask.zone === target) {
            this.engine.characterRegistry.setState(charId, 'working');
          } else {
            this.engine.characterRegistry.setState(charId, 'idle');
          }
        } else {
          // Follow waypoints
          this._interpolatePosition(charId);
          this.engine.characterRegistry.setState(charId, 'busy');
        }
      } else if (!activeTask && charState.state === 'idle') {
        // Character just became idle and finished a need — try to resume interrupted task
        const resumed = this.engine.taskManager.resumeInterruptedTask(charId, tick);
        if (resumed) {
          // Will start moving to task zone on next tick
        }
      }
    }

    // Auto-assign work tasks to idle characters during work blocks
    this._autoAssignWork(tick);
  }

  // ─── Adapter Interface (called by SocialEngine) ───────

  /**
   * Can these two characters have an encounter?
   */
  canEncounter(id1, id2) {
    const zone1 = this.characterZones.get(id1);
    const zone2 = this.characterZones.get(id2);

    // Must be in same zone
    if (zone1 !== zone2) return false;

    // No encounters in bathroom or corridors
    const zone = ZONE_MAP.get(zone1);
    if (!zone) return false;
    if (zone.type === 'bathroom' || zone.type === 'corridor') return false;

    // Both must be idle (not working, talking, or busy)
    const char1 = this.engine.characterRegistry.getCharacter(id1);
    const char2 = this.engine.characterRegistry.getCharacter(id2);
    if (!char1 || !char2) return false;
    if (char1.state !== 'idle' || char2.state !== 'idle') return false;

    // Characters with active tasks cannot encounter
    if (this.engine.taskManager.getCharacterTask(id1)) return false;
    if (this.engine.taskManager.getCharacterTask(id2)) return false;

    // Must not be in transit
    if (this.characterWaypoints.has(id1) || this.characterWaypoints.has(id2)) return false;

    return true;
  }

  /**
   * Get context string for an encounter between two characters.
   */
  getEncounterContext(id1, id2) {
    const zone1 = this.characterZones.get(id1);
    const zone = ZONE_MAP.get(zone1);
    const zoneName = zone ? zone.name : 'the office';
    const zoneType = zone ? zone.type : 'unknown';

    // Time of day context
    const tick = this.engine.tick;
    const timeLabel = this._getTimeLabel(tick);

    const contextParts = [`Location: ${zoneName}`];

    switch (zoneType) {
      case 'desk':
        contextParts.push('Both are at their desks, working.');
        break;
      case 'breakroom':
        contextParts.push('They\'re in the break room, relaxing.');
        break;
      case 'kitchen':
        contextParts.push('They\'re in the kitchen area, getting food or coffee.');
        break;
      case 'watercooler':
        contextParts.push('They\'re at the water cooler — classic spot for office chat.');
        break;
      case 'meeting':
        contextParts.push('They\'re in a meeting room.');
        break;
      case 'entrance':
        contextParts.push('They\'re near the entrance, arriving or leaving.');
        break;
    }

    contextParts.push(`Time: ${timeLabel}`);

    return contextParts.join(' ');
  }

  /**
   * Get all pairs of characters that could potentially encounter.
   * @returns {Array<[string, string]>}
   */
  getEncounterCandidates(tick) {
    const pairs = [];
    const zoneOccupants = new Map();

    // Group characters by zone
    for (const [charId, zoneId] of this.characterZones) {
      if (!zoneOccupants.has(zoneId)) {
        zoneOccupants.set(zoneId, []);
      }
      zoneOccupants.get(zoneId).push(charId);
    }

    // Generate pairs for characters in same zone
    for (const [zoneId, occupants] of zoneOccupants) {
      if (occupants.length < 2) continue;
      for (let i = 0; i < occupants.length; i++) {
        for (let j = i + 1; j < occupants.length; j++) {
          pairs.push([occupants[i], occupants[j]]);
        }
      }
    }

    return pairs;
  }

  /**
   * Handle urgent need — route character to appropriate zone.
   */
  onNeedUrgent(characterId, need, value) {
    // Interrupt any active task
    const activeTask = this.engine.taskManager.getCharacterTask(characterId);
    if (activeTask) {
      this.engine.taskManager.interruptTask(activeTask.id, `need_${need}`);
      this.engine.characterRegistry.setState(characterId, 'idle');
    }

    let targetZone;
    switch (need) {
      case 'bladder':
        targetZone = 'bathroom';
        break;
      case 'hunger':
        targetZone = 'kitchen';
        break;
      case 'thirst':
        targetZone = Math.random() > 0.5 ? 'water_cooler' : 'kitchen_top';
        break;
    }
    if (targetZone) {
      log.debug('Need override', { characterId, need, value: Math.round(value), targetZone });
      this._startMoving(characterId, targetZone);
    }
  }

  /**
   * Handle simulation event.
   */
  onEvent(event) {
    log.info('Office event', { type: event.type, name: event.name });
    // Office-specific event handling
    switch (event.type) {
      case 'birthday':
        // Move the birthday character to breakroom
        if (event.targetId) {
          this._startMoving(event.targetId, 'breakroom');
        }
        break;
      case 'company_meeting':
        // Interrupt all tasks and move everyone to meeting room B
        this.engine.taskManager.interruptAll('company_meeting');
        for (const charId of this.characterData.keys()) {
          this.engine.characterRegistry.setState(charId, 'idle');
          this._startMoving(charId, 'meeting_b');
        }
        break;
      case 'fire_drill':
        // Interrupt all tasks and move everyone to entrance
        this.engine.taskManager.interruptAll('fire_drill');
        for (const charId of this.characterData.keys()) {
          this.engine.characterRegistry.setState(charId, 'idle');
          this._startMoving(charId, 'entrance');
        }
        break;
      case 'toilet_clog':
        // Bathroom unavailable — characters needing bathroom go to kitchen
        // (handled by _getNeedOverrideZone checking active events)
        break;
    }
  }

  // ─── State ────────────────────────────────────────────

  /**
   * Get the full office state for sending to frontend via SSE.
   */
  getOfficeState() {
    const engineState = this.engine.getState();
    const characters = engineState.characters.map(ch => {
      const task = this.engine.taskManager.getCharacterTask(ch.id);
      return {
        ...ch,
        position: this.positions.get(ch.id) || { x: 20, y: 15, direction: 'down' },
        currentZone: this.characterZones.get(ch.id) || 'corridor_main',
        targetZone: this.targetZones.get(ch.id) || null,
        isMoving: this.characterWaypoints.has(ch.id),
        currentTask: task ? { id: task.id, name: task.name, icon: task.icon, progress: task.progress, durationTicks: task.durationTicks, startTick: task.startTick } : null,
      };
    });

    return {
      ...engineState,
      characters,
      time: this._getSimTime(engineState.tick),
    };
  }

  /**
   * Manually assign a task from the dashboard.
   * Finds idle characters and assigns them.
   * @param {string} typeId
   * @param {string[]} [requestedCharIds] - specific characters, or empty for auto-pick
   * @returns {object|null} the created task
   */
  manualAssignTask(typeId, requestedCharIds = []) {
    const def = this.engine.taskManager.taskTypes.get(typeId);
    if (!def) return null;

    // Resolve zone
    const zone = this._resolveTaskZone(typeId, null);
    if (!zone) return null;

    let charIds = requestedCharIds;
    if (charIds.length === 0) {
      // Find idle characters without tasks
      charIds = this._findIdleCharacters(def.minParticipants || 1, def.maxParticipants || 1);
    }

    if (charIds.length < (def.minParticipants || 1)) return null;

    return this.engine.taskManager.assignTask(typeId, charIds, zone, this.engine.tick);
  }

  // ─── Internal ─────────────────────────────────────────

  _getScheduledZone(charId, tick) {
    const data = this.characterData.get(charId);
    if (!data) return 'corridor_main';

    const offset = SCHEDULE_OFFSETS[data.schedule] || 0;
    const adjustedTick = tick - offset;

    for (const block of DAILY_SCHEDULE) {
      if (adjustedTick >= block.start && adjustedTick < block.end) {
        return block.zone === 'assigned_desk' ? data.assignedZone : block.zone;
      }
    }

    // After hours — still at desk or leaving
    return data.assignedZone;
  }

  _getNeedOverrideZone(charId) {
    const needs = this.engine.needsManager.getNeeds(charId);
    if (!needs) return null;

    // Check for toilet_clog event
    const bathroomClogged = this.engine.eventManager.activeEvents.some(
      e => e.type === 'toilet_clog'
    );

    if (needs.bladder > 80) {
      return bathroomClogged ? 'kitchen' : 'bathroom';
    }
    if (needs.hunger > 70) return 'kitchen';
    if (needs.thirst > 75) return 'water_cooler';

    return null;
  }

  _checkNeedSatisfaction(charId, zoneId) {
    const zone = ZONE_MAP.get(zoneId);
    if (!zone) return;

    switch (zone.type) {
      case 'bathroom':
        this.engine.satisfyNeed(charId, 'bladder');
        break;
      case 'kitchen':
        this.engine.satisfyNeed(charId, 'hunger');
        this.engine.satisfyNeed(charId, 'thirst');
        break;
      case 'watercooler':
        this.engine.satisfyNeed(charId, 'thirst');
        break;
    }
  }

  _startMoving(charId, targetZoneId) {
    const currentZone = this.characterZones.get(charId);
    if (currentZone === targetZoneId) return;

    const waypoints = this._computeWaypoints(currentZone, targetZoneId);
    if (waypoints.length === 0) {
      // No route found — snap directly
      this.characterZones.set(charId, targetZoneId);
      const zone = ZONE_MAP.get(targetZoneId);
      if (zone) {
        const pos = this.positions.get(charId);
        if (pos) { pos.x = zone.center.x; pos.y = zone.center.y; }
      }
      return;
    }

    this.characterWaypoints.set(charId, { waypoints, index: 0 });
    this.targetZones.set(charId, targetZoneId);
  }

  /**
   * Compute waypoints for zone-to-zone movement that routes through corridors.
   * Uses ZONE_EXIT_PATH to exit/enter zones and x=3 vertical corridor to change levels.
   */
  _computeWaypoints(fromZoneId, toZoneId) {
    const fromExit = ZONE_EXIT_PATH[fromZoneId] || [];
    const toExit = ZONE_EXIT_PATH[toZoneId] || [];
    const toZone = ZONE_MAP.get(toZoneId);

    if (!toZone) return [];

    const waypoints = [];

    // Step 1: Exit current zone to its corridor
    for (const wp of fromExit) {
      waypoints.push({ ...wp });
    }

    // Get corridor positions (last exit point = corridor position)
    const fromZone = ZONE_MAP.get(fromZoneId);
    const fromCorridorPos = fromExit.length > 0
      ? fromExit[fromExit.length - 1]
      : (fromZone ? fromZone.center : { x: 20, y: 11 });

    const toCorridorPos = toExit.length > 0
      ? toExit[toExit.length - 1]
      : toZone.center;

    // Step 2: Navigate between corridor positions
    if (Math.abs(fromCorridorPos.y - toCorridorPos.y) < 0.5) {
      // Same corridor level — walk horizontally
      if (Math.abs(fromCorridorPos.x - toCorridorPos.x) > 0.5) {
        waypoints.push({ x: toCorridorPos.x, y: fromCorridorPos.y });
      }
    } else {
      // Different levels — use vertical corridor at x=3
      if (Math.abs(fromCorridorPos.x - 3) > 0.5) {
        waypoints.push({ x: 3, y: fromCorridorPos.y });
      }
      waypoints.push({ x: 3, y: toCorridorPos.y });
      if (Math.abs(toCorridorPos.x - 3) > 0.5) {
        waypoints.push({ x: toCorridorPos.x, y: toCorridorPos.y });
      }
    }

    // Step 3: Enter target zone (reverse of exit path)
    for (let i = toExit.length - 1; i >= 0; i--) {
      waypoints.push({ ...toExit[i] });
    }

    // Step 4: Target zone center (with small random offset)
    waypoints.push({
      x: toZone.center.x + (Math.random() * 2 - 1),
      y: toZone.center.y + (Math.random() * 2 - 1),
    });

    // Remove consecutive near-duplicate waypoints
    const optimized = [waypoints[0]];
    for (let i = 1; i < waypoints.length; i++) {
      const prev = optimized[optimized.length - 1];
      const curr = waypoints[i];
      if (Math.abs(curr.x - prev.x) > 0.3 || Math.abs(curr.y - prev.y) > 0.3) {
        optimized.push(curr);
      }
    }

    return optimized;
  }

  _interpolatePosition(charId) {
    const pos = this.positions.get(charId);
    if (!pos) return;

    const wpData = this.characterWaypoints.get(charId);
    if (!wpData || wpData.index >= wpData.waypoints.length) return;

    const target = wpData.waypoints[wpData.index];
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const speed = 1.5; // tiles per tick — smooth but not too slow

    if (dist <= speed) {
      // Reached this waypoint — snap and advance
      pos.x = target.x;
      pos.y = target.y;
      wpData.index++;
    } else {
      // Move toward current waypoint at constant speed
      pos.x += (dx / dist) * speed;
      pos.y += (dy / dist) * speed;
    }

    // Update direction based on movement
    if (Math.abs(dx) > Math.abs(dy)) {
      pos.direction = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > 0.01) {
      pos.direction = dy > 0 ? 'down' : 'up';
    }
  }

  _getTimeLabel(tick) {
    const hour = 9 + Math.floor(tick / 60);
    const minute = tick % 60;
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
  }

  _getSimTime(tick) {
    const hour = 9 + Math.floor(tick / 60);
    const minute = tick % 60;
    const day = 1 + Math.floor(tick / 540);
    return { tick, hour: hour % 24, minute, day };
  }

  _registerOfficeEvents() {
    // Office-specific events
    this.engine.eventManager.registerEventType('company_meeting', {
      name: 'Company Meeting',
      description: 'All-hands meeting in the large conference room.',
      durationTicks: 30,
      probability: 0.02,
      moodEffect: -5,
      selectTarget: false,
    });

    this.engine.eventManager.registerEventType('fire_drill', {
      name: 'Fire Drill',
      description: 'Emergency fire drill! Everyone to the entrance.',
      durationTicks: 15,
      probability: 0.005,
      moodEffect: -10,
      selectTarget: false,
    });

    this.engine.eventManager.registerEventType('toilet_clog', {
      name: 'Toilet Clog',
      description: 'The bathroom is out of order!',
      durationTicks: 45,
      probability: 0.01,
      moodEffect: -8,
      selectTarget: false,
    });

    this.engine.eventManager.registerEventType('cake_in_kitchen', {
      name: 'Cake in Kitchen',
      description: 'Someone brought cake! Characters head to the kitchen.',
      durationTicks: 20,
      probability: 0.02,
      moodEffect: 15,
      selectTarget: false,
    });

    this.engine.eventManager.registerEventType('coffee_machine_broken', {
      name: 'Coffee Machine Broken',
      description: 'The coffee machine is broken! No coffee until it\'s fixed.',
      durationTicks: 60,
      probability: 0.01,
      moodEffect: -12,
      selectTarget: false,
    });

    this.engine.eventManager.registerEventType('new_hire', {
      name: 'New Hire',
      description: 'A new colleague joins the office.',
      durationTicks: 30,
      probability: 0.005,
      moodEffect: 5,
      selectTarget: false,
    });
  }

  _registerWorkTasks() {
    for (const taskDef of STATIONERY_WORK_TASKS) {
      this.engine.taskManager.registerTaskType(taskDef.typeId, taskDef);
    }
    log.info('Registered stationery work tasks', { count: STATIONERY_WORK_TASKS.length });
  }

  /**
   * Auto-assign work tasks to idle characters during work schedule blocks.
   * Throttled to run every _autoAssignInterval ticks.
   */
  _autoAssignWork(tick) {
    if (tick % this._autoAssignInterval !== 0) return;

    for (const [charId, data] of this.characterData) {
      const charState = this.engine.characterRegistry.getCharacter(charId);
      if (!charState) continue;

      // Only assign during work blocks (when schedule says assigned_desk)
      const scheduledZone = this._getScheduledZone(charId, tick);
      if (scheduledZone !== data.assignedZone) continue;

      // Character must be idle with no current task and no urgent needs
      if (charState.state !== 'idle') continue;
      if (this.engine.taskManager.getCharacterTask(charId)) continue;
      if (this._getNeedOverrideZone(charId)) continue;
      if (this.characterWaypoints.has(charId)) continue;

      // Weighted random selection
      const taskType = this._pickWeightedTask();
      if (!taskType) continue;

      // Resolve zone for this task + character
      const zone = this._resolveTaskZone(taskType.typeId, charId);
      if (!zone) continue;

      // For collaborative tasks, find a partner
      const participants = [charId];
      if (taskType.minParticipants > 1) {
        const partners = this._findIdleCharacters(
          taskType.minParticipants - 1,
          taskType.maxParticipants - 1,
          [charId]
        );
        if (partners.length < taskType.minParticipants - 1) continue; // not enough people
        participants.push(...partners);
      }

      this.engine.taskManager.assignTask(taskType.typeId, participants, zone, tick);
    }
  }

  _pickWeightedTask() {
    const types = this.engine.taskManager.getRegisteredTypes();
    if (types.length === 0) return null;

    const totalWeight = types.reduce((sum, t) => sum + (t.autoAssignWeight || 1), 0);
    let roll = Math.random() * totalWeight;

    for (const t of types) {
      roll -= (t.autoAssignWeight || 1);
      if (roll <= 0) return t;
    }
    return types[types.length - 1];
  }

  _resolveTaskZone(typeId, charId) {
    const def = this.engine.taskManager.taskTypes.get(typeId);
    if (!def) return null;

    if (def.requiredZone) return def.requiredZone;
    if (def.zoneType === 'desk' && charId) {
      const data = this.characterData.get(charId);
      return data ? data.assignedZone : 'desk_area_1';
    }
    // Fallback: pick first character's desk or default
    if (def.zoneType === 'desk') return 'desk_area_1';
    return 'corridor_main';
  }

  _findIdleCharacters(min, max, exclude = []) {
    const idle = [];
    for (const [charId] of this.characterData) {
      if (exclude.includes(charId)) continue;
      const ch = this.engine.characterRegistry.getCharacter(charId);
      if (!ch || ch.state !== 'idle') continue;
      if (this.engine.taskManager.getCharacterTask(charId)) continue;
      if (this._getNeedOverrideZone(charId)) continue;
      if (this.characterWaypoints.has(charId)) continue;
      idle.push(charId);
      if (idle.length >= max) break;
    }
    return idle;
  }
}

module.exports = { SocialOfficeAdapter };
