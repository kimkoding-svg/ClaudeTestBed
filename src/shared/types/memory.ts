export type MemoryType = 'fact' | 'preference' | 'pattern' | 'expertise' | 'relationship';

export interface Memory {
  id: number;
  type: MemoryType;
  content: string;
  importance: number;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  updatedAt: Date;
  entities?: MemoryEntity[];
}

export interface MemoryEntity {
  id: number;
  memoryId: number;
  entityName: string;
  entityType: 'person' | 'place' | 'topic' | 'skill';
}

export interface MemoryExtraction {
  type: MemoryType;
  content: string;
  entities: string[];
  importance: number;
  timestamp: Date;
  context: string;
}

export interface MemoryVector {
  id: string;
  vector: number[];
  memoryId: number;
  content: string;
  type: MemoryType;
  importance: number;
  createdAt: number;
}

export interface MemorySearchResult extends Memory {
  score: number;
  distance: number;
}
