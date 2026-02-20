/**
 * Couple Chat — REST + SSE API routes.
 * Two random AI agents chat with each other.
 */
const express = require('express');
const router = express.Router();
const { CoupleEngine, getLogsList, getLog } = require('../services/couple-engine');
const CostTracker = require('../services/cost-tracker');
const log = require('../logger').child('COUPLE');

// Anthropic client (graceful fallback to stub mode)
let anthropicClient = null;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  const AnthropicClass = Anthropic.default || Anthropic;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new AnthropicClass({ apiKey: process.env.ANTHROPIC_API_KEY });
    log.info('Anthropic client created for couple chat (AI mode)');
  } else {
    log.info('No ANTHROPIC_API_KEY — couple chat running in stub mode');
  }
} catch (err) {
  log.warn('Anthropic SDK not available — couple chat in stub mode', { error: err.message });
}

const costTracker = new CostTracker({ hardCap: 2.00 });

// ─── State ─────────────────────────────────────────────────

let engine = null;
let sseClients = [];

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

// ─── SSE Stream ────────────────────────────────────────────

router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send current profiles if engine is running
  if (engine && engine.personA && engine.personB) {
    const profileData = JSON.stringify({
      type: 'couple_profiles',
      ...engine.getProfiles(),
    });
    res.write(`data: ${profileData}\n\n`);
  }

  sseClients.push(res);
  log.info('SSE client connected', { total: sseClients.length });

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
    log.info('SSE client disconnected', { total: sseClients.length });

    // Stop engine if no clients left
    if (sseClients.length === 0 && engine) {
      log.info('No SSE clients — stopping couple engine');
      engine.stop();
    }
  });
});

// ─── Start ─────────────────────────────────────────────────

router.post('/start', (req, res) => {
  if (engine) {
    engine.stop();
  }

  engine = new CoupleEngine({
    anthropicClient,
    costTracker,
  });

  const profiles = engine.start(broadcastSSE);

  log.info('Couple chat started');
  res.json({ ok: true, ...profiles });
});

// ─── Reset ─────────────────────────────────────────────────

router.post('/reset', (req, res) => {
  if (!engine) {
    engine = new CoupleEngine({
      anthropicClient,
      costTracker,
    });
  }

  const profiles = engine.reset(broadcastSSE);

  log.info('Couple chat reset');
  res.json({ ok: true, ...profiles });
});

// ─── Stop ──────────────────────────────────────────────────

router.post('/stop', (req, res) => {
  if (engine) {
    engine.stop();
  }
  res.json({ ok: true });
});

// ─── Cost Info ─────────────────────────────────────────────

router.get('/costs', (req, res) => {
  res.json(costTracker.getSummary());
});

// ─── Conversation Logs ────────────────────────────────────

router.get('/logs', (req, res) => {
  res.json(getLogsList());
});

router.get('/logs/:filename', (req, res) => {
  const data = getLog(req.params.filename);
  if (!data) return res.status(404).json({ error: 'Log not found' });
  res.json(data);
});

module.exports = router;
