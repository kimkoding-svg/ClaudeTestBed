const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../logger');

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

      console.log('✓ Voice pipeline initialized');
    } catch (error) {
      console.error('Failed to initialize voice services:', error);
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
        console.log(`✓ VOICEVOX TTS initialized (speaker: ${speaker})`);
      } else {
        const { getOpenAITTSService } = require('../../dist-electron/main/services/voice/OpenAITTSService');

        ttsService = getOpenAITTSService(process.env.OPENAI_API_KEY);
        ttsService.setDefaultVoice(process.env.VOICE_TTS_VOICE || 'nova');
        ttsService.setDefaultSpeed(parseFloat(process.env.VOICE_TTS_SPEED || '1.0'));
        console.log(`✓ OpenAI TTS initialized (voice: ${process.env.VOICE_TTS_VOICE || 'nova'})`);
      }
    } catch (error) {
      console.error('Failed to initialize TTS service:', error);
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
  logger.info(`[${requestId}] ======== TRANSCRIBE REQUEST START ========`);

  try {
    if (!req.file) {
      logger.warn(`[${requestId}] No audio file in request`);
      return res.status(400).json({ error: 'No audio file provided' });
    }

    logger.info(`[${requestId}] Received audio file:`);
    logger.info(`[${requestId}]   - Size: ${req.file.size} bytes`);
    logger.info(`[${requestId}]   - Type: ${req.file.mimetype}`);
    logger.info(`[${requestId}]   - Original name: ${req.file.originalname}`);
    logger.info(`[${requestId}]   - Buffer length: ${req.file.buffer.length}`);

    logger.info(`[${requestId}] Initializing voice services...`);
    const manager = initializeVoiceServices();
    logger.info(`[${requestId}] Voice services initialized`);

    logger.info(`[${requestId}] Checking STT service...`);
    logger.info(`[${requestId}]   - STT service exists: ${!!manager.sttService}`);
    logger.info(`[${requestId}]   - STT service ready: ${manager.sttService.isReady()}`);

    // Transcribe the audio file directly (it's already in webm format)
    logger.info(`[${requestId}] Starting transcription...`);
    const startTime = Date.now();

    try {
      const result = await manager.sttService.transcribeBuffer(req.file.buffer, 'en');
      const duration = Date.now() - startTime;

      logger.info(`[${requestId}] ✓ Transcription successful!`);
      logger.info(`[${requestId}]   - Text: "${result.text}"`);
      logger.info(`[${requestId}]   - Duration: ${result.duration}ms`);
      logger.info(`[${requestId}]   - Processing time: ${duration}ms`);

      console.log(`✓ Transcribed: "${result.text}" (${duration}ms)`);

      res.json({
        success: true,
        text: result.text,
        duration: duration
      });
    } catch (transcribeError) {
      logger.error(`[${requestId}] Transcription failed:`, transcribeError);
      logger.error(`[${requestId}]   - Error name: ${transcribeError.name}`);
      logger.error(`[${requestId}]   - Error message: ${transcribeError.message}`);
      logger.error(`[${requestId}]   - Error stack: ${transcribeError.stack}`);
      if (transcribeError.cause) {
        logger.error(`[${requestId}]   - Error cause: ${JSON.stringify(transcribeError.cause, null, 2)}`);
      }
      throw transcribeError;
    }

    logger.info(`[${requestId}] ======== TRANSCRIBE REQUEST END (SUCCESS) ========`);
  } catch (error) {
    logger.error(`[${requestId}] ======== TRANSCRIBE REQUEST END (ERROR) ========`);
    logger.error(`[${requestId}] Final error:`, error);
    console.error('Transcription error:', error);
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
    const { text, streaming = false, voice, speed, model } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const tts = initializeTTSService();
    const provider = process.env.TTS_PROVIDER || 'openai';

    const options = {};
    if (voice) options.voice = voice;
    if (speed) options.speed = speed;
    if (model) options.model = model;

    console.log(`[TTS] Synthesizing with ${provider}: voice=${voice || 'default'}, speed=${speed || 'default'}, model=${model || 'default'}`);

    // Synthesize speech with per-request options
    const result = await tts.synthesize(text, Object.keys(options).length > 0 ? options : undefined);

    if (result && result.buffer) {
      // Send audio as base64
      res.json({
        success: true,
        audioData: result.buffer.toString('base64'),
        format: result.format || (provider === 'voicevox' ? 'wav' : 'mp3')
      });
      console.log(`[TTS] ✓ Synthesis complete: ${result.buffer.length} bytes (${result.format})`);
    } else {
      res.json({
        success: true,
        audioData: null
      });
    }
  } catch (error) {
    console.error('Synthesis error:', error);
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

module.exports = router;
