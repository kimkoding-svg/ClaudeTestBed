/**
 * API client for the Social Office Simulator backend.
 * Mirrors the pattern from agentApi.ts.
 */
import {
  SocialSimState,
  SocialSimConfig,
  SocialSSEEvent,
} from '../../shared/types/social-sim';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ─── API Calls ──────────────────────────────────────────

export async function startSocialSim(config: Partial<SocialSimConfig>) {
  const res = await fetch(`${API_BASE}/social/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function pauseSocialSim() {
  const res = await fetch(`${API_BASE}/social/pause`, { method: 'POST' });
  return res.json();
}

export async function resumeSocialSim() {
  const res = await fetch(`${API_BASE}/social/resume`, { method: 'POST' });
  return res.json();
}

export async function stopSocialSim() {
  const res = await fetch(`${API_BASE}/social/stop`, { method: 'POST' });
  return res.json();
}

export async function getSocialState(): Promise<SocialSimState> {
  const res = await fetch(`${API_BASE}/social/state`);
  return res.json();
}

export async function injectSocialEvent(event: {
  type: string;
  name: string;
  description: string;
}) {
  const res = await fetch(`${API_BASE}/social/inject-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  return res.json();
}

export async function updateSocialSettings(settings: {
  tickSpeed?: number;
  budgetCap?: number;
  model?: string;
}) {
  const res = await fetch(`${API_BASE}/social/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.json();
}

// ─── Work Tasks ────────────────────────────────────────

export async function assignWorkTask(payload: { typeId: string; characterIds?: string[] }) {
  const res = await fetch(`${API_BASE}/social/assign-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function getTaskTypes() {
  const res = await fetch(`${API_BASE}/social/task-types`);
  return res.json();
}

// ─── SSE Stream ─────────────────────────────────────────

export function connectSocialSSE(onEvent: (event: SocialSSEEvent) => void): EventSource {
  const es = new EventSource(`${API_BASE}/social/stream`);

  es.onmessage = (e) => {
    try {
      const event: SocialSSEEvent = JSON.parse(e.data);
      onEvent(event);
    } catch (err) {
      console.error('Failed to parse social SSE event:', e.data);
    }
  };

  es.onerror = () => {
    console.warn('Social SSE connection error — will auto-reconnect');
  };

  return es;
}
