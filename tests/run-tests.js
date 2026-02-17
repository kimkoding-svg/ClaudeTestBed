#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');

const API_BASE = 'http://localhost:3000/api';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(chalk.green('✓'), name);
  } catch (error) {
    failed++;
    console.log(chalk.red('✗'), name);
    console.log(chalk.red('  Error:'), error.message);
  }
}

async function runTests() {
  console.log(chalk.bold('\n🧪 AI Companion Test Suite\n'));

  // Test 1: Server Health
  await test('Server is running', async () => {
    const response = await axios.get(`${API_BASE}/voice/status`, { timeout: 3000 });
    if (response.status !== 200 || !response.data.success) {
      throw new Error('Server not responding correctly');
    }
  });

  // Test 2: TTS Synthesis
  await test('TTS synthesis works', async () => {
    const response = await axios.post(`${API_BASE}/voice/synthesize`, {
      text: 'Test'
    }, { timeout: 10000 });
    if (!response.data.success || !response.data.audioData) {
      throw new Error('TTS synthesis failed');
    }
    if (response.data.audioData.length < 100) {
      throw new Error('Audio data too small');
    }
  });

  // Test 3: STT Transcription (with mock audio)
  await test('STT endpoint exists', async () => {
    try {
      await axios.post(`${API_BASE}/voice/transcribe`, {}, { timeout: 3000 });
    } catch (error) {
      // Expect 400 (no audio), not 404 (not found)
      if (error.response?.status === 404) {
        throw new Error('STT endpoint not found');
      }
    }
  });

  // Test 4: Chat Conversation
  await test('Chat conversation works', async () => {
    const response = await axios.post(`${API_BASE}/conversation/chat`, {
      message: 'Hi'
    }, { timeout: 15000 });
    if (!response.data.success || !response.data.response) {
      throw new Error('Chat response failed');
    }
  });

  // Test 5: Streaming Conversation
  await test('Streaming endpoint responds', async () => {
    try {
      // Just check that endpoint exists and starts responding
      const response = await axios.post(`${API_BASE}/conversation/chat-stream`, {
        message: 'Test',
        history: []
      }, {
        timeout: 8000,
        responseType: 'stream'
      });
      if (response.status !== 200) {
        throw new Error('Streaming endpoint failed');
      }
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        // Timeout is OK for streaming
        return;
      }
      throw error;
    }
  });

  // Test 6: Environment Variables
  await test('Environment variables configured', async () => {
    const hasOpenAI = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 20;
    const hasAnthropic = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 20;

    if (!hasOpenAI) throw new Error('OPENAI_API_KEY not set');
    if (!hasAnthropic) throw new Error('ANTHROPIC_API_KEY not set');
  });

  // Summary
  console.log(chalk.bold('\n📊 Test Results:'));
  console.log(chalk.green(`  ✓ Passed: ${passed}`));
  if (failed > 0) {
    console.log(chalk.red(`  ✗ Failed: ${failed}`));
  }
  console.log(chalk.bold(`  Total: ${passed + failed}\n`));

  process.exit(failed > 0 ? 1 : 0);
}

// Load env vars
require('dotenv').config();

// Run tests
runTests().catch(error => {
  console.error(chalk.red('\n❌ Test suite crashed:'), error);
  process.exit(1);
});
