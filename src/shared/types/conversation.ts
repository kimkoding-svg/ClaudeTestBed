export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface ConversationSession {
  id: number;
  startTime: Date;
  endTime?: Date;
  topicSummary?: string;
  memoryCount: number;
  messageCount: number;
}

export interface ConversationContext {
  sessionId: number;
  messages: Message[];
  relevantMemories: any[];
  availableTools: any[];
}
