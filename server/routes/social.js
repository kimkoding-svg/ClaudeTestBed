/**
 * Social Office Simulator — REST + SSE API routes.
 * Controls simulation lifecycle, streams events to frontend.
 */
const express = require('express');
const router = express.Router();
const { SocialEngine } = require('../services/social-engine');
const { SocialOfficeAdapter } = require('../services/social-office-adapter');
const { getOfficeCharacters } = require('../services/social-characters');
const CostTracker = require('../services/cost-tracker');
const log = require('../logger').child('SOCIAL');

// Try to create Anthropic client (graceful fallback to null = stub mode)
let anthropicClient = null;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  const AnthropicClass = Anthropic.default || Anthropic;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new AnthropicClass({ apiKey: process.env.ANTHROPIC_API_KEY });
    log.info('Anthropic client created for social sim (AI mode)');
  } else {
    log.info('No ANTHROPIC_API_KEY — social sim running in stub mode');
  }
} catch (err) {
  log.warn('Anthropic SDK not available — social sim running in stub mode', { error: err.message });
}

// ─── Simulation state (singleton per server) ────────────

let sim = null;          // { engine, adapter, status, tickInterval, tickSpeed, recentDialogue }
let sseClients = [];

/**
 * Initialize a new social simulation.
 */
function createSimulation(config = {}) {
  const costTracker = new CostTracker(config.budgetCap ?? 1.0);

  const engine = new SocialEngine({
    model: config.model || 'haiku',
    anthropicClient: anthropicClient,
    costTracker: costTracker,
    budgetCap: config.budgetCap ?? 1.0,
    encounterRateLimitMs: config.encounterRateLimitMs ?? 3000,
    encounterCooldownTicks: config.encounterCooldownTicks ?? 15,
  });

  const adapter = new SocialOfficeAdapter(engine);

  // Add characters (default 4 for personality dynamics)
  const charCount = config.characterCount || 4;
  const chars = getOfficeCharacters(charCount);
  for (const charDef of chars) {
    adapter.addCharacter(charDef);
  }

  // Subscribe to engine events → broadcast via SSE
  engine.onEvent((event) => {
    broadcastSSE(event);

    // Track recent dialogue for state queries
    if (event.type === 'dialogue_line' && sim) {
      sim.recentDialogue.push(event);
      if (sim.recentDialogue.length > 50) sim.recentDialogue.shift();
    }
  });

  log.info('Social simulation created', { model: config.model, tickSpeed: config.tickSpeed, characterCount: charCount });

  return {
    engine,
    adapter,
    status: 'initialized',
    tickInterval: null,
    tickSpeed: config.tickSpeed || 1000, // ms between ticks
    recentDialogue: [],
    config,
  };
}

/**
 * Run a single simulation tick.
 */
async function runTick() {
  if (!sim || sim.status !== 'running') return;

  try {
    // Update office positions (movement, schedule)
    sim.adapter.updatePositions(sim.engine.tick + 1);

    // Run social engine tick (needs, events, encounters)
    const events = await sim.engine.tickOnce();

    // Broadcast full state every 5 ticks for smooth frontend updates
    if (sim.engine.tick % 5 === 0) {
      broadcastSSE({
        type: 'state_update',
        state: sim.adapter.getOfficeState(),
      });
    }
  } catch (err) {
    log.error('Tick error', { error: err.message, tick: sim.engine.tick });
    broadcastSSE({ type: 'social_error', message: err.message });
  }
}

/**
 * Broadcast SSE event to all connected clients.
 */
function broadcastSSE(event) {
  const data = JSON.stringify(event);
  sseClients = sseClients.filter(client => {
    try {
      client.write(`data: ${data}\n\n`);
      return true;
    } catch {
      return false;
    }
  });
}

// ─── SSE Stream ─────────────────────────────────────────

router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial state
  if (sim) {
    res.write(`data: ${JSON.stringify({
      type: 'state_update',
      state: sim.adapter.getOfficeState(),
    })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({
      type: 'social_status',
      status: 'not_initialized',
    })}\n\n`);
  }

  sseClients.push(res);
  log.info('SSE client connected', { totalClients: sseClients.length });
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
    log.info('SSE client disconnected', { remainingClients: sseClients.length });
    res.end();
  });
});

// ─── Lifecycle ──────────────────────────────────────────

