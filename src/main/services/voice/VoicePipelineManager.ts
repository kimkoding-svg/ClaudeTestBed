import { EventEmitter } from 'events';
import { getWhisperSTTService, WhisperSTTService } from './WhisperSTTService';
import { getOpenAITTSService, OpenAITTSService } from './OpenAITTSService';
import { getVADDetector, VADDetector } from './VADDetector';

/**
 * VoicePipelineManager - Orchestrates the complete voice pipeline
 *
 * Flow:
 * 1. Audio Recording → VAD Detection
 * 2. Speech Detection → STT (Whisper)
 * 3. Text → LLM Processing (handled externally)
 * 4. Response Text → TTS (OpenAI)
 * 5. Audio Playback → Speaker
 *
 * Events:
 * - 'recording-started': Recording has begun
 * - 'recording-stopped': Recording has ended
 * - 'speech-detected': Speech activity detected
 * - 'speech-ended': Speech activity ended
 * - 'transcript': Transcription result { text, isFinal }
 * - 'audio-chunk': TTS audio chunk ready { buffer, isLast }
 * - 'error': Error occurred { error }
 */

export interface VoicePipelineConfig {
  openAIApiKey: string;
  sttLanguage?: string;
  ttsVoice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  ttsSpeed?: number;
  vadThreshold?: number;
  vadMinSpeechDuration?: number;
  vadSilenceDuration?: number;
}

export class VoicePipelineManager extends EventEmitter {
  private sttService: WhisperSTTService;
  private ttsService: OpenAITTSService;
  private vadDetector: VADDetector;
  private config: VoicePipelineConfig;

  private isRecording: boolean = false;
  private audioChunks: Buffer[] = [];
  private recordingStartTime: number = 0;

  constructor(config: VoicePipelineConfig) {
    super();

    this.config = config;

    // Initialize services
    this.sttService = getWhisperSTTService(config.openAIApiKey);
    this.ttsService = getOpenAITTSService(config.openAIApiKey);
    this.vadDetector = getVADDetector({
      threshold: config.vadThreshold ?? 0.5,
      minSpeechDuration: config.vadMinSpeechDuration ?? 300,
      silenceDuration: config.vadSilenceDuration ?? 1000,
    });

    // Set TTS preferences
    if (config.ttsVoice) {
      this.ttsService.setDefaultVoice(config.ttsVoice);
    }
    if (config.ttsSpeed) {
      this.ttsService.setDefaultSpeed(config.ttsSpeed);
    }

    console.log('VoicePipelineManager initialized');
  }

  /**
   * Start recording audio
   */
  startRecording(): void {
    if (this.isRecording) {
      console.warn('Already recording');
      return;
    }

    this.isRecording = true;
    this.audioChunks = [];
    this.recordingStartTime = Date.now();
    this.vadDetector.reset();

    this.emit('recording-started');
    console.log('Recording started');
  }

  /**
   * Add audio chunk to recording buffer
   * @param audioChunk - Audio data as Buffer
   */
  addAudioChunk(audioChunk: Buffer): void {
    if (!this.isRecording) {
      return;
    }

    this.audioChunks.push(audioChunk);

    // Analyze for voice activity
    const volume = this.vadDetector.calculateVolumeFromBuffer(audioChunk);
    const vadResult = this.vadDetector.analyze(new Float32Array(audioChunk.length));

    if (vadResult.isSpeaking) {
      this.emit('speech-detected', { volume });
    }
  }

  /**
   * Stop recording and transcribe
   * @returns Transcription result
   */
  async stopRecording(): Promise<{ text: string; duration: number }> {
    if (!this.isRecording) {
      throw new Error('Not currently recording');
    }

    this.isRecording = false;
    const recordingDuration = Date.now() - this.recordingStartTime;

    this.emit('recording-stopped', { duration: recordingDuration });
    console.log(`Recording stopped. Duration: ${recordingDuration}ms, Chunks: ${this.audioChunks.length}`);

    // Combine all audio chunks
    const audioBuffer = Buffer.concat(this.audioChunks);
    this.audioChunks = [];

    // Check if we have audio data
    if (audioBuffer.length === 0) {
      throw new Error('No audio data recorded');
    }

    // Transcribe
    try {
      const result = await this.sttService.transcribeBuffer(
        audioBuffer,
        this.config.sttLanguage
      );

      this.emit('transcript', {
        text: result.text,
        isFinal: true,
        duration: result.duration,
      });

      return {
        text: result.text,
        duration: recordingDuration,
      };
    } catch (error) {
      this.emit('error', { error });
      throw error;
    }
  }

  /**
   * Synthesize speech from text
   * @param text - Text to synthesize
   * @param streaming - Whether to stream audio chunks
   * @returns Audio buffer (if not streaming)
   */
  async synthesizeSpeech(
    text: string,
    streaming: boolean = true
  ): Promise<Buffer | void> {
    try {
      if (streaming) {
        // Stream audio chunks for lower perceived latency
        await this.ttsService.synthesizeStreaming(
          text,
          (buffer, isLast) => {
            this.emit('audio-chunk', { buffer, isLast });
          },
          {
            voice: this.config.ttsVoice,
            speed: this.config.ttsSpeed,
          }
        );
      } else {
        // Synthesize entire audio at once
        const { buffer } = await this.ttsService.synthesize(text, {
          voice: this.config.ttsVoice,
          speed: this.config.ttsSpeed,
        });

        this.emit('audio-chunk', { buffer, isLast: true });
        return buffer;
      }
    } catch (error) {
      this.emit('error', { error });
      throw error;
    }
  }

  /**
   * Check if services are ready
   */
  isReady(): boolean {
    return this.sttService.isReady() && this.ttsService.isReady();
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get recording duration in ms (if recording)
   */
  getRecordingDuration(): number {
    if (!this.isRecording) return 0;
    return Date.now() - this.recordingStartTime;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VoicePipelineConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.openAIApiKey) {
      this.sttService.initialize(config.openAIApiKey);
      this.ttsService.initialize(config.openAIApiKey);
    }

    if (config.ttsVoice) {
      this.ttsService.setDefaultVoice(config.ttsVoice);
    }

    if (config.ttsSpeed) {
      this.ttsService.setDefaultSpeed(config.ttsSpeed);
    }

    if (config.vadThreshold || config.vadMinSpeechDuration || config.vadSilenceDuration) {
      this.vadDetector.updateConfig({
        threshold: config.vadThreshold,
        minSpeechDuration: config.vadMinSpeechDuration,
        silenceDuration: config.vadSilenceDuration,
      });
    }

    console.log('VoicePipelineManager config updated');
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.sttService.cleanup();
    this.ttsService.cleanup();
    this.vadDetector.reset();
    this.audioChunks = [];
    this.removeAllListeners();
    console.log('VoicePipelineManager cleaned up');
  }
}

// Singleton instance
let instance: VoicePipelineManager | null = null;

export function getVoicePipelineManager(config?: VoicePipelineConfig): VoicePipelineManager {
  if (!instance && config) {
    instance = new VoicePipelineManager(config);
  } else if (!instance) {
    throw new Error('VoicePipelineManager not initialized. Provide config on first call.');
  }
  return instance;
}

export function resetVoicePipelineManager(): void {
  if (instance) {
    instance.cleanup();
    instance = null;
  }
}
