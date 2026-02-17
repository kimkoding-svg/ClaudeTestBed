/**
 * Agent Team Simulator — REST + SSE API routes.
 * Controls simulation lifecycle, streams events, serves reports.
 */

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const WorldEngine = require('../services/world-engine');
const LeadAgent = require('../services/lead-agent');
const CostTracker = require('../services/cost-tracker');
const MessageBus = require('../services/message-bus');
const ReportGenerator = require('../services/report-generator');
const log = require('../logger').child('AGENTS');

// Simulation state (singleton per server)
let simulation = null;
let sseClients = [];

/**
 * Initialize a new simulation
 */
function createSimulation(config = {}) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const costTracker = new CostTracker(config.budgetCap || 1.00);
  const messageBus = new MessageBus();
  const worldEngine = new WorldEngine({
    startingCash: config.startingCash || 500000,
    companyName: config.companyName || 'NovaCraft E-Commerce',
  });

  const leadAgent = new LeadAgent(
    { model: config.model || 'claude-haiku-4-5-20251001' },
    anthropic,
    costTracker,
    messageBus,
    worldEngine
  );

  log.info('Simulation created', { budgetCap: config.budgetCap, startingCash: config.startingCash, model: config.model, tickSpeed: config.tickSpeed, companyName: config.companyName });

  return {
    worldEngine,
    leadAgent,
    costTracker,
    messageBus,
    anthropic,
    status: 'initialized',  // initialized, running, paused, stopped, bankrupt
    tickInterval: null,
    tickSpeed: config.tickSpeed || 3000,  // ms between ticks (3s default)
    config,
  };
}

/**
 * Broadcast SSE event to all connected clients
 */
function broadcastSSE(event) {
  const data = JSON.stringify(event);
  sseClients = sseClients.filter(client => {
    try {
      client.write(`data: ${data}\n\n`);
      return true;
    } catch {
      return false;  // Remove dead clients
    }
  });
}

/**
 * Run a single simulation tick
 */
async function runTick() {
  if (!simulation || simulation.status !== 'running') return;

  const { worldEngine, leadAgent, costTracker, messageBus } = simulation;
  const tick = worldEngine.time.tick + 1;

  // 1. Process world tick (financials, morale, orders, events)
  const tickResult = worldEngine.processTick();

  // Broadcast tick state
  broadcastSSE({
    type: 'tick',
    tick: tickResult.tick,
    time: tickResult.time,
    financials: tickResult.financials,
    morale: tickResult.morale,
    satisfaction: tickResult.customerSatisfaction,
    orders: tickResult.orders,
  });

  // Broadcast any effects
  for (const effect of tickResult.effects) {
    broadcastSSE({
      type: 'effect',
      ...effect,
      tick: tickResult.tick,
    });
  }

  // 2. Check for bankruptcy
  if (tickResult.isBankrupt) {
    simulation.status = 'bankrupt';
    log.warn('Simulation bankrupt', { tick: tickResult.tick });
    broadcastSSE({ type: 'bankrupt', tick: tickResult.tick });
    clearInterval(simulation.tickInterval);
    return;
  }

  // 3. Check budget cap
  if (costTracker.isBudgetExceeded()) {
    simulation.status = 'paused';
    log.warn('Budget exceeded, pausing', { tick: tickResult.tick, cost: costTracker.getState().totals });
    broadcastSSE({ type: 'budget_exceeded', tick: tickResult.tick, cost: costTracker.getState().totals });
    clearInterval(simulation.tickInterval);
    return;
  }

  // 4. Lead agent evaluates (every 5 ticks to save costs)
  if (tick % 5 === 0 || tick === 1) {
    broadcastSSE({ type: 'lead_thinking', tick });

    const evalResult = await leadAgent.evaluate(tick);
    log.info('Lead agent evaluated', { tick, success: evalResult.success, decisions: evalResult.parsed?.decisions?.length || 0 });

    if (evalResult.success && evalResult.parsed.decisions) {
      // Broadcast lead analysis
      broadcastSSE({
        type: 'lead_decision',
        tick,
        analysis: evalResult.parsed.analysis,
        concerns: evalResult.parsed.concerns,
        socialNote: evalResult.parsed.social_note,
        decisionCount: evalResult.parsed.decisions.length,
      });

      // Process each decision
      const results = await leadAgent.processDecisions(evalResult.parsed.decisions, tick);

      for (const result of results) {
        broadcastSSE({
          type: `decision_result_${result.type}`,
          tick,
          ...result,
        });

        // Specific broadcasts for task completions
        if (result.type === 'assign_task' && result.success) {
          broadcastSSE({
            type: 'agent_action',
            tick,
            agentId: result.agentId,
            agentName: result.agentName,
            job: result.job,
          });
        }
      }
    }
  }

  // 5. Social interactions (organic, between tasks)
  if (leadAgent.shouldTriggerSocial(tick)) {
    const socialResult = await leadAgent.triggerSocialInteraction(tick);
    if (socialResult) {
      broadcastSSE({
        type: 'social_interaction',
        tick,
        ...socialResult,
      });
    }
  }

  // 6. Broadcast updated cost state
  broadcastSSE({
    type: 'cost_update',
    tick,
    ...costTracker.getState(),
  });

  // 7. Broadcast all agent states
  broadcastSSE({
    type: 'agents_state',
    tick,
    agents: leadAgent.getWorkersState(),
    lead: leadAgent.getState(),
  });
}

