/**
 * API client for the Agent Team Simulator backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface AgentState {
  id: string;
  name: string;
  role: string;
  tier: string;
  hourlyRate: number;
  gender: string;
  skills: string[];
  personality: {
    traits: string[];
    communication_style: string;
    humor: string;
    quirks: string;
    interests: string;
    work_ethic: string;
  };
  status: 'idle' | 'thinking' | 'acting' | 'waiting' | 'blocked';
  currentJob: {
    task: string;
    startedAt: number;
    elapsed: number;
  } | null;
  stats: {
    jobsCompleted: number;
    jobsFailed: number;
    totalResponseTime: number;
    socialInteractions: number;
    memorableMoments: number;
  };
  recentJobs: JobSummary[];
  totalJobs: number;
  model: string;
}

export interface JobSummary {
  id: string;
  task: string;
  status: string;
  duration: number;
  cost: number;
  completedAt: number;
}

export interface JobDetail {
  id: string;
  task: string;
  assignedBy: string;
  startedAt: number;
  completedAt: number;
  duration: number;
  status: string;
  result: any;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  fullPrompt: string;
  fullResponse: string;
  error?: string;
}

export interface FinancialState {
  cashRemaining: number;
  burnRatePerMin: number;
  payrollPerMin: number;
  facilitiesPerMin: number;
  marketingPerMin: number;
  revenuePerMin: number;
  netPerMin: number;
  runway: number;
  isBankrupt: boolean;
}

export interface CostState {
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    budgetCap: number;
    budgetRemaining: number;
    budgetUsedPercent: number;
    budgetExceeded: boolean;
  };
  rates: {
    costPerTick: number;
    costPerMinute: number;
    projectedPerHour: number;
  };
  agents: {
    id: string;
    name: string;
    retired: boolean;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    costPerJob: number;
    businessCalls: number;
    socialCalls: number;
    avgResponseTokens: number;
  }[];
  leadOverhead: {
    cost: number;
    percentOfTotal: number;
    strategyCalls: number;
    socialCalls: number;
  };
}

export interface SimulationEvent {
  type: string;
  tick?: number;
  [key: string]: any;
}

// ─── API Calls ──────────────────────────────────────────

export async function startSimulation(config: {
  budgetCap?: number;
  startingCash?: number;
  model?: string;
  tickSpeed?: number;
  companyName?: string;
}) {
  const res = await fetch(`${API_BASE}/agents/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function pauseSimulation() {
  const res = await fetch(`${API_BASE}/agents/pause`, { method: 'POST' });
  return res.json();
}

export async function resumeSimulation() {
  const res = await fetch(`${API_BASE}/agents/resume`, { method: 'POST' });
  return res.json();
}

export async function stopSimulation() {
  const res = await fetch(`${API_BASE}/agents/stop`, { method: 'POST' });
  return res.json();
}

export async function getSimulationState() {
  const res = await fetch(`${API_BASE}/agents/state`);
  return res.json();
}

export async function getReport() {
  const res = await fetch(`${API_BASE}/agents/report`);
  return res.json();
}

export async function getJobDetail(agentId: string, jobId: string): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/agents/job/${agentId}/${jobId}`);
  return res.json();
}

export async function getApiLogEntry(callId: string) {
  const res = await fetch(`${API_BASE}/agents/api-log/${callId}`);
  return res.json();
}

export async function injectEvent(event: {
  name: string;
  description: string;
  severity?: string;
  impact?: Record<string, number>;
}) {
  const res = await fetch(`${API_BASE}/agents/inject-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  return res.json();
}

export async function updateSettings(settings: {
  tickSpeed?: number;
  budgetCap?: number;
  model?: string;
}) {
  const res = await fetch(`${API_BASE}/agents/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getTimeline(limit = 50) {
  const res = await fetch(`${API_BASE}/agents/timeline?limit=${limit}`);
  return res.json();
}

// ─── SSE Stream ─────────────────────────────────────────

export function connectSSE(onEvent: (event: SimulationEvent) => void): EventSource {
  const es = new EventSource(`${API_BASE}/agents/stream`);

  es.onmessage = (e) => {
    try {
      const event: SimulationEvent = JSON.parse(e.data);
      onEvent(event);
    } catch (err) {
      console.error('Failed to parse SSE event:', e.data);
    }
  };

  es.onerror = () => {
    console.warn('SSE connection error — will auto-reconnect');
  };

  return es;
}
