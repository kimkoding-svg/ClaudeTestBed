// Application constants
export const APP_NAME = 'AI Companion';
export const APP_VERSION = '0.1.0';

// Voice constants
export const VOICE_CHUNK_DURATION_MS = 500;
export const VAD_THRESHOLD = 0.5;
export const VAD_MIN_SPEECH_DURATION_MS = 300;

// Memory constants
export const MAX_MEMORIES = 10000;
export const DEFAULT_MEMORY_RETRIEVAL_LIMIT = 10;
export const DEFAULT_IMPORTANCE_THRESHOLD = 0.3;
export const MEMORY_CONSOLIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MEMORY_ARCHIVE_AGE_DAYS = 180; // 6 months

// Conversation constants
export const MAX_CONVERSATION_HISTORY = 50;
export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
export const CLAUDE_MAX_TOKENS = 4096;
export const CLAUDE_TEMPERATURE = 0.7;

// Voice latency targets (milliseconds)
export const TARGET_STT_LATENCY_MS = 500;
export const TARGET_LLM_FIRST_TOKEN_MS = 200;
export const TARGET_TTS_FIRST_AUDIO_MS = 200;
export const TARGET_TOTAL_LATENCY_MS = 900;

// Database
export const DB_NAME = 'ai-companion.db';
export const VECTOR_DB_NAME = 'memories.lance';

// Embedding
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
