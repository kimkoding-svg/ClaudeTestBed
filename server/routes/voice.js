const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const log = require('../logger').child('VOICE');
const kokoroManager = require('../local-tts/manager');
const { normalizeForTTS } = require('../services/text-normalizer');

// Configure multer for handling audio uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// Import compiled TypeScript voice services
let voicePipelineManager = null;
let ttsService = null;

function initializeVoiceServices() {
  if (!voicePipelineManager) {
    try {
      const { getVoicePipelineManager } = require('../../dist-electron/main/services/voice/VoicePipelineManager');

      voicePipelineManager = getVoicePipelineManager({
        openAIApiKey: process.env.OPENAI_API_KEY,
        sttLanguage: process.env.VOICE_STT_LANGUAGE || 'en',
        ttsVoice: process.env.VOICE_TTS_VOICE || 'nova',
        ttsSpeed: parseFloat(process.env.VOICE_TTS_SPEED || '1.0'),
      });

      log.info('Voice pipeline initialized');
    } catch (error) {
      log.error('Failed to initialize voice services', { error: error.message });
      throw new Error('Voice services not available. Run: npm run build:main');
    }
  }
  return voicePipelineManager;
}

function initializeTTSService() {
  if (!ttsService) {
    const provider = process.env.TTS_PROVIDER || 'openai';

    try {
      if (provider === 'voicevox') {
        const { getVoiceVoxTTSService } = require('../../dist-electron/main/services/voice/VoiceVoxTTSService');
        const baseUrl = process.env.VOICEVOX_BASE_URL || 'http://localhost:50021';
        const speaker = parseInt(process.env.VOICEVOX_SPEAKER || '3');

        ttsService = getVoiceVoxTTSService(baseUrl, speaker);
        log.info('VOICEVOX TTS initialized', { speaker });
      } else {
        const { getOpenAITTSService } = require('../../dist-electron/main/services/voice/OpenAITTSService');

        ttsService = getOpenAITTSService(process.env.OPENAI_API_KEY);
        ttsService.setDefaultVoice(process.env.VOICE_TTS_VOICE || 'nova');
        ttsService.setDefaultSpeed(parseFloat(process.env.VOICE_TTS_SPEED || '1.0'));
        log.info('OpenAI TTS initialized', { voice: process.env.VOICE_TTS_VOICE || 'nova' });
      }
    } catch (error) {
      log.error('Failed to initialize TTS service', { error: error.message });
      throw new Error('TTS service not available. Run: npm run build:main');
    }
  }
  return ttsService;
}

