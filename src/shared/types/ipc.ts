// IPC Channel names
export const IPC_CHANNELS = {
  // Voice
  VOICE_START_RECORDING: 'voice:start-recording',
  VOICE_STOP_RECORDING: 'voice:stop-recording',
  VOICE_RECORDING_DATA: 'voice:recording-data',
  VOICE_TRANSCRIPT: 'voice:transcript',
  VOICE_PLAY_AUDIO: 'voice:play-audio',
  VOICE_STOP_AUDIO: 'voice:stop-audio',

  // Conversation
  CONVERSATION_SEND_MESSAGE: 'conversation:send-message',
  CONVERSATION_RESPONSE_CHUNK: 'conversation:response-chunk',
  CONVERSATION_RESPONSE_COMPLETE: 'conversation:response-complete',
  CONVERSATION_ERROR: 'conversation:error',

  // Memory
  MEMORY_GET_ALL: 'memory:get-all',
  MEMORY_GET_BY_ID: 'memory:get-by-id',
  MEMORY_SEARCH: 'memory:search',
  MEMORY_DELETE: 'memory:delete',
  MEMORY_STATS: 'memory:stats',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // MCP
  MCP_LIST_SERVERS: 'mcp:list-servers',
  MCP_LIST_TOOLS: 'mcp:list-tools',
  MCP_SERVER_STATUS: 'mcp:server-status',
} as const;

// IPC Message Types
export interface VoiceRecordingData {
  audioBlob: Blob;
  timestamp: number;
}

export interface VoiceTranscript {
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationResponse {
  content: string;
  isComplete: boolean;
  timestamp: number;
}

export interface MemoryItem {
  id: number;
  type: 'fact' | 'preference' | 'pattern' | 'expertise' | 'relationship';
  content: string;
  importance: number;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchQuery {
  query: string;
  limit?: number;
  minImportance?: number;
}

export interface MemoryStats {
  totalMemories: number;
  byType: Record<MemoryItem['type'], number>;
  averageImportance: number;
  oldestMemory: Date | null;
  newestMemory: Date | null;
}

export interface AppSettings {
  apiKeys: {
    anthropic?: string;
    openai?: string;
  };
  voice: {
    sttProvider: 'whisper';
    ttsProvider: 'openai' | 'elevenlabs';
    ttsVoice: string;
    ttsSpeed: number;
  };
  conversation: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  memory: {
    maxMemories: number;
    importanceThreshold: number;
    consolidationEnabled: boolean;
  };
}

export interface MCPServerInfo {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: MCPToolInfo[];
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}
