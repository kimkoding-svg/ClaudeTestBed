const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI Companion API',
      version: '1.0.0',
      description: 'REST API for AI Companion voice-based assistant with persistent memory',
      contact: {
        name: 'AI Companion',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Voice',
        description: 'Voice pipeline endpoints (STT, TTS)',
      },
      {
        name: 'Conversation',
        description: 'AI conversation endpoints using Claude',
      },
      {
        name: 'Health',
        description: 'System health and status',
      },
    ],
  },
  apis: ['./server/routes/*.js', './server/index.js'],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
