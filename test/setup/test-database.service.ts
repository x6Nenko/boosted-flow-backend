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
        tracked_duration INTEGER NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        last_completed_date TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        description TEXT,
        started_at TEXT NOT NULL,
        stopped_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_activities_user_archived ON activities(user_id, archived_at);
      CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_time_entries_activity_date ON time_entries(activity_id, started_at);
    `);
  }

  /**
   * Clear all data between tests (optional, for test isolation)
   */
  async clearDatabase() {
    await this.client.executeMultiple(`
      DELETE FROM time_entries;
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
