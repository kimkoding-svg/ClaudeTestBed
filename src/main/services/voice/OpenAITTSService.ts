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
 * OpenAITTSService - Text-to-Speech using OpenAI TTS API
 *
 * Features:
 * - Multiple voice options (alloy, echo, fable, onyx, nova, shimmer)
 * - Adjustable speech speed
 * - High-quality audio output
 * - Streaming support for low latency
 */
export class OpenAITTSService {
  private openai: OpenAI | null = null;
  private isInitialized: boolean = false;
  private tempAudioDir: string;
  private defaultVoice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova';
  private defaultSpeed: number = 1.0;

  constructor(apiKey?: string) {
    // Use Electron's temp path if available, otherwise use Node's os.tmpdir()
    const tempDir = app ? app.getPath('temp') : os.tmpdir();
    this.tempAudioDir = path.join(tempDir, 'ai-companion-tts');

    // Create temp directory for audio files
    if (!fs.existsSync(this.tempAudioDir)) {
      fs.mkdirSync(this.tempAudioDir, { recursive: true });
    }

    if (apiKey) {
      this.initialize(apiKey);
    }
  }

  /**
   * Initialize the TTS service with API key
   */
  initialize(apiKey: string): void {
    try {
      this.openai = new OpenAI({
        apiKey: apiKey,
      });
      this.isInitialized = true;
      console.log('OpenAITTSService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAITTSService:', error);
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
   * Set default voice
   */
  setDefaultVoice(voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'): void {
    this.defaultVoice = voice;
  }

  /**
   * Set default speed (0.25 to 4.0)
   */
  setDefaultSpeed(speed: number): void {
    if (speed < 0.25 || speed > 4.0) {
      throw new Error('Speed must be between 0.25 and 4.0');
    }
    this.defaultSpeed = speed;
  }

  /**
   * Synthesize speech from text and return audio buffer
   * @param text - Text to synthesize
   * @param options - Optional voice and speed settings
   * @returns Audio buffer
   */
  async synthesize(
    text: string,
    options?: {
      voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
      speed?: number;
      model?: 'tts-1' | 'tts-1-hd';
    }
  ): Promise<{ buffer: Buffer; duration?: number }> {
    if (!this.isReady()) {
      throw new Error('OpenAITTSService not initialized. Call initialize() with API key first.');
    }

    const startTime = Date.now();

    try {
      const voice = options?.voice || this.defaultVoice;
      const speed = options?.speed || this.defaultSpeed;
      const model = options?.model || 'tts-1-hd'; // HD for more natural sounding voice

      console.log(`Synthesizing speech: "${text.substring(0, 50)}..." with voice: ${voice}, model: ${model}`);

      const mp3 = await this.openai!.audio.speech.create({
        model: model,
        voice: voice,
        input: text,
        speed: speed,
        response_format: 'mp3',
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      const duration = Date.now() - startTime;

      console.log(`Speech synthesis completed in ${duration}ms, buffer size: ${buffer.length} bytes`);

      return {
        buffer,
        duration,
      };
    } catch (error) {
      console.error('Speech synthesis error:', error);
      throw new Error(`Failed to synthesize speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Synthesize speech and save to file
   * @param text - Text to synthesize
   * @param outputPath - Path to save audio file
   * @param options - Optional voice and speed settings
   * @returns Path to saved file
   */
  async synthesizeToFile(
    text: string,
    outputPath: string,
    options?: {
      voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
      speed?: number;
      model?: 'tts-1' | 'tts-1-hd';
    }
  ): Promise<{ filePath: string; duration?: number }> {
    const { buffer, duration } = await this.synthesize(text, options);

    fs.writeFileSync(outputPath, buffer);

    return {
      filePath: outputPath,
      duration,
    };
  }

  /**
   * Synthesize speech in chunks for streaming playback
   * Split text into sentences and synthesize each separately for lower perceived latency
   * @param text - Full text to synthesize
   * @param onChunk - Callback for each synthesized chunk
   * @param options - Optional voice and speed settings
   */
  async synthesizeStreaming(
    text: string,
    onChunk: (buffer: Buffer, isLast: boolean) => void,
    options?: {
      voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
      speed?: number;
    }
  ): Promise<void> {
    if (!this.isReady()) {
      throw new Error('OpenAITTSService not initialized. Call initialize() with API key first.');
    }

    // Split text into sentences
    const sentences = this.splitIntoSentences(text);

    console.log(`Synthesizing ${sentences.length} sentences for streaming playback`);

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const isLast = i === sentences.length - 1;

      try {
        const { buffer } = await this.synthesize(sentence, {
          ...options,
          model: 'tts-1', // Use standard quality for lower latency
        });

        onChunk(buffer, isLast);
      } catch (error) {
        console.error(`Error synthesizing sentence ${i + 1}:`, error);
        // Continue with next sentence
      }
    }
  }

  /**
   * Split text into sentences for streaming synthesis
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries (., !, ?)
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // If no sentence boundaries found, split on length (max 200 chars)
    if (sentences.length === 1 && sentences[0].length > 200) {
      const chunks: string[] = [];
      const words = sentences[0].split(' ');
      let chunk = '';

      for (const word of words) {
        if ((chunk + ' ' + word).length > 200) {
          chunks.push(chunk.trim());
          chunk = word;
        } else {
          chunk += (chunk ? ' ' : '') + word;
        }
      }

      if (chunk) {
        chunks.push(chunk.trim());
      }

      return chunks;
    }

    return sentences;
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
      console.log('Temporary TTS files cleaned up');
    } catch (error) {
      console.error('Error cleaning up TTS temp files:', error);
    }
  }
}

// Singleton instance
let instance: OpenAITTSService | null = null;

export function getOpenAITTSService(apiKey?: string): OpenAITTSService {
  if (!instance) {
    instance = new OpenAITTSService(apiKey);
  } else if (apiKey && !instance.isReady()) {
    instance.initialize(apiKey);
  }
  return instance;
}