// ─── ROUTES ───────────────────────────────────────────────

/**
 * SSE stream — connect to receive real-time simulation events
 */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  sseClients.push(res);
  log.info('SSE client connected', { totalClients: sseClients.length });

  // Send initial state if simulation exists
  if (simulation) {
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      status: simulation.status,
      tick: simulation.worldEngine.time.tick,
    })}\n\n`);
  }

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
    log.info('SSE client disconnected', { remainingClients: sseClients.length });
  });
});

/**
 * Start a new simulation
 */
router.post('/start', async (req, res) => {
  const { budgetCap, startingCash, model, tickSpeed, companyName } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  // Stop existing simulation if running
  if (simulation && simulation.tickInterval) {
    clearInterval(simulation.tickInterval);
  }

  simulation = createSimulation({ budgetCap, startingCash, model, tickSpeed, companyName });
  simulation.status = 'running';
  log.info('Simulation starting', { budgetCap, startingCash, model, tickSpeed });

  // Start tick loop
  simulation.tickInterval = setInterval(runTick, simulation.tickSpeed);

  // Run first tick immediately
  runTick();

  res.json({
    success: true,
    status: 'running',
    config: {
      budgetCap: simulation.costTracker.budgetCap,
      startingCash: simulation.worldEngine.ledger.startingCash,
      model: simulation.leadAgent.model,
      tickSpeed: simulation.tickSpeed,
    },
  });
});

/**
 * Pause the simulation
 */
router.post('/pause', (req, res) => {
  if (!simulation) {
    return res.status(400).json({ error: 'No simulation running' });
  }

  if (simulation.tickInterval) {
    clearInterval(simulation.tickInterval);
    simulation.tickInterval = null;
  }
  simulation.status = 'paused';
  log.info('Simulation paused', { tick: simulation.worldEngine.time.tick });

  broadcastSSE({ type: 'paused', tick: simulation.worldEngine.time.tick });

  res.json({ success: true, status: 'paused' });
});

/**
 * Resume the simulation
 */
router.post('/resume', (req, res) => {
  if (!simulation) {
    return res.status(400).json({ error: 'No simulation to resume' });
  }

  if (simulation.costTracker.isBudgetExceeded()) {
    return res.status(400).json({ error: 'Budget exceeded — increase budget cap to continue' });
  }

  simulation.status = 'running';
  simulation.tickInterval = setInterval(runTick, simulation.tickSpeed);
  log.info('Simulation resumed', { tick: simulation.worldEngine.time.tick });

  broadcastSSE({ type: 'resumed', tick: simulation.worldEngine.time.tick });

  res.json({ success: true, status: 'running' });
});

/**
 * Stop/reset the simulation
 */
router.post('/stop', (req, res) => {
  if (simulation && simulation.tickInterval) {
    clearInterval(simulation.tickInterval);
  }

  const hadSimulation = !!simulation;
  simulation = null;
  log.info('Simulation stopped');

  broadcastSSE({ type: 'stopped' });

  res.json({ success: true, hadSimulation });
});

/**
 * Get current simulation state
 */
router.get('/state', (req, res) => {
  if (!simulation) {
    return res.json({ status: 'none', simulation: null });
  }

  res.json({
    status: simulation.status,
    world: simulation.worldEngine.getState(),
    agents: simulation.leadAgent.getWorkersState(),
    lead: simulation.leadAgent.getState(),
    costs: simulation.costTracker.getState(),
    relationships: simulation.messageBus.getAllRelationships(),
  });
});

/**
 * Get full report (for pause screen)
 */
router.get('/report', (req, res) => {
  if (!simulation) {
    return res.status(400).json({ error: 'No simulation' });
  }

  const report = ReportGenerator.generate(
    simulation.leadAgent,
    simulation.worldEngine,
    simulation.costTracker,
    simulation.messageBus
  );

  res.json(report);
});

/**
 * Get a specific job's full details (for drill-down)
 */
router.get('/job/:agentId/:jobId', (req, res) => {
  if (!simulation) {
    return res.status(400).json({ error: 'No simulation' });
  }

  const detail = simulation.leadAgent.getWorkerJobDetail(req.params.agentId, req.params.jobId);
  if (!detail) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(detail);
});

/**
 * Get full API call log entry (for report drill-down)
 */
router.get('/api-log/:callId', (req, res) => {
  if (!simulation) {
    return res.status(400).json({ error: 'No simulation' });
  }

  const call = simulation.costTracker.getFullCallHistory().find(c => c.id === req.params.callId);
  if (!call) {
    return res.status(404).json({ error: 'Call not found' });
  }

  res.json(call);
});

/**
 * Inject a manual event
 */
router.post('/inject-event', (req, res) => {
  if (!simulation) {
    return res.status(400).json({ error: 'No simulation' });
  }

  const event = simulation.worldEngine.injectEvent(req.body);
  log.info('Manual event injected', { eventId: event?.id, name: event?.name });

  broadcastSSE({
    type: 'manual_event',
    tick: simulation.worldEngine.time.tick,
    event,
  });

  res.json({ success: true, event });
});

/**
 * Update simulation settings (speed, budget, model)
 */
router.post('/settings', (req, res) => {
  if (!simulation) {
    return res.status(400).json({ error: 'No simulation' });
  }

  const { tickSpeed, budgetCap, model } = req.body;

  if (tickSpeed) {
    simulation.tickSpeed = tickSpeed;
    if (simulation.status === 'running' && simulation.tickInterval) {
      clearInterval(simulation.tickInterval);
      simulation.tickInterval = setInterval(runTick, tickSpeed);
    }
  }

  if (budgetCap !== undefined) {
    simulation.costTracker.setBudgetCap(budgetCap);
  }

  if (model) {
    simulation.leadAgent.setModel(model);
  }

  log.info('Settings updated', { tickSpeed: simulation.tickSpeed, budgetCap: simulation.costTracker.budgetCap, model: simulation.leadAgent.model });
  res.json({
    success: true,
    tickSpeed: simulation.tickSpeed,
    budgetCap: simulation.costTracker.budgetCap,
    model: simulation.leadAgent.model,
  });
});

/**
 * Get social messages / timeline
 */
router.get('/timeline', (req, res) => {
  if (!simulation) {
    return res.status(400).json({ error: 'No simulation' });
  }

  const limit = parseInt(req.query.limit) || 50;
  const messages = simulation.messageBus.getSocialMessages(limit);
  const events = simulation.worldEngine.eventHistory.slice(-limit);
  const effects = simulation.worldEngine.effectLog.slice(-limit);

  res.json({ messages, events, effects });
});

module.exports = router;
