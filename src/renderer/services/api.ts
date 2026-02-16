/**
 * API client for communicating with the backend server
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  duration?: number;
  error?: string;
}

export interface SynthesisResult {
  success: boolean;
  audioData?: string;
  format?: string;
  error?: string;
}

export interface StatusResult {
  success: boolean;
  isReady?: boolean;
  isRecording?: boolean;
  message?: string;
  error?: string;
}

/**
 * Transcribe audio to text
 */
export async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const response = await fetch(`${API_BASE_URL}/voice/transcribe`, {
    method: 'POST',
    body: formData,
  });

  return response.json();
}

export interface VoiceOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number;
  model?: 'tts-1' | 'tts-1-hd';
}

/**
 * Synthesize text to speech
 */
export async function synthesizeSpeech(text: string, streaming = false, options?: VoiceOptions): Promise<SynthesisResult> {
  const response = await fetch(`${API_BASE_URL}/voice/synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, streaming, ...options }),
  });

  return response.json();
}

/**
 * Get voice pipeline status
 */
export async function getVoiceStatus(): Promise<StatusResult> {
  const response = await fetch(`${API_BASE_URL}/voice/status`);
  return response.json();
}

/**
 * Check if backend is healthy
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return response.json();
}

// Conversation API
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  success: boolean;
  response?: string;
  error?: string;
}

/**
 * Send a chat message and get AI response
 */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[]
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/conversation/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, history }),
  });

  return response.json();
}

export interface StreamEvent {
  type: 'timing' | 'token' | 'sentence' | 'done' | 'error' | 'search_results';
  text?: string;
  stage?: string;
  elapsed?: number;
  timestamp?: number;
  metric?: string;
  index?: number;
  sentenceCount?: number;
  fullResponse?: string;
  metrics?: {
    totalTime: number;
    ttft: number;
    streamingTime: number;
    tokensPerSecond: number;
  };
  error?: string;
  // Search results fields
  query?: string;
  results?: Array<{
    title: string;
    snippet: string;
    url: string;
  }>;
  message?: string;
}

/**
 * Send a chat message and get streaming AI response
 */
export async function sendChatMessageStream(
  message: string,
  history: ChatMessage[],
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/conversation/chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, history }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event: StreamEvent = JSON.parse(data);
            onEvent(event);
          } catch (e) {
            console.error('Failed to parse SSE data:', data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
