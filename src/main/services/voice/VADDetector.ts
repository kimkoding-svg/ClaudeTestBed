/**
 * VADDetector - Voice Activity Detection
 *
 * Detects speech in audio streams to determine when user starts/stops speaking.
 * Uses volume-based detection with configurable thresholds.
 *
 * For production, consider using more sophisticated VAD like:
 * - @ricky0123/vad-web (WebRTC VAD)
 * - Silero VAD
 */

export interface VADConfig {
  /** Volume threshold (0-1) for speech detection */
  threshold: number;
  /** Minimum speech duration in ms to consider as valid speech */
  minSpeechDuration: number;
  /** Silence duration in ms before considering speech ended */
  silenceDuration: number;
  /** Sample rate for audio analysis */
  sampleRate: number;
}

export interface VADResult {
  isSpeaking: boolean;
  volume: number;
  timestamp: number;
}

export class VADDetector {
  private config: VADConfig;
  private isSpeaking: boolean = false;
  private speechStartTime: number = 0;
  private lastSpeechTime: number = 0;

  constructor(config?: Partial<VADConfig>) {
    this.config = {
      threshold: config?.threshold ?? 0.5,
      minSpeechDuration: config?.minSpeechDuration ?? 300,
      silenceDuration: config?.silenceDuration ?? 1000,
      sampleRate: config?.sampleRate ?? 16000,
    };

    console.log('VADDetector initialized with config:', this.config);
  }

  /**
   * Analyze audio buffer to detect speech
   * @param audioData - Float32Array of audio samples
   * @returns VAD result
   */
  analyze(audioData: Float32Array): VADResult {
    const volume = this.calculateVolume(audioData);
    const timestamp = Date.now();

    const result: VADResult = {
      isSpeaking: this.isSpeaking,
      volume,
      timestamp,
    };

    // Check if volume exceeds threshold
    if (volume > this.config.threshold) {
      if (!this.isSpeaking) {
        // Speech just started
        this.speechStartTime = timestamp;
        this.isSpeaking = true;
        console.log(`Speech started (volume: ${volume.toFixed(3)})`);
      }
      this.lastSpeechTime = timestamp;
    } else {
      // Volume below threshold
      if (this.isSpeaking) {
        const speechDuration = timestamp - this.speechStartTime;
        const silenceDuration = timestamp - this.lastSpeechTime;

        // Check if speech was long enough and silence duration exceeded
        if (
          speechDuration >= this.config.minSpeechDuration &&
          silenceDuration >= this.config.silenceDuration
        ) {
          // Speech ended
          this.isSpeaking = false;
          console.log(
            `Speech ended (duration: ${speechDuration}ms, silence: ${silenceDuration}ms)`
          );
        }
      }
    }

    result.isSpeaking = this.isSpeaking;
    return result;
  }

  /**
   * Calculate volume (RMS) of audio data
   * @param audioData - Float32Array of audio samples (-1 to 1)
   * @returns Volume level (0 to 1)
   */
  private calculateVolume(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);
    return Math.min(rms, 1.0);
  }

  /**
   * Calculate volume from Buffer (for Node.js audio data)
   * @param buffer - Audio buffer
   * @returns Volume level (0 to 1)
   */
  calculateVolumeFromBuffer(buffer: Buffer): number {
    // Convert buffer to Float32Array (assuming 16-bit PCM)
    const samples = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.length / 2
    );

    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / 32768.0; // Normalize to -1 to 1
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / samples.length);
    return Math.min(rms, 1.0);
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
    console.log('VADDetector reset');
  }

  /**
   * Check if currently detecting speech
   */
  isSpeechActive(): boolean {
    return this.isSpeaking;
  }

  /**
   * Get current speech duration in ms (if speaking)
   */
  getSpeechDuration(): number {
    if (!this.isSpeaking) return 0;
    return Date.now() - this.speechStartTime;
  }

  /**
   * Update VAD configuration
   */
  updateConfig(config: Partial<VADConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
    console.log('VADDetector config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): VADConfig {
    return { ...this.config };
  }
}

// Singleton instance
let instance: VADDetector | null = null;

export function getVADDetector(config?: Partial<VADConfig>): VADDetector {
  if (!instance) {
    instance = new VADDetector(config);
  } else if (config) {
    instance.updateConfig(config);
  }
  return instance;
}
