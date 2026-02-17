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
  voice?: string;
  speed?: number;
  model?: 'tts-1' | 'tts-1-hd';
  provider?: 'openai' | 'kokoro';
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
 * Check Kokoro local TTS status
 */
export async function getKokoroStatus(): Promise<{
  available: boolean;
  setupComplete: boolean;
  gpu?: boolean;
  status?: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/voice/kokoro/status`);
    return response.json();
  } catch {
    return { available: false, setupComplete: false };
  }
}

/**
 * Start Kokoro local TTS server
 */
export async function startKokoro(): Promise<{ success: boolean; available: boolean }> {
  const response = await fetch(`${API_BASE_URL}/voice/kokoro/start`, { method: 'POST' });
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
  type: 'timing' | 'token' | 'sentence' | 'done' | 'error' | 'search_results' | 'tool_result' | 'pdf_generated';
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
    toolRounds?: number;
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
  // Tool result fields
  tool?: string;
  result?: any;
  // PDF generated fields
  pdf_id?: string;
  download_url?: string;
  taxpayer_name?: string;
}

export interface DocumentUploadResult {
  success: boolean;
  document_id?: string;
  filename?: string;
  fileType?: string;
  summary?: {
    rows: number;
    pages: number | null;
    incomeItems: number;
    expenseItems: number;
    totalIncome: number;
    totalExpenses: number;
  };
  message?: string;
  error?: string;
}

/**
 * Upload a document for analysis
 */
export async function uploadDocument(file: File): Promise<DocumentUploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  return response.json();
}

/**
 * Get PDF download URL
 */
export function getPDFDownloadURL(pdfId: string): string {
  return `${API_BASE_URL}/pdf/${pdfId}`;
}

export interface PersonalityConfig {
  preset: string;
  traits: {
    warmth: number;
    humor: number;
    formality: number;
    directness: number;
    energy: number;
  };
}

/**
 * Send a chat message and get streaming AI response
 */
export async function sendChatMessageStream(
  message: string,
  history: ChatMessage[],
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
  personality?: PersonalityConfig
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/conversation/chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, history, personality }),
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
