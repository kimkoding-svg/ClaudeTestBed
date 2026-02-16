import { useState, useCallback, useEffect, useRef } from 'react';
import { transcribeAudio } from '../services/api';

export interface AutoVoiceRecordingState {
  isListening: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  transcript: string;
  error: string | null;
  volume: number;
}

export interface UseAutoVoiceRecordingReturn extends AutoVoiceRecordingState {
  startListening: () => Promise<void>;
  stopListening: () => void;
  onTranscript?: (text: string) => void;
}

interface UseAutoVoiceRecordingProps {
  onTranscript?: (text: string) => void;
  silenceThreshold?: number;
  silenceDuration?: number;
  minRecordingDuration?: number;
}

export function useAutoVoiceRecording({
  onTranscript,
  silenceThreshold = 0.1,
  silenceDuration = 1500,
  minRecordingDuration = 500,
}: UseAutoVoiceRecordingProps = {}): UseAutoVoiceRecordingReturn {
  const [state, setState] = useState<AutoVoiceRecordingState>({
    isListening: false,
    isRecording: false,
    isProcessing: false,
    transcript: '',
    error: null,
    volume: 0,
  });

  // Use refs to avoid stale closures in animation frame
  const isListeningRef = useRef(false);
  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const startRecording = useCallback(() => {
    if (isRecordingRef.current || !streamRef.current) return;

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
        mimeType,
        audioBitsPerSecond: 64000, // Higher bitrate for clearer speech
      });
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`📊 Audio chunk received: ${event.data.size} bytes (total chunks: ${audioChunksRef.current.length})`);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        isRecordingRef.current = false;
        const recordingDuration = Date.now() - recordingStartTimeRef.current;
        setState(prev => ({ ...prev, isRecording: false, isProcessing: true }));

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const numChunks = audioChunksRef.current.length;
        audioChunksRef.current = [];

        console.log(`🎙️ Recording stopped. Size: ${audioBlob.size} bytes, Duration: ${recordingDuration}ms, Chunks: ${numChunks}`);

        // Validation: Skip if too small or too short
        if (audioBlob.size < 4000) {
          console.log(`⚠️ Audio too small (${audioBlob.size} bytes), skipping transcription`);
          setState(prev => ({ ...prev, isProcessing: false }));
          return;
        }

        if (recordingDuration < minRecordingDuration) {
          console.log(`⚠️ Recording too short (${recordingDuration}ms < ${minRecordingDuration}ms), skipping transcription`);
          setState(prev => ({ ...prev, isProcessing: false }));
          return;
        }

        console.log('📤 Sending audio to transcription API...');

        try {
          const result = await transcribeAudio(audioBlob);

          if (result.success && result.text) {
            console.log(`✅ Transcribed: "${result.text}"`);
            setState(prev => ({
              ...prev,
              transcript: result.text,
              isProcessing: false,
              error: null,
            }));

            if (onTranscriptRef.current) {
              onTranscriptRef.current(result.text);
            }
          } else {
            const errorMsg = result.error || 'No text returned';
            console.warn(`⚠️ Transcription unsuccessful: ${errorMsg}`);
            // Silently fail for bad audio - don't interrupt flow
            setState(prev => ({
              ...prev,
              isProcessing: false,
              error: null,
            }));
          }
        } catch (error) {
          console.error('❌ Transcription error:', error);
          // Silently fail - don't show errors for occasional bad audio
          setState(prev => ({
            ...prev,
            isProcessing: false,
            error: null,
          }));
        }
      };

      mediaRecorderRef.current.start(50); // Smaller timeslice for more frequent data chunks
      isRecordingRef.current = true;
      setState(prev => ({ ...prev, isRecording: true }));
      console.log('🎙️ Auto-recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const monitorAudioLevels = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkAudioLevel = () => {
      if (!isListeningRef.current) return;

      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const normalizedVolume = average / 255;

      setState(prev => ({ ...prev, volume: normalizedVolume }));

      // Speech detection
      if (normalizedVolume > silenceThreshold) {
        if (!isRecordingRef.current) {
          console.log(`🎤 Speech detected! Volume: ${normalizedVolume.toFixed(3)}`);
          startRecording();
        }

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else {
        // Silence detected
        if (isRecordingRef.current && !silenceTimerRef.current) {
          console.log(`🔇 Silence detected, will stop in ${silenceDuration}ms if continued...`);
          silenceTimerRef.current = setTimeout(() => {
            const duration = Date.now() - recordingStartTimeRef.current;
            console.log(`⏹️ Stopping recording after ${duration}ms (min required: ${minRecordingDuration}ms)`);
            if (duration >= minRecordingDuration) {
              stopRecording();
            } else {
              console.log('⚠️ Recording too short, not stopping');
            }
            silenceTimerRef.current = null;
          }, silenceDuration);
        }
      }

      animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
    };

    checkAudioLevel();
  }, [silenceThreshold, silenceDuration, minRecordingDuration, startRecording, stopRecording]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 },
        }
      });

      streamRef.current = stream;
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      isListeningRef.current = true;
      setState(prev => ({ ...prev, isListening: true }));
      console.log('👂 Started listening...');

      monitorAudioLevels();
    } catch (error) {
      console.error('Failed to start listening:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start listening',
      }));
    }
  }, [monitorAudioLevels]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setState({
      isListening: false,
      isRecording: false,
      isProcessing: false,
      transcript: '',
      error: null,
      volume: 0,
    });

    console.log('👂 Stopped listening');
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    onTranscript,
  };
}
