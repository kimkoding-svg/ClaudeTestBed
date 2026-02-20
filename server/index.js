const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./swagger');
const logger = require('./logger');

// Load environment variables
dotenv.config();

logger.info('='.repeat(80));
logger.info('AI Companion Server Starting');
logger.info('='.repeat(80));
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Set (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'NOT SET'}`);
logger.info(`Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'NOT SET'}`);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AI Companion API Documentation',
}));

// Root route - redirect to API docs
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Serve static files from Vite build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
}

// API Routes
const voiceRouter = require('./routes/voice');
const conversationRouter = require('./routes/conversation');
const documentsRouter = require('./routes/documents');
const pdfRouter = require('./routes/pdf');
const agentsRouter = require('./routes/agents');
const socialRouter = require('./routes/social');
const coupleRouter = require('./routes/couple');
app.use('/api/voice', voiceRouter);
app.use('/api/conversation', conversationRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/pdf', pdfRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/social', socialRouter);
app.use('/api/couple', coupleRouter);

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app for all other routes (in production)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Start server
app.listen(PORT, async () => {
  logger.info(`🚀 Server listening on http://localhost:${PORT}`);
  logger.info(`📡 API endpoints: http://localhost:${PORT}/api`);
  logger.info(`📚 API docs: http://localhost:${PORT}/api-docs`);
  logger.info(`🎤 Voice services: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Not configured ✗'}`);
  logger.info(`Logs: c:\\logs\\office-simulator-YYYY-MM-DD.log (20MB chunks, max 50 files)`);
  logger.info('Routes mounted: voice, conversation, documents, pdf, agents, social, couple');

  // Try to auto-start local Kokoro TTS if setup is complete
  try {
    const kokoroManager = require('./local-tts/manager');
    if (kokoroManager.isSetupComplete()) {
      logger.info('Local TTS (Kokoro): Setup detected, starting...');
      await kokoroManager.startServer();
    } else {
      logger.info('Local TTS (Kokoro): Not set up');
    }
  } catch (err) {
    logger.warn('Local TTS (Kokoro): Not available', { error: err.message });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Server shutting down (SIGINT)');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('Server shutting down (SIGTERM)');
  process.exit(0);
});

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
});
