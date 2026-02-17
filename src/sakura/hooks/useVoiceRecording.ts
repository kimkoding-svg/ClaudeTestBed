import { useState, useCallback, useEffect, useRef } from 'react';
import { transcribeAudio } from '../services/api';

export interface VoiceRecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  transcript: string;
  error: string | null;
  volume: number;
}

export interface UseVoiceRecordingReturn extends VoiceRecordingState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  cancelRecording: () => void;
}

/**
 * Custom hook for voice recording with Web Audio API
 * Handles audio capture, VAD, and communication with Electron backend
 */
export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [state, setState] = useState<VoiceRecordingState>({
    isRecording: false,
    isProcessing: false,
    transcript: '',
    error: null,
    volume: 0,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Monitor audio volume levels
  const startVolumeMonitoring = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    volumeIntervalRef.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const normalizedVolume = average / 255; // Normalize to 0-1

      setState(prev => ({ ...prev, volume: normalizedVolume }));
    }, 100); // Update every 100ms
  }, []);

  const stopVolumeMonitoring = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    setState(prev => ({ ...prev, volume: 0 }));
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null, transcript: '' }));

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Set up audio context for volume monitoring
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType,
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorderRef.current.start(100); // Collect data every 100ms
      startVolumeMonitoring();

      setState(prev => ({ ...prev, isRecording: true }));
      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start recording',
      }));
    }
  }, [startVolumeMonitoring]);

  const stopRecording = useCallback(async (): Promise<string> => {
    if (!mediaRecorderRef.current || !state.isRecording) {
      return '';
    }

    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        try {
          setState(prev => ({ ...prev, isRecording: false, isProcessing: true }));
          stopVolumeMonitoring();

          // Stop all tracks
          mediaRecorder.stream.getTracks().forEach(track => track.stop());

          // Combine audio chunks
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioChunksRef.current = [];

          console.log(`Recording stopped. Audio size: ${audioBlob.size} bytes`);

          // Send to backend for transcription via HTTP API
          const result = await transcribeAudio(audioBlob);

          if (result.success && result.text) {
            setState(prev => ({
              ...prev,
              transcript: result.text,
              isProcessing: false,
            }));
            resolve(result.text);
          } else {
            throw new Error(result.error || 'Transcription failed');
          }

          // Clean up
          if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }
        } catch (error) {
          console.error('Failed to process recording:', error);
          setState(prev => ({
            ...prev,
            isProcessing: false,
            error: error instanceof Error ? error.message : 'Failed to process recording',
          }));
          reject(error);
        }
      };

      mediaRecorder.stop();
    });
  }, [state.isRecording, stopVolumeMonitoring]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      stopVolumeMonitoring();

      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

      audioChunksRef.current = [];

      setState({
        isRecording: false,
        isProcessing: false,
        transcript: '',
        error: null,
        volume: 0,
      });

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      console.log('Recording cancelled');
    }
  }, [state.isRecording, stopVolumeMonitoring]);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
