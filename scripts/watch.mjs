#!/usr/bin/env node

// Live dashboard for AgentUIDB — refreshes every 2s
// Usage: node watch.mjs
// Reads .env automatically if present

import { readFileSync } from "node:fs";

// Load .env if present
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && !k.startsWith("#")) process.env[k.trim()] = v.join("=").trim();
  }
} catch {}

const DB_URL = process.env.AGENTUIDB_URL ?? "http://127.0.0.1:8000";
const USER = process.env.AGENTUIDB_USER ?? "root";
const PASS = process.env.AGENTUIDB_PASS ?? "root";
const INTERVAL = 2000;

const auth = "Basic " + btoa(`${USER}:${PASS}`);
const headers = {
  Accept: "application/json",
  Authorization: auth,
  "surreal-ns": "agentuidb",
  "surreal-db": "default",
};

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[1;36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const magenta = (s) => `\x1b[35m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

async function sql(body) {
  const resp = await fetch(`${DB_URL}/sql`, { method: "POST", headers, body });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function render() {
  const now = new Date().toLocaleTimeString();
  const lines = [];
  lines.push(`${bold("AgentUIDB")}  ${dim(DB_URL)}  ${dim(now)}`);
  lines.push("─".repeat(60));

  let meta;
  try {
    meta = await sql("SELECT name, description FROM _collections_meta");
  } catch (e) {
    lines.push("", red(`Cannot connect to SurrealDB at ${DB_URL}`), dim(e.message));
    paint(lines);
    return;
  }

  const collections = meta[0]?.result ?? [];

  if (!collections.length) {
    lines.push("", dim("  (no collections yet — start chatting)"));
    paint(lines);
    return;
  }

  const queries = collections
    .map((c) => `SELECT * FROM ${c.name} ORDER BY created_at DESC LIMIT 20`)
    .join("; ");
  const results = await sql(queries);

  for (let i = 0; i < collections.length; i++) {
    const col = collections[i];
    const docs = results[i]?.result ?? [];

    lines.push("");
    lines.push(`${cyan(col.name)}  ${dim(col.description)}  ${dim(`(${docs.length})`)}`);

    if (!docs.length) {
      lines.push(dim("  (empty)"));
      continue;
    }

    for (const doc of docs) {
      const { id, created_at, ...rest } = doc;
      const shortId = String(id).split(":")[1] ?? String(id);
      const time = created_at
        ? magenta(new Date(created_at).toLocaleString())
        : dim("—");

      const fields = Object.entries(rest)
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
  paint(lines);
}

function paint(lines) {
  process.stdout.write("\x1b[2J\x1b[H" + lines.join("\n") + "\n");
}

await render();
setInterval(render, INTERVAL);