router.post('/start', (req, res) => {
  try {
    const config = req.body || {};

    // Idempotent: if already running, return current state
    if (sim && sim.status === 'running') {
      return res.json({
        status: 'running',
        characterCount: sim.engine.characterRegistry.getAllCharacters().length,
        tickSpeed: sim.tickSpeed,
      });
    }

    // Stop existing simulation if any
    if (sim && sim.tickInterval) {
      clearInterval(sim.tickInterval);
    }

    sim = createSimulation(config);
    sim.engine.start();
    sim.status = 'running';
    log.info('Social simulation started', { characterCount: sim.engine.characterRegistry.getAllCharacters().length, tickSpeed: sim.tickSpeed });

    // Start tick loop
    sim.tickInterval = setInterval(runTick, sim.tickSpeed);

    broadcastSSE({
      type: 'social_status',
      status: 'running',
      state: sim.adapter.getOfficeState(),
    });

    res.json({
      status: 'running',
      characterCount: sim.engine.characterRegistry.getAllCharacters().length,
      tickSpeed: sim.tickSpeed,
    });
  } catch (err) {
    log.error('Social start error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/pause', (req, res) => {
  if (!sim) return res.status(400).json({ error: 'No active simulation' });

  if (sim.tickInterval) clearInterval(sim.tickInterval);
  sim.tickInterval = null;
  sim.engine.pause();
  sim.status = 'paused';
  log.info('Social simulation paused');

  broadcastSSE({ type: 'social_status', status: 'paused' });
  res.json({ status: 'paused' });
});

router.post('/resume', (req, res) => {
  if (!sim) return res.status(400).json({ error: 'No active simulation' });

  sim.engine.resume();
  sim.status = 'running';
  sim.tickInterval = setInterval(runTick, sim.tickSpeed);
  log.info('Social simulation resumed');

  broadcastSSE({ type: 'social_status', status: 'running' });
  res.json({ status: 'running' });
});

router.post('/stop', (req, res) => {
  if (!sim) return res.status(400).json({ error: 'No active simulation' });

  if (sim.tickInterval) clearInterval(sim.tickInterval);
  sim.engine.stop();
  sim.status = 'stopped';
  log.info('Social simulation stopped');

  broadcastSSE({ type: 'social_status', status: 'stopped' });
  res.json({ status: 'stopped' });

  sim = null;
});

// ─── State ──────────────────────────────────────────────

router.get('/state', (req, res) => {
  if (!sim) {
    return res.json({
      time: { tick: 0, hour: 9, minute: 0, day: 1 },
      characters: [],
      encounters: { queueLength: 0, activeEncounter: null, recentEncounters: [] },
      recentDialogue: [],
      status: 'not_initialized',
      activeEvents: [],
    });
  }

  const state = sim.adapter.getOfficeState();
  state.recentDialogue = sim.recentDialogue.slice(-20);
  res.json(state);
});

// ─── God Mode ───────────────────────────────────────────

router.post('/force-encounter', async (req, res) => {
  if (!sim) return res.status(400).json({ error: 'No active simulation' });

  const { id1, id2 } = req.body;
  if (!id1 || !id2) return res.status(400).json({ error: 'id1 and id2 required' });

  try {
    log.info('Forced encounter', { id1, id2 });
    const events = await sim.engine.triggerEncounter(id1, id2);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/inject-event', (req, res) => {
  if (!sim) return res.status(400).json({ error: 'No active simulation' });

  const { type, context } = req.body;
  if (!type) return res.status(400).json({ error: 'event type required' });

  log.info('Social event injected', { type });
  const event = sim.engine.injectEvent(type, context || {});
  if (event) {
    res.json({ event });
  } else {
    res.status(400).json({ error: `Unknown event type: ${type}` });
  }
});

router.post('/set-mood', (req, res) => {
  if (!sim) return res.status(400).json({ error: 'No active simulation' });

  const { characterId, mood } = req.body;
  if (!characterId || mood === undefined) {
    return res.status(400).json({ error: 'characterId and mood required' });
  }

  log.info('Mood set', { characterId, mood });
  sim.engine.setMood(characterId, mood);
  res.json({ characterId, mood });
});

// ─── Work Tasks ─────────────────────────────────────────

router.post('/assign-task', (req, res) => {
  if (!sim) return res.status(400).json({ error: 'No active simulation' });

  const { typeId, characterIds } = req.body;
  if (!typeId) return res.status(400).json({ error: 'typeId required' });

  try {
    const task = sim.adapter.manualAssignTask(typeId, characterIds || []);
    if (task) {
      broadcastSSE({ type: 'task_assigned', task, tick: sim.engine.tick });
      log.info('Manual task assigned', { taskId: task.id, type: typeId });
      res.json({ task });
    } else {
      res.status(400).json({ error: 'No available characters for this task' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/task-types', (req, res) => {
  if (!sim) return res.json({ types: [] });
  res.json({ types: sim.engine.taskManager.getRegisteredTypes() });
});

router.get('/tasks', (req, res) => {
  if (!sim) return res.json({ active: [], queue: [], completed: [] });
  res.json({
    active: sim.engine.taskManager.getActiveTasks(),
    queue: sim.engine.taskManager.getTaskQueue(),
    completed: sim.engine.taskManager.getCompletedLog(),
  });
});

// ─── Settings ───────────────────────────────────────────

router.post('/settings', (req, res) => {
  if (!sim) return res.status(400).json({ error: 'No active simulation' });

  const { tickSpeed } = req.body;
  if (tickSpeed && tickSpeed >= 100 && tickSpeed <= 10000) {
    sim.tickSpeed = tickSpeed;
    if (sim.tickInterval) {
      clearInterval(sim.tickInterval);
      sim.tickInterval = setInterval(runTick, sim.tickSpeed);
    }
  }

  log.info('Social settings updated', { tickSpeed: sim.tickSpeed });
  res.json({ tickSpeed: sim.tickSpeed });
});

module.exports = router;
