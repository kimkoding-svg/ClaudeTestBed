import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Try to import electron, but don't fail if not available
let app: any = null;
try {
  app = require('electron').app;
} catch {
  // Not in Electron context, use Node.js alternatives
}

/**
 * WhisperSTTService - Speech-to-Text using OpenAI Whisper API
 *
 * Features:
 * - Streaming transcription support (processes audio chunks)
 * - Multi-language support
 * - High accuracy transcription
 */
export class WhisperSTTService {
  private openai: OpenAI | null = null;
  private isInitialized: boolean = false;
  private tempAudioDir: string;

  constructor(apiKey?: string) {
    // Use Electron's temp path if available, otherwise use Node's os.tmpdir()
    const tempDir = app ? app.getPath('temp') : os.tmpdir();
    this.tempAudioDir = path.join(tempDir, 'ai-companion-audio');

    // Create temp directory for audio files
    if (!fs.existsSync(this.tempAudioDir)) {
      fs.mkdirSync(this.tempAudioDir, { recursive: true });
    }

    if (apiKey) {
      this.initialize(apiKey);
    }
  }

  /**
   * Initialize the Whisper service with API key
   */
  initialize(apiKey: string): void {
    try {
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
      this.isInitialized = true;
      console.log('WhisperSTTService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WhisperSTTService:', error);
      throw error;
    }
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.openai !== null;
  }

  /**
   * Transcribe audio from a buffer
   * @param audioBuffer - Audio data as Buffer
   * @param language - Optional language code (e.g., 'en', 'es')
   * @returns Transcribed text
   */
  async transcribeBuffer(
    audioBuffer: Buffer,
    language: string = 'en'
  ): Promise<{ text: string; duration?: number }> {
    if (!this.isReady()) {
      throw new Error('WhisperSTTService not initialized. Call initialize() with API key first.');
    }

    const startTime = Date.now();
    let tempFilePath: string | null = null;

    try {
      // Write buffer to temporary file
      tempFilePath = path.join(
        this.tempAudioDir,
        `audio-${Date.now()}.webm`
      );

      console.log(`[STT] Writing ${audioBuffer.length} bytes to ${tempFilePath}`);
      fs.writeFileSync(tempFilePath, audioBuffer);

      const fileStats = fs.statSync(tempFilePath);
      console.log(`[STT] File written successfully: ${fileStats.size} bytes`);

      console.log(`[STT] Creating API request to OpenAI Whisper...`);
      console.log(`[STT] API Key: ${this.openai!.apiKey.substring(0, 20)}...`);

      // Transcribe using Whisper API
      const transcription = await this.openai!.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath) as any,
        model: 'whisper-1',
        language: language,
        response_format: 'json',
        prompt: '',
        temperature: 0,
      });

      console.log(`[STT] API response received`);

      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`[STT] Temp file cleaned up`);
      }

      const duration = Date.now() - startTime;

      console.log(`Transcription completed in ${duration}ms: "${transcription.text}"`);

      return {
        text: transcription.text.trim(),
        duration,
      };
    } catch (error) {
      console.error('[STT] Transcription error:', error);
      console.error('[STT] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown',
        stack: error instanceof Error ? error.stack : 'No stack',
      });

      // Clean up temp file on error
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`[STT] Temp file cleaned up after error`);
        } catch (cleanupError) {
          console.error('[STT] Failed to clean up temp file:', cleanupError);
        }
      }

      throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transcribe audio from a file path
   * @param filePath - Path to audio file
   * @param language - Optional language code
   * @returns Transcribed text
   */
  async transcribeFile(
    filePath: string,
    language: string = 'en'
  ): Promise<{ text: string; duration?: number }> {
    if (!this.isReady()) {
      throw new Error('WhisperSTTService not initialized. Call initialize() with API key first.');
    }

    const startTime = Date.now();

    try {
      const transcription = await this.openai!.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1',
        language: language,
        response_format: 'json',
      });

      const duration = Date.now() - startTime;

      console.log(`Transcription completed in ${duration}ms: "${transcription.text}"`);

      return {
        text: transcription.text.trim(),
        duration,
      };
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transcribe with timestamps for word-level timing
   */
  async transcribeWithTimestamps(
    audioBuffer: Buffer,
    language: string = 'en'
  ): Promise<{ text: string; segments?: any[]; duration?: number }> {
    if (!this.isReady()) {
      throw new Error('WhisperSTTService not initialized. Call initialize() with API key first.');
    }

    const startTime = Date.now();

    try {
      const tempFilePath = path.join(
        this.tempAudioDir,
        `audio-${Date.now()}.webm`
      );

      fs.writeFileSync(tempFilePath, audioBuffer);

      const transcription = await this.openai!.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: language,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      fs.unlinkSync(tempFilePath);

      const duration = Date.now() - startTime;

      return {
        text: transcription.text.trim(),
        segments: (transcription as any).segments,
        duration,
      };
    } catch (error) {
      console.error('Transcription with timestamps error:', error);
      throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up temporary audio files
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.tempAudioDir)) {
        const files = fs.readdirSync(this.tempAudioDir);
        files.forEach(file => {
          const filePath = path.join(this.tempAudioDir, file);
          fs.unlinkSync(filePath);
        });
      }
      console.log('Temporary audio files cleaned up');
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }
}

// Singleton instance
let instance: WhisperSTTService | null = null;

export function getWhisperSTTService(apiKey?: string): WhisperSTTService {
  if (!instance) {
    instance = new WhisperSTTService(apiKey);
  } else if (apiKey && !instance.isReady()) {
    instance.initialize(apiKey);
  }
  return instance;
}
