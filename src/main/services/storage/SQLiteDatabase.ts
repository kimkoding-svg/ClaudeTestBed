import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

export class SQLiteDatabase {
  private db: BetterSQLite3Database<typeof schema>;
  private sqlite: Database.Database;
  private dbPath: string;

  constructor(dbName: string = 'ai-companion.db') {
    // Store database in user data directory
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, dbName);

    // Ensure directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Initialize SQLite
    this.sqlite = new Database(this.dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');

    // Initialize Drizzle ORM
    this.db = drizzle(this.sqlite, { schema });

    console.log(`SQLite database initialized at: ${this.dbPath}`);

    // Run initial migration
    this.initialize();
  }

  /**
   * Initialize database schema
   */
  private initialize(): void {
    console.log('Initializing database schema...');

    // Create tables
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        primary_language TEXT DEFAULT 'en',
        timezone TEXT,
        communication_style TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'pattern', 'expertise', 'relationship')),
        content TEXT NOT NULL,
        importance REAL DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS memory_entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id INTEGER NOT NULL,
        entity_name TEXT NOT NULL,
        entity_type TEXT CHECK(entity_type IN ('person', 'place', 'topic', 'skill')),
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time INTEGER,
        end_time INTEGER,
        topic_summary TEXT,
        memory_count INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS session_memories (
        session_id INTEGER NOT NULL,
        memory_id INTEGER NOT NULL,
        PRIMARY KEY (session_id, memory_id),
        FOREIGN KEY (session_id) REFERENCES conversation_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at INTEGER
      );
    `);

    // Create indexes for better performance
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
      CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_memory_entities_memory_id ON memory_entities(memory_id);
      CREATE INDEX IF NOT EXISTS idx_session_memories_session_id ON session_memories(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_memories_memory_id ON session_memories(memory_id);
      CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
    `);

    console.log('Database schema initialized successfully');
  }

  /**
   * Get the Drizzle ORM instance
   */
  getDB(): BetterSQLite3Database<typeof schema> {
    return this.db;
  }

  /**
   * Get the raw SQLite instance
   */
  getSQLite(): Database.Database {
    return this.sqlite;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.sqlite.close();
    console.log('Database connection closed');
  }

  /**
   * Get database path
   */
  getPath(): string {
    return this.dbPath;
  }

  /**
   * Backup database to a file
   */
  backup(destinationPath: string): void {
    const backup = new Database(destinationPath);
    this.sqlite.backup(backup);
    backup.close();
    console.log(`Database backed up to: ${destinationPath}`);
  }

  /**
   * Get database statistics
   */
  getStats(): {
    size: number;
    memoryCount: number;
    sessionCount: number;
  } {
    const size = fs.statSync(this.dbPath).size;
    const memoryCount = this.sqlite
      .prepare('SELECT COUNT(*) as count FROM memories')
      .get() as { count: number };
    const sessionCount = this.sqlite
      .prepare('SELECT COUNT(*) as count FROM conversation_sessions')
      .get() as { count: number };

    return {
      size,
      memoryCount: memoryCount.count,
      sessionCount: sessionCount.count,
    };
  }
}

// Singleton instance
let instance: SQLiteDatabase | null = null;

export function getSQLiteDatabase(): SQLiteDatabase {
  if (!instance) {
    instance = new SQLiteDatabase();
  }
  return instance;
}
