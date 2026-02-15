const { ipcMain } = require('electron');

/**
 * Voice IPC Handlers
 *
 * Note: This file will be updated to integrate with compiled TypeScript voice services
 * once the build process is configured.
 */

// Voice Pipeline Manager instance (will be initialized with TypeScript services)
let voicePipelineManager = null;
let audioRecordingBuffer = [];

/**
 * Initialize voice pipeline with API key
 */
ipcMain.handle('voice:initialize', async (_event, config) => {
  try {
    console.log('Initializing voice pipeline...');

    // TODO: Initialize VoicePipelineManager when TypeScript services are compiled
    // For now, return success
    // const { getVoicePipelineManager } = require('../dist-electron/services/voice/VoicePipelineManager');
    // voicePipelineManager = getVoicePipelineManager(config);

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
    audioRecordingBuffer = [];

    // TODO: Start recording with VoicePipelineManager
    // if (voicePipelineManager) {
    //   voicePipelineManager.startRecording();
    // }

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
    // Convert audio data to Buffer
    const buffer = Buffer.from(audioData);
    audioRecordingBuffer.push(buffer);

    // TODO: Add chunk to VoicePipelineManager
    // if (voicePipelineManager) {
    //   voicePipelineManager.addAudioChunk(buffer);
    // }

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

    // TODO: Stop recording and transcribe with VoicePipelineManager
    // if (voicePipelineManager) {
    //   const result = await voicePipelineManager.stopRecording();
    //   return { success: true, text: result.text, duration: result.duration };
    // }

    // Placeholder response
    return {
      success: true,
      text: 'Voice recording stopped (transcription service pending)',
      duration: 0
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

    // TODO: Synthesize with VoicePipelineManager
    // if (voicePipelineManager) {
    //   const buffer = await voicePipelineManager.synthesizeSpeech(text, options.streaming);
    //   return { success: true, audioData: Array.from(buffer) };
    // }

    // Placeholder response
    return { success: true, audioData: [] };
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
    return {
      success: true,
      isReady: voicePipelineManager ? voicePipelineManager.isReady() : false,
      isRecording: voicePipelineManager ? voicePipelineManager.isCurrentlyRecording() : false,
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

    // TODO: Update config with VoicePipelineManager
    // if (voicePipelineManager) {
    //   voicePipelineManager.updateConfig(config);
    // }

    return { success: true };
  } catch (error) {
    console.error('Failed to update voice config:', error);
    return { success: false, error: error.message };
  }
});

console.log('Voice IPC handlers registered');

module.exports = {
  // Export for potential cleanup
  cleanup: () => {
    if (voicePipelineManager) {
      voicePipelineManager.cleanup();
      voicePipelineManager = null;
    }
    audioRecordingBuffer = [];
  }
};
