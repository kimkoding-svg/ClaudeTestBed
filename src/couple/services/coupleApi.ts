/**
 * API client for the Couple Chat backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface PersonProfile {
  id: 'A' | 'B';
  name: string;
  gender: 'male' | 'female';
  age: number;
  occupation: string;
  avatar: string;
  avatarUrl?: string | null;
  region: string;
  archetype: string;
  condition: { name: string; label: string } | null;
  textingStyle: string;
  traits: {
    friendliness: number;
    humor: number;
    sarcasm: number;
    empathy: number;
    assertiveness: number;
    intelligence: number;
    patience: number;
    confidence: number;
    emotionalStability: number;
    pettiness: number;
    openMindedness: number;
  };
  interests: string[];
  quirk: string;
  trigger: string;
  mood: number;
}

export interface CoupleMessage {
  speaker: 'A' | 'B';
  speakerName: string;
  text: string;
  sentiment: number;
  topic: string;
  timestamp: string;
  messageIndex: number;
  traitDeltas: Record<string, Record<string, number>>;
  profileA: PersonProfile;
  profileB: PersonProfile;
}

export interface CoupleSSEEvent {
  type: 'couple_profiles' | 'message' | 'typing' | 'error' | 'avatar_update';
  profileA?: PersonProfile;
  profileB?: PersonProfile;
  speaker?: 'A' | 'B';
  speakerName?: string;
  text?: string;
  sentiment?: number;
  topic?: string;
  timestamp?: string;
  messageIndex?: number;
  traitDeltas?: Record<string, Record<string, number>>;
  message?: string; // for error events
}

// ─── API Calls ──────────────────────────────────────────

export async function startCouple(): Promise<{ ok: boolean; profileA: PersonProfile; profileB: PersonProfile }> {
  const res = await fetch(`${API_BASE}/couple/start`, { method: 'POST' });
  return res.json();
}

export async function resetCouple(): Promise<{ ok: boolean; profileA: PersonProfile; profileB: PersonProfile }> {
  const res = await fetch(`${API_BASE}/couple/reset`, { method: 'POST' });
  return res.json();
}

export async function stopCouple(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/couple/stop`, { method: 'POST' });
  return res.json();
}

// ─── Logs ───────────────────────────────────────────────

export interface LogSummary {
  filename: string;
  date: string | null;
  messageCount: number;
  personA: string;
  personB: string;
}

export interface SavedLog {
  id: string;
  date: string;
  messageCount: number;
  profileA: PersonProfile;
  profileB: PersonProfile;
  messages: Array<{
    speaker: 'A' | 'B';
    speakerName: string;
    text: string;
    sentiment: number;
    topic: string;
    timestamp: string;
  }>;
}

export async function getCoupleLogs(): Promise<LogSummary[]> {
  const res = await fetch(`${API_BASE}/couple/logs`);
  return res.json();
}

export async function getCoupleLog(filename: string): Promise<SavedLog> {
  const res = await fetch(`${API_BASE}/couple/logs/${filename}`);
  return res.json();
}

// ─── SSE Stream ─────────────────────────────────────────

export function connectCoupleSSE(onEvent: (event: CoupleSSEEvent) => void): () => void {
  const es = new EventSource(`${API_BASE}/couple/stream`);

  es.onmessage = (e) => {
    try {
      const event: CoupleSSEEvent = JSON.parse(e.data);
      onEvent(event);
    } catch (err) {
      console.error('Failed to parse couple SSE event:', e.data);
    }
  };

  es.onerror = () => {
    console.warn('Couple SSE connection error — will auto-reconnect');
  };

  // Return cleanup function
  return () => {
    es.close();
  };
}
