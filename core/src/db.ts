import Database from "better-sqlite3";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

function getDataDir(): string {
  return process.env.AGENTUIDB_DATA_DIR ?? resolve(homedir(), ".config", "agentuidb");
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });
  const dataPath = resolve(dataDir, "agentuidb.sqlite");

  db = new Database(dataPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS _collections_meta (
      name        TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      fields      TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  // Migrate _view_layouts -> view_layouts if needed
  const oldTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_view_layouts'").get();
  if (oldTable) {
    db.exec("ALTER TABLE _view_layouts RENAME TO view_layouts");
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS view_layouts (
        view_id    TEXT PRIMARY KEY,
        layouts    TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS widgets (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      spec       TEXT NOT NULL,
      collections TEXT NOT NULL DEFAULT '[]',
      "order"    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS nav_views (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      widget_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT 'New Chat',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL DEFAULT '',
      tool_calls TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
