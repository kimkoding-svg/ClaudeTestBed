import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// User Profile table
export const userProfile = sqliteTable('user_profile', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  primaryLanguage: text('primary_language').default('en'),
  timezone: text('timezone'),
  communicationStyle: text('communication_style'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Memories table
export const memories = sqliteTable('memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', {
    enum: ['fact', 'preference', 'pattern', 'expertise', 'relationship']
  }).notNull(),
  content: text('content').notNull(),
  importance: real('importance').default(0.5),
  accessCount: integer('access_count').default(0),
  lastAccessed: integer('last_accessed', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Memory Entities table (for entity extraction)
export const memoryEntities = sqliteTable('memory_entities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  memoryId: integer('memory_id')
    .notNull()
    .references(() => memories.id, { onDelete: 'cascade' }),
  entityName: text('entity_name').notNull(),
  entityType: text('entity_type', {
    enum: ['person', 'place', 'topic', 'skill']
  }),
});

// Conversation Sessions table
export const conversationSessions = sqliteTable('conversation_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startTime: integer('start_time', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  endTime: integer('end_time', { mode: 'timestamp' }),
  topicSummary: text('topic_summary'),
  memoryCount: integer('memory_count').default(0),
  messageCount: integer('message_count').default(0),
});

// Session Memories link table
export const sessionMemories = sqliteTable('session_memories', {
  sessionId: integer('session_id')
    .notNull()
    .references(() => conversationSessions.id, { onDelete: 'cascade' }),
  memoryId: integer('memory_id')
    .notNull()
    .references(() => memories.id, { onDelete: 'cascade' }),
});

// Settings table (for storing app configuration)
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
