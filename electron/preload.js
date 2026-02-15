const { contextBridge, ipcRenderer } = require('electron');

// IPC Channel names
const IPC_CHANNELS = {
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
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (name) => ipcRenderer.invoke('app:get-path', name),

  // Voice
  startRecording: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_START_RECORDING),
  stopRecording: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_STOP_RECORDING),
  onTranscript: (callback) => {
    const subscription = (_event, transcript) => callback(transcript);
    ipcRenderer.on(IPC_CHANNELS.VOICE_TRANSCRIPT, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_TRANSCRIPT, subscription);
  },

  // Conversation
  sendMessage: (message) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_SEND_MESSAGE, message),
  onResponseChunk: (callback) => {
    const subscription = (_event, chunk) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_RESPONSE_CHUNK, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_RESPONSE_CHUNK, subscription);
  },
  onResponseComplete: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_RESPONSE_COMPLETE, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_RESPONSE_COMPLETE, subscription);
  },

  // Memory
  getAllMemories: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_ALL),
  getMemoryById: (id) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_BY_ID, id),
  searchMemories: (query) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SEARCH, query),
  deleteMemory: (id) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE, id),
  getMemoryStats: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_STATS),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings),

  // MCP
  listMCPServers: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST_SERVERS),
  listMCPTools: (serverName) => ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST_TOOLS, serverName),
  onMCPServerStatus: (callback) => {
    const subscription = (_event, status) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.MCP_SERVER_STATUS, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MCP_SERVER_STATUS, subscription);
  },
});
