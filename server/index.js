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
app.use('/api/voice', voiceRouter);
app.use('/api/conversation', conversationRouter);

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
app.listen(PORT, () => {
  logger.info(`🚀 Server listening on http://localhost:${PORT}`);
  logger.info(`📡 API endpoints: http://localhost:${PORT}/api`);
  logger.info(`📚 API docs: http://localhost:${PORT}/api-docs`);
  logger.info(`🎤 Voice services: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Not configured ✗'}`);
  logger.info(`📝 Logs: c:\\logs\\claude\\test.log (10MB chunks, max 100 files)`);

  // Also console log for visibility
  console.log(`\n🚀 AI Companion Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`📚 API Documentation at http://localhost:${PORT}/api-docs`);
  console.log(`🎤 Voice services: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Not configured ✗'}`);
  console.log(`📝 Logging to: c:\\logs\\claude\\test.log\n`);
});

// Error handling
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  console.error('Unhandled rejection:', error);
});