/**
 * @swagger
 * /api/voice/transcribe:
 *   post:
 *     summary: Transcribe audio to text using OpenAI Whisper
 *     tags: [Voice]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file (webm format recommended)
 *     responses:
 *       200:
 *         description: Successfully transcribed audio
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 text:
 *                   type: string
 *                   description: Transcribed text
 *                 duration:
 *                   type: number
 *                   description: Processing duration in milliseconds
 *       400:
 *         description: No audio file provided
 *       500:
 *         description: Transcription error
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  const requestId = Date.now().toString(36);
  log.info(`[${requestId}] ======== TRANSCRIBE REQUEST START ========`);

  try {
    if (!req.file) {
      log.warn(`[${requestId}] No audio file in request`);
      return res.status(400).json({ error: 'No audio file provided' });
    }

    log.info(`[${requestId}] Received audio file:`);
    log.info(`[${requestId}]   - Size: ${req.file.size} bytes`);
    log.info(`[${requestId}]   - Type: ${req.file.mimetype}`);
    log.info(`[${requestId}]   - Original name: ${req.file.originalname}`);
    log.info(`[${requestId}]   - Buffer length: ${req.file.buffer.length}`);

    log.info(`[${requestId}] Initializing voice services...`);
    const manager = initializeVoiceServices();
    log.info(`[${requestId}] Voice services initialized`);

    log.info(`[${requestId}] Checking STT service...`);
    log.info(`[${requestId}]   - STT service exists: ${!!manager.sttService}`);
    log.info(`[${requestId}]   - STT service ready: ${manager.sttService.isReady()}`);

    // Transcribe the audio file directly (it's already in webm format)
    log.info(`[${requestId}] Starting transcription...`);
    const startTime = Date.now();

    try {
      const result = await manager.sttService.transcribeBuffer(req.file.buffer, 'en');
      const duration = Date.now() - startTime;

      log.info(`[${requestId}] ✓ Transcription successful!`);
      log.info(`[${requestId}]   - Text: "${result.text}"`);
      log.info(`[${requestId}]   - Duration: ${result.duration}ms`);
      log.info(`[${requestId}]   - Processing time: ${duration}ms`);

      log.info('Transcription successful', { text: result.text.substring(0, 80), duration: duration + 'ms' });

      res.json({
        success: true,
        text: result.text,
        duration: duration
      });
    } catch (transcribeError) {
      log.error(`[${requestId}] Transcription failed:`, transcribeError);
      log.error(`[${requestId}]   - Error name: ${transcribeError.name}`);
      log.error(`[${requestId}]   - Error message: ${transcribeError.message}`);
      log.error(`[${requestId}]   - Error stack: ${transcribeError.stack}`);
      if (transcribeError.cause) {
        log.error(`[${requestId}]   - Error cause: ${JSON.stringify(transcribeError.cause, null, 2)}`);
      }
      throw transcribeError;
    }

    log.info(`[${requestId}] ======== TRANSCRIBE REQUEST END (SUCCESS) ========`);
  } catch (error) {
    log.error(`[${requestId}] ======== TRANSCRIBE REQUEST END (ERROR) ========`);
    log.error(`[${requestId}] Final error:`, error);
    log.error('Transcription error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/voice/synthesize:
 *   post:
 *     summary: Convert text to speech using OpenAI TTS
 *     tags: [Voice]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Text to convert to speech
 *               streaming:
 *                 type: boolean
 *                 default: false
 *                 description: Enable streaming mode
 *     responses:
 *       200:
 *         description: Successfully synthesized speech
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 audioData:
 *                   type: string
 *                   nullable: true
 *                   description: Base64-encoded audio data (MP3 format)
 *                 format:
 *                   type: string
 *                   example: mp3
 *       400:
 *         description: No text provided
 *       500:
 *         description: Synthesis error
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { text, streaming = false, voice, speed, model, provider: requestProvider } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    // Normalize text for natural speech output
    const spokenText = normalizeForTTS(text);
    if (spokenText !== text) {
      log.debug('TTS normalized', { original: text.substring(0, 60), normalized: spokenText.substring(0, 60) });
    }

    // Use request-level provider override, or fall back to env config
    const provider = requestProvider || process.env.TTS_PROVIDER || 'openai';

    // Route to local Kokoro TTS
    if (provider === 'kokoro') {
      log.info('Synthesizing with Kokoro', { voice: voice || 'af_heart', speed: speed || 1.0 });

      try {
        const result = await kokoroManager.synthesize(spokenText, { voice, speed });
        res.json({
          success: true,
          audioData: result.audioData,
          format: result.format || 'wav',
          inference_ms: result.inference_ms,
          gpu: result.gpu,
        });
        log.info('Kokoro synthesis complete', { duration: result.inference_ms + 'ms', gpu: result.gpu });
      } catch (kokoroErr) {
        log.error('Kokoro synthesis failed', { error: kokoroErr.message });
        res.status(500).json({
          success: false,
          error: `Local TTS failed: ${kokoroErr.message}`,
          provider: 'kokoro',
        });
      }
      return;
    }

    // OpenAI / VOICEVOX path (existing)
    const tts = initializeTTSService();

    const options = {};
    if (voice) options.voice = voice;
    if (speed) options.speed = speed;
    if (model) options.model = model;

    log.info('Synthesizing', { provider, voice: voice || 'default', speed: speed || 'default', model: model || 'default' });

    // Synthesize speech with per-request options (using normalized text)
    const result = await tts.synthesize(spokenText, Object.keys(options).length > 0 ? options : undefined);

    if (result && result.buffer) {
      // Send audio as base64
      res.json({
        success: true,
        audioData: result.buffer.toString('base64'),
        format: result.format || (provider === 'voicevox' ? 'wav' : 'mp3')
      });
      log.info('Synthesis complete', { bytes: result.buffer.length, format: result.format });
    } else {
      res.json({
        success: true,
        audioData: null
      });
    }
  } catch (error) {
    log.error('Synthesis error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/voice/status:
 *   get:
 *     summary: Get voice pipeline status
 *     tags: [Voice]
 *     responses:
 *       200:
 *         description: Voice pipeline status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 isReady:
 *                   type: boolean
 *                   description: Whether voice services are initialized
 *                 isRecording:
 *                   type: boolean
 *                   description: Whether currently recording
 *                 message:
 *                   type: string
 *                   description: Status message
 *       500:
 *         description: Server error
 */
router.get('/status', (req, res) => {
  try {
    if (!voicePipelineManager) {
      return res.json({
        success: true,
        isReady: false,
        isRecording: false,
        message: 'Voice services not initialized'
      });
    }

    res.json({
      success: true,
      isReady: voicePipelineManager.isReady(),
      isRecording: voicePipelineManager.isCurrentlyRecording()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Local TTS (Kokoro) status and management
 */
router.get('/kokoro/status', async (req, res) => {
  try {
    const health = await kokoroManager.checkHealth();
    res.json({
      success: true,
      available: kokoroManager.isAvailable,
      setupComplete: kokoroManager.isSetupComplete(),
      ...health,
    });
  } catch (error) {
    res.json({
      success: true,
      available: false,
      setupComplete: kokoroManager.isSetupComplete(),
      status: 'error',
      error: error.message,
    });
  }
});

router.post('/kokoro/start', async (req, res) => {
  try {
    await kokoroManager.startServer();
    res.json({
      success: true,
      available: kokoroManager.isAvailable,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/kokoro/voices', async (req, res) => {
  try {
    const voices = await kokoroManager.getVoices();
    res.json({ success: true, voices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
