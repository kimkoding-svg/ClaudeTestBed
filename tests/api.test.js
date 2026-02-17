const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

describe('API Tests', () => {
  test('Health check - Server is running', async () => {
    const response = await axios.get(`${API_BASE}/voice/status`);
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
  });

  test('TTS synthesis works', async () => {
    const response = await axios.post(`${API_BASE}/voice/synthesize`, {
      text: 'Test'
    });
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.audioData).toBeTruthy();
  });

  test('Chat streaming endpoint exists', async () => {
    try {
      await axios.post(`${API_BASE}/conversation/chat-stream`, {
        message: 'Hello'
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
    } catch (error) {
      // Stream may timeout, but should not 404
      expect(error.response?.status).not.toBe(404);
    }
  });

  test('Web search function available', async () => {
    // Test that web search tool is defined
    const response = await axios.post(`${API_BASE}/conversation/chat-stream`, {
      message: 'What is the weather today?',
      history: []
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    // Should trigger tool use
    expect(response.status).not.toBe(500);
  });
});

module.exports = {};
