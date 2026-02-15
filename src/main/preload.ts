import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types/ipc';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),

  // Voice
  startRecording: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_START_RECORDING),
  stopRecording: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_STOP_RECORDING),
  onTranscript: (callback: (transcript: any) => void) => {
    const subscription = (_event: any, transcript: any) => callback(transcript);
    ipcRenderer.on(IPC_CHANNELS.VOICE_TRANSCRIPT, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_TRANSCRIPT, subscription);
  },

  // Conversation
  sendMessage: (message: string) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_SEND_MESSAGE, message),
  onResponseChunk: (callback: (chunk: any) => void) => {
    const subscription = (_event: any, chunk: any) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_RESPONSE_CHUNK, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_RESPONSE_CHUNK, subscription);
  },
  onResponseComplete: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on(IPC_CHANNELS.CONVERSATION_RESPONSE_COMPLETE, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION_RESPONSE_COMPLETE, subscription);
  },

  // Memory
  getAllMemories: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_ALL),
  getMemoryById: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_BY_ID, id),
  searchMemories: (query: any) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SEARCH, query),
  deleteMemory: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE, id),
  getMemoryStats: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_STATS),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (settings: any) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings),

  // MCP
  listMCPServers: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST_SERVERS),
  listMCPTools: (serverName?: string) => ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST_TOOLS, serverName),
  onMCPServerStatus: (callback: (status: any) => void) => {
    const subscription = (_event: any, status: any) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.MCP_SERVER_STATUS, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MCP_SERVER_STATUS, subscription);
  },
});

// Type declarations for the exposed API
export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPath: (name: string) => Promise<string>;

  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  onTranscript: (callback: (transcript: any) => void) => () => void;

  sendMessage: (message: string) => Promise<void>;
  onResponseChunk: (callback: (chunk: any) => void) => () => void;
  onResponseComplete: (callback: () => void) => () => void;

  getAllMemories: () => Promise<any[]>;
  getMemoryById: (id: number) => Promise<any>;
  searchMemories: (query: any) => Promise<any[]>;
  deleteMemory: (id: number) => Promise<void>;
  getMemoryStats: () => Promise<any>;

  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<void>;

  listMCPServers: () => Promise<any[]>;
  listMCPTools: (serverName?: string) => Promise<any[]>;
  onMCPServerStatus: (callback: (status: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
