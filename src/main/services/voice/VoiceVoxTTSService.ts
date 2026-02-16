import fetch from 'node-fetch';

/**
 * VoiceVoxTTSService - Text-to-Speech using VOICEVOX (Japanese anime-style voices)
 *
 * Features:
 * - Authentic Japanese anime character voices
 * - Speaks English with Japanese accent
 * - Multiple character voice options
 * - Free and open-source
 *
 * Popular Speaker IDs:
 * - 1: Zundamon (ずんだもん) - Cute, high-pitched
 * - 0: Shikoku Metan Normal (四国めたん) - Sweet, gentle
 * - 2: Shikoku Metan Amaama - Even sweeter
 * - 3: Zundamon Amaama - Extra cute
 * - 8: Kasukabe Tsumugi (春日部つむぎ) - Cheerful
 */
export class VoiceVoxTTSService {
  private baseUrl: string;
  private defaultSpeaker: number;
  private speedScale: number;
  private isInitialized: boolean = false;

  constructor(baseUrl: string = 'http://localhost:50021', speaker: number = 3) {
    this.baseUrl = baseUrl;
    this.defaultSpeaker = speaker; // Default to Zundamon Amaama (cute voice)
    this.speedScale = 1.0;
    // Initialize asynchronously in background
    this.initialize().catch(err => console.warn('VOICEVOX initialization warning:', err));
  }

  /**
   * Initialize and check if VOICEVOX is running
   */
  async initialize(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/version`, {
        method: 'GET',
      });

      if (response.ok) {
        const version = await response.text();
        this.isInitialized = true;
        console.log(`VoiceVoxTTSService initialized successfully (version: ${version})`);
      } else {
        console.warn('VOICEVOX is not responding. Make sure VOICEVOX is running.');
        this.isInitialized = false;
      }
    } catch (error) {
      console.warn('Failed to connect to VOICEVOX. Make sure it is running on', this.baseUrl);
      this.isInitialized = false;
    }
  }

  /**
   * Ensure service is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      console.log('[VOICEVOX] Not initialized yet, initializing now...');
      await this.initialize();
      if (!this.isInitialized) {
        throw new Error('VoiceVoxTTSService not initialized. Make sure VOICEVOX is running.');
      }
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Set default speaker/voice
   */
  setDefaultSpeaker(speaker: number): void {
    this.defaultSpeaker = speaker;
    console.log(`VoiceVox speaker set to: ${speaker}`);
  }

  /**
   * Set default speed (0.5 to 2.0)
   */
  setDefaultSpeed(speed: number): void {
    this.speedScale = Math.max(0.5, Math.min(2.0, speed));
    console.log(`VoiceVox speed set to: ${this.speedScale}`);
  }

  /**
   * Synthesize text to speech
   * @param text - Text to synthesize
   * @param options - Synthesis options
   * @returns Audio buffer (WAV format)
   */
  async synthesize(
    text: string,
    options?: {
      speaker?: number;
      speedScale?: number;
    }
  ): Promise<{ buffer: Buffer; format: string }> {
    // Ensure service is initialized
    await this.ensureInitialized();

    const speaker = options?.speaker ?? this.defaultSpeaker;
    const speedScale = options?.speedScale ?? this.speedScale;

    try {
      console.log(`[VOICEVOX] Synthesizing text: "${text}" with speaker ${speaker}`);

      // Step 1: Create audio query
      const queryResponse = await fetch(
        `${this.baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
        {
          method: 'POST',
        }
      );

      if (!queryResponse.ok) {
        throw new Error(`Failed to create audio query: ${queryResponse.statusText}`);
      }

      const audioQuery = await queryResponse.json();

      // Adjust speed if needed
      if (speedScale !== 1.0) {
        audioQuery.speedScale = speedScale;
      }

      // Step 2: Synthesize audio
      const synthesisResponse = await fetch(
        `${this.baseUrl}/synthesis?speaker=${speaker}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(audioQuery),
        }
      );

      if (!synthesisResponse.ok) {
        throw new Error(`Failed to synthesize audio: ${synthesisResponse.statusText}`);
      }

      const audioBuffer = await synthesisResponse.buffer();

      console.log(`[VOICEVOX] Synthesis complete: ${audioBuffer.length} bytes`);

      return {
        buffer: audioBuffer,
        format: 'wav',
      };
    } catch (error) {
      console.error('[VOICEVOX] Synthesis error:', error);
      throw new Error(`Failed to synthesize speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Synthesize with streaming (VOICEVOX doesn't support true streaming, so we just synthesize and return)
   */
  async synthesizeStreaming(
    text: string,
    onChunk: (buffer: Buffer, isLast: boolean) => void,
    options?: {
      speaker?: number;
      speedScale?: number;
    }
  ): Promise<void> {
    const result = await this.synthesize(text, options);
    onChunk(result.buffer, true);
  }

  /**
   * Get available speakers/voices
   */
  async getSpeakers(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/speakers`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to get speakers: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[VOICEVOX] Failed to get speakers:', error);
      return [];
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.isInitialized = false;
    console.log('VoiceVoxTTSService cleaned up');
  }
}

// Singleton instance
let instance: VoiceVoxTTSService | null = null;

export function getVoiceVoxTTSService(
  baseUrl?: string,
  speaker?: number
): VoiceVoxTTSService {
  if (!instance) {
    instance = new VoiceVoxTTSService(baseUrl, speaker);
  }
  return instance;
}
