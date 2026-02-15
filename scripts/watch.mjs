#!/usr/bin/env node

// Live dashboard for AgentUIDB — refreshes every 2s
// Usage: node scripts/watch.mjs
// Reads data directly from the SQLite database

import Database from "better-sqlite3";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INTERVAL = 2000;

function getDbPath() {
  const settingsDir = resolve(homedir(), ".agentuidb");
  try {
    const raw = readFileSync(resolve(settingsDir, "settings.json"), "utf-8");
    const settings = JSON.parse(raw);
    if (settings.dataDir) return resolve(settings.dataDir, "agentuidb.sqlite");
  } catch {}
  return resolve(settingsDir, "agentuidb.sqlite");
}

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[1;36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const magenta = (s) => `\x1b[35m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function render() {
  const now = new Date().toLocaleTimeString();
  const dbPath = getDbPath();
  const lines = [];
  lines.push(`${bold("AgentUIDB")}  ${dim(dbPath)}  ${dim(now)}`);
  lines.push("─".repeat(60));

  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (e) {
    lines.push("", red(`Cannot open database at ${dbPath}`), dim(e.message));
    paint(lines);
    return;
  }

  try {
    const collections = db
      .prepare("SELECT name, description FROM _collections_meta ORDER BY name")
      .all();

    if (!collections.length) {
      lines.push("", dim("  (no collections yet — start chatting)"));
      paint(lines);
      return;
    }

    for (const col of collections) {
      const esc = col.name.replace(/`/g, "``");
      let docs = [];
      try {
        docs = db
          .prepare(`SELECT id, data, created_at FROM \`${esc}\` ORDER BY created_at DESC LIMIT 20`)
          .all();
      } catch {}

      lines.push("");
      lines.push(`${cyan(col.name)}  ${dim(col.description)}  ${dim(`(${docs.length})`)}`);

      if (!docs.length) {
        lines.push(dim("  (empty)"));
        continue;
      }

      for (const doc of docs) {
        const parsed = JSON.parse(doc.data);
        const shortId = doc.id.slice(0, 8);
        const time = doc.created_at
          ? magenta(new Date(doc.created_at).toLocaleString())
          : dim("—");

        const fields = Object.entries(parsed)
          .filter(([, v]) => v != null)
          .map(([k, v]) => {
            const val = Array.isArray(v) ? v.join(", ") : String(v);
            return `${dim(k)}=${yellow(val)}`;
          })
          .join("  ");

        lines.push(`  ${dim(shortId)}  ${time}  ${fields}`);
      }
    }

    lines.push("", dim(`Refreshing every ${INTERVAL / 1000}s — Ctrl+C to quit`));
  } finally {
    db.close();
  }

  paint(lines);
}

function paint(lines) {
  process.stdout.write("\x1b[2J\x1b[H" + lines.join("\n") + "\n");
}

render();
setInterval(render, INTERVAL);
