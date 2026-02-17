/**
 * Kokoro TTS Process Manager
 *
 * Manages the Python Kokoro TTS server as a child process.
 * Provides health checking and synthesis proxying.
 */
const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');
const log = require('../logger').child('KOKORO');

const LOCAL_TTS_DIR = path.join(__dirname);
const KOKORO_PORT = process.env.KOKORO_PORT || 5001;
const KOKORO_URL = `http://localhost:${KOKORO_PORT}`;

let pythonProcess = null;
let isAvailable = false;
let lastHealthCheck = null;

/**
 * Check if model files are downloaded
 */
function isSetupComplete() {
  const fs = require('fs');
  const modelPath = path.join(LOCAL_TTS_DIR, 'kokoro-v1.0.onnx');
  const voicesPath = path.join(LOCAL_TTS_DIR, 'voices-v1.0.bin');
  const venvPath = path.join(LOCAL_TTS_DIR, 'venv');
  return fs.existsSync(modelPath) && fs.existsSync(voicesPath) && fs.existsSync(venvPath);
}

/**
 * Start the Python TTS server as a child process
 */
async function startServer() {
  if (pythonProcess) {
    log.info('Server already running');
    return;
  }

  if (!isSetupComplete()) {
    log.warn('Setup not complete. Run: server\\local-tts\\setup.bat');
    return;
  }

  const venvPython = path.join(LOCAL_TTS_DIR, 'venv', 'Scripts', 'python.exe');
  const serverScript = path.join(LOCAL_TTS_DIR, 'tts_server.py');

  log.info('Starting local TTS server', { port: KOKORO_PORT });

  pythonProcess = spawn(venvPython, [serverScript], {
    cwd: LOCAL_TTS_DIR,
    env: {
      ...process.env,
      KOKORO_PORT: String(KOKORO_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) log.debug(line.trim());
    });
  });

  pythonProcess.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) log.debug(line.trim());
    });
  });

  pythonProcess.on('close', (code) => {
    log.info('Server exited', { code });
    pythonProcess = null;
    isAvailable = false;
  });

  pythonProcess.on('error', (err) => {
    log.error('Failed to start server', { error: err.message });
    pythonProcess = null;
    isAvailable = false;
  });

  // Wait for server to become ready
  await waitForReady(15000);
}

/**
 * Wait for the Python server to respond to health checks
 */
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await axios.get(`${KOKORO_URL}/health`, { timeout: 1000 });
      if (resp.data.model_loaded) {
        isAvailable = true;
        lastHealthCheck = resp.data;
        log.info('Server ready', { gpu: resp.data.gpu });
        return true;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  log.warn('Server did not become ready in time');
  return false;
}

/**
 * Stop the Python TTS server
 */
function stopServer() {
  if (pythonProcess) {
    log.info('Stopping server');
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
    isAvailable = false;
  }
}

/**
 * Check if the local TTS server is available
 */
async function checkHealth() {
  try {
    const resp = await axios.get(`${KOKORO_URL}/health`, { timeout: 2000 });
    isAvailable = resp.data.model_loaded;
    lastHealthCheck = resp.data;
    return resp.data;
  } catch (e) {
    isAvailable = false;
    return { status: 'unavailable', model_loaded: false, gpu: false };
  }
}

/**
 * Synthesize speech using the local Kokoro model
 * Returns the same format as the OpenAI TTS service
 */
async function synthesize(text, options = {}) {
  if (!isAvailable) {
    throw new Error('Local TTS server not available');
  }

  const voice = options.voice || 'af_heart';
  const speed = options.speed || 1.0;

  const resp = await axios.post(`${KOKORO_URL}/synthesize`, {
    text,
    voice,
    speed,
    lang: 'en-us',
    format: 'wav',
  }, {
    timeout: 30000,
  });

  if (!resp.data.success) {
    throw new Error(resp.data.detail || 'Synthesis failed');
  }

  return {
    audioData: resp.data.audioData,
    format: resp.data.format || 'wav',
    inference_ms: resp.data.inference_ms,
    gpu: resp.data.gpu,
  };
}

/**
 * Get list of available Kokoro voices
 */
async function getVoices() {
  try {
    const resp = await axios.get(`${KOKORO_URL}/voices`, { timeout: 2000 });
    return resp.data.voices;
  } catch (e) {
    // Return static voice list as fallback
    return {
      "en-us": {
        "female": [
          { id: "af_heart", name: "Heart", grade: "A-" },
          { id: "af_bella", name: "Bella", grade: "A-" },
          { id: "af_nicole", name: "Nicole", grade: "B-" },
          { id: "af_sarah", name: "Sarah", grade: "C+" },
          { id: "af_nova", name: "Nova", grade: "C" },
          { id: "af_sky", name: "Sky", grade: "C-" },
        ],
        "male": [
          { id: "am_fenrir", name: "Fenrir", grade: "C+" },
          { id: "am_michael", name: "Michael", grade: "C+" },
          { id: "am_puck", name: "Puck", grade: "C+" },
          { id: "am_adam", name: "Adam", grade: "F+" },
        ],
      },
    };
  }
}

// Cleanup on process exit
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(); });
process.on('SIGTERM', () => { stopServer(); process.exit(); });

module.exports = {
  startServer,
  stopServer,
  checkHealth,
  synthesize,
  getVoices,
  isSetupComplete,
  get isAvailable() { return isAvailable; },
  get lastHealthCheck() { return lastHealthCheck; },
};
