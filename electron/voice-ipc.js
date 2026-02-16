const path = require('path');

/**
 * Voice IPC Handlers - Integrated with TypeScript voice services
 */

// Voice Pipeline Manager instance
let voicePipelineManager = null;

/**
 * Initialize voice pipeline on first use
 */
function ensureVoicePipelineInitialized() {
  if (!voicePipelineManager) {
    // Auto-initialize with API key from environment
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }

    try {
      const { getVoicePipelineManager } = require('../dist-electron/main/services/voice/VoicePipelineManager');

      voicePipelineManager = getVoicePipelineManager({
        openAIApiKey: apiKey,
        sttLanguage: process.env.VOICE_STT_LANGUAGE || 'en',
        ttsVoice: process.env.VOICE_TTS_VOICE || 'nova',
        ttsSpeed: parseFloat(process.env.VOICE_TTS_SPEED || '1.0'),
      });

      console.log('VoicePipelineManager initialized successfully');
    } catch (error) {
      console.error('Failed to load VoicePipelineManager:', error);
      throw new Error('Voice services not compiled. Run: npm run build:main');
    }
  }
  return voicePipelineManager;
}

/**
 * Register voice IPC handlers
 * @param {Electron.IpcMain} ipcMain - The ipcMain instance from electron
 */
function registerVoiceHandlers(ipcMain) {
  /**
   * Initialize voice pipeline with API key
   */
  ipcMain.handle('voice:initialize', async (_event, config) => {
    try {
      console.log('Initializing voice pipeline...');
      ensureVoicePipelineInitialized();
      return { success: true, message: 'Voice pipeline initialized' };
    } catch (error) {
      console.error('Failed to initialize voice pipeline:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Start recording audio
   */
  ipcMain.handle('voice:start-recording', async () => {
    try {
      console.log('Starting voice recording...');
      const manager = ensureVoicePipelineInitialized();
      manager.startRecording();
      return { success: true };
    } catch (error) {
      console.error('Failed to start recording:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Add audio chunk to recording
   */
  ipcMain.handle('voice:add-audio-chunk', async (_event, audioData) => {
    try {
      const manager = ensureVoicePipelineInitialized();
      const buffer = Buffer.from(audioData);
      manager.addAudioChunk(buffer);
      return { success: true };
    } catch (error) {
      console.error('Failed to add audio chunk:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Stop recording and transcribe
   */
  ipcMain.handle('voice:stop-recording', async () => {
    try {
      console.log('Stopping voice recording and transcribing...');
      const manager = ensureVoicePipelineInitialized();
      const result = await manager.stopRecording();

      console.log(`Transcription complete: "${result.text}" (${result.duration}ms)`);

      return {
        success: true,
        text: result.text,
        duration: result.duration
      };
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Synthesize speech from text
   */
  ipcMain.handle('voice:synthesize-speech', async (_event, text, options = {}) => {
    try {
      console.log(`Synthesizing speech: "${text.substring(0, 50)}..."`);
      const manager = ensureVoicePipelineInitialized();

      const buffer = await manager.synthesizeSpeech(text, options.streaming || false);

      return {
        success: true,
        audioData: buffer ? Array.from(buffer) : []
      };
    } catch (error) {
      console.error('Failed to synthesize speech:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get voice pipeline status
   */
  ipcMain.handle('voice:get-status', async () => {
    try {
      if (!voicePipelineManager) {
        return {
          success: true,
          isReady: false,
          isRecording: false,
        };
      }

      return {
        success: true,
        isReady: voicePipelineManager.isReady(),
        isRecording: voicePipelineManager.isCurrentlyRecording(),
      };
    } catch (error) {
      console.error('Failed to get voice status:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Update voice configuration
   */
  ipcMain.handle('voice:update-config', async (_event, config) => {
    try {
      console.log('Updating voice configuration...');
      const manager = ensureVoicePipelineInitialized();
      manager.updateConfig(config);
      return { success: true };
    } catch (error) {
      console.error('Failed to update voice config:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('Voice IPC handlers registered');
}

module.exports = {
  registerVoiceHandlers,
  // Export for potential cleanup
  cleanup: () => {
    if (voicePipelineManager) {
      voicePipelineManager.cleanup();
      voicePipelineManager = null;
    }
  }
};
