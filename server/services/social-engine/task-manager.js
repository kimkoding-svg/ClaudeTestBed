/**
 * Task Manager — generic work task lifecycle for the social engine.
 *
 * Simulator-agnostic: manages task type registration, assignment,
 * progress tracking, interruption, and completion. Theme-specific
 * task types are registered by the adapter.
 */

const log = require('../../logger').child('TASKS');

class TaskManager {
  constructor() {
    /** @type {Map<string, object>} registered task type definitions */
    this.taskTypes = new Map();
    /** @type {Array<object>} tasks currently being worked on */
    this.activeTasks = [];
    /** @type {Array<object>} tasks waiting for assignment */
    this.taskQueue = [];
    /** @type {Array<object>} recently completed tasks (last 50) */
    this.completedLog = [];
    /** @type {number} next task instance id */
    this._nextId = 1;
  }

  // ─── Registration ────────────────────────────────────

  /**
   * Register a task type that can be assigned to characters.
   * @param {string} typeId
   * @param {object} def - { name, icon, description, durationTicks, zoneType, requiredZone,
   *   moodEffect, completionMoodBoost, minParticipants, maxParticipants, priority, autoAssignWeight }
   */
  registerTaskType(typeId, def) {
    this.taskTypes.set(typeId, { typeId, ...def });
  }

  /**
   * Get all registered task type definitions (for frontend UI).
   */
  getRegisteredTypes() {
    return Array.from(this.taskTypes.values());
  }

  // ─── Assignment ──────────────────────────────────────

  /**
   * Create and assign a task to specific characters.
   * @param {string} typeId
   * @param {string[]} characterIds
   * @param {string} zone - resolved zone id where work happens
   * @param {number} tick - current simulation tick
   * @returns {object|null} the created task instance
   */
  assignTask(typeId, characterIds, zone, tick) {
    const def = this.taskTypes.get(typeId);
    if (!def) {
      log.warn('Unknown task type', { typeId });
      return null;
    }

    const task = {
      id: `task_${this._nextId++}`,
      typeId,
      name: def.name,
      icon: def.icon,
      assignedTo: [...characterIds],
      zone,
      startTick: tick,
      durationTicks: def.durationTicks,
      progress: 0,
      status: 'in_progress',
      moodEffect: def.moodEffect || 0,
      completionMoodBoost: def.completionMoodBoost || 5,
      interruptedBy: null,
    };

    this.activeTasks.push(task);
    log.info('Task assigned', { taskId: task.id, type: typeId, assignedTo: characterIds, zone });
    return task;
  }

  /**
   * Add a task to the unassigned queue.
   * @param {string} typeId
   * @param {object} [overrides]
   * @returns {object} the queued task
   */
  queueTask(typeId, overrides = {}) {
    const def = this.taskTypes.get(typeId);
    if (!def) return null;

    const task = {
      id: `task_${this._nextId++}`,
      typeId,
      name: overrides.name || def.name,
      icon: def.icon,
      assignedTo: [],
      zone: overrides.zone || def.requiredZone || null,
      startTick: null,
      durationTicks: overrides.durationTicks || def.durationTicks,
      progress: 0,
      status: 'queued',
      moodEffect: def.moodEffect || 0,
      completionMoodBoost: def.completionMoodBoost || 5,
      interruptedBy: null,
    };

    this.taskQueue.push(task);
    return task;
  }

  // ─── Interruption ────────────────────────────────────

  /**
   * Interrupt a specific task (e.g. urgent need, event).
   * Moves it to the queue so it can be resumed.
   * @param {string} taskId
   * @param {string} reason
   */
  interruptTask(taskId, reason) {
    const idx = this.activeTasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    const task = this.activeTasks.splice(idx, 1)[0];
    task.status = 'interrupted';
    task.interruptedBy = reason;
    this.taskQueue.unshift(task); // front of queue for resumption
    log.info('Task interrupted', { taskId, reason, progress: task.progress.toFixed(2) });
  }

  /**
   * Resume an interrupted task for a character.
   * @param {string} characterId
   * @param {number} tick
   * @returns {object|null} the resumed task
   */
  resumeInterruptedTask(characterId, tick) {
    const idx = this.taskQueue.findIndex(
      t => t.status === 'interrupted' && t.assignedTo.includes(characterId)
    );
    if (idx === -1) return null;

    const task = this.taskQueue.splice(idx, 1)[0];
    task.status = 'in_progress';
    task.interruptedBy = null;
    this.activeTasks.push(task);
    log.info('Task resumed', { taskId: task.id, characterId, progress: task.progress.toFixed(2) });
    return task;
  }

  /**
   * Interrupt all active tasks (e.g. fire drill).
   * @param {string} reason
   */
  interruptAll(reason) {
    const toInterrupt = [...this.activeTasks];
    for (const task of toInterrupt) {
      this.interruptTask(task.id, reason);
    }
  }

  // ─── Queries ─────────────────────────────────────────

  /**
   * Get the active task for a character, or null.
   */
  getCharacterTask(characterId) {
    return this.activeTasks.find(t => t.assignedTo.includes(characterId)) || null;
  }

  /**
   * Get all active (in-progress) tasks.
   */
  getActiveTasks() {
    return this.activeTasks;
  }

  /**
   * Get all queued tasks.
   */
  getTaskQueue() {
    return this.taskQueue;
  }

  /**
   * Get the completed task log.
   */
  getCompletedLog() {
    return this.completedLog;
  }

  /**
   * Full serialisable state snapshot.
   */
  getState() {
    return {
      activeTasks: this.activeTasks.map(t => ({ ...t })),
      taskQueue: this.taskQueue.map(t => ({ ...t })),
      completedTasks: this.completedLog.map(t => ({ ...t })),
      registeredTaskTypes: this.getRegisteredTypes(),
    };
  }

  // ─── Tick ────────────────────────────────────────────

  /**
   * Progress active tasks. Called once per engine tick.
   * @param {number} tick - current simulation tick
   * @param {object} [context] - { getCharacterZone(id), getCharacterState(id) } from adapter
   * @returns {Array<object>} events generated this tick
   */
  tick(tick, context = {}) {
    const events = [];
    const completed = [];

    for (const task of this.activeTasks) {
      // Check if all assigned characters are working in the right zone
      let allReady = true;
      if (context.getCharacterZone && context.getCharacterState) {
        for (const charId of task.assignedTo) {
          const charZone = context.getCharacterZone(charId);
          const charState = context.getCharacterState(charId);
          if (charZone !== task.zone || charState !== 'working') {
            allReady = false;
            break;
          }
        }
      }

      if (allReady) {
        task.progress += 1 / task.durationTicks;
      }

      if (task.progress >= 1.0) {
        task.progress = 1.0;
        task.status = 'completed';
        completed.push(task);
        events.push({
          type: 'task_completed',
          task: { ...task },
          tick,
        });
        log.info('Task completed', { taskId: task.id, type: task.typeId, assignedTo: task.assignedTo });
      }
    }

    // Move completed tasks to log
    for (const task of completed) {
      this.activeTasks = this.activeTasks.filter(t => t.id !== task.id);
      this.completedLog.push(task);
      if (this.completedLog.length > 50) this.completedLog.shift();
    }

    return events;
  }
}

module.exports = { TaskManager };
