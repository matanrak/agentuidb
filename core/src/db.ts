import Database from "better-sqlite3";
import { homedir } from "node:os";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface Settings {
  dataDir?: string;
}

function getSettingsDir(): string {
  return resolve(homedir(), ".agentuidb");
}

function loadSettings(): Settings {
  try {
    const raw = readFileSync(resolve(getSettingsDir(), "settings.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const settings = loadSettings();
  const dataDir = settings.dataDir ?? getSettingsDir();
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS _view_layouts (
      view_id    TEXT PRIMARY KEY,
      layouts    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
