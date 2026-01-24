import { createClient, Client } from '@libsql/client';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '../../src/database/schema';

/**
 * Test-only DatabaseService that uses an in-memory SQLite database.
 * This ensures E2E tests NEVER touch real database.
 */
export class TestDatabaseService {
  private client: Client;
  public db: LibSQLDatabase<typeof schema>;

  constructor() {
    // :memory: = in-memory SQLite, completely isolated
    this.client = createClient({ url: ':memory:' });
    this.db = drizzle(this.client, { schema });
  }

  /**
   * Run migrations/create tables for tests.
   * Called once before tests start.
   */
  async setupSchema() {
    // Create tables matching your actual Drizzle schema
    await this.client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        hashed_password TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        description TEXT,
        started_at TEXT NOT NULL,
        stopped_at TEXT,
        rating INTEGER,
        comment TEXT,
        distraction_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_entry_tags (
        time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (time_entry_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS idx_activities_user_archived ON activities(user_id, archived_at);
      CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_time_entries_activity_date ON time_entries(activity_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_activity_archived ON tasks(activity_id, archived_at);
      CREATE INDEX IF NOT EXISTS idx_tags_user_name ON tags(user_id, name);
      CREATE INDEX IF NOT EXISTS idx_time_entry_tags_tag ON time_entry_tags(tag_id);
    `);
  }

  /**
   * Clear all data between tests (optional, for test isolation)
   */
  async clearDatabase() {
    await this.client.executeMultiple(`
      DELETE FROM time_entry_tags;
      DELETE FROM time_entries;
      DELETE FROM tasks;
      DELETE FROM tags;
      DELETE FROM activities;
      DELETE FROM refresh_tokens;
      DELETE FROM users;
    `);
  }

  /**
   * Close the database connection.
   * Called in afterAll() of tests.
   */
  close() {
    this.client.close();
  }
}
