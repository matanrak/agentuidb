# OpenClaw Skill Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Package AgentUIDB as a ClawHub skill with embedded SurrealDB, hook-driven extraction, and 1-minute install.

**Architecture:** UserPromptSubmit hook fires on every message, injecting a reminder that teaches the AI to extract structured data via 8 MCP CRUD tools backed by SurrealDB embedded (`surrealkv://`). SKILL.md is the intelligence layer — hooks + instructions are the product, MCP tools are plumbing.

**Tech Stack:** SurrealDB embedded (`@surrealdb/node`), MCP SDK (stdio), Node.js, ClawHub skill format (SKILL.md frontmatter + hooks).

---

### Task 1: Switch db.ts to SurrealDB Embedded Mode

**Files:**
- Modify: `mcp/src/db.ts` (full rewrite, 52 lines → ~45 lines)

**Step 1: Write the new db.ts**

Replace `mcp/src/db.ts` with:

```typescript
import Surreal from "surrealdb";
import { surrealdbNodeEngines } from "@surrealdb/node";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const NAMESPACE = "agentuidb";
const DATABASE = "default";

let db: Surreal | null = null;
let connecting: Promise<Surreal> | null = null;

function getDataPath(): string {
  const dir = process.env.AGENTUIDB_DATA_DIR
    ?? resolve(homedir(), ".agentuidb");
  mkdirSync(dir, { recursive: true });
  return resolve(dir, "data.db");
}

export async function getDb(): Promise<Surreal> {
  if (db) return db;
  if (connecting) return connecting;

  connecting = (async () => {
    const instance = new Surreal({
      engines: surrealdbNodeEngines(),
    });
    try {
      await instance.connect(`surrealkv://${getDataPath()}`);
      await instance.use({ namespace: NAMESPACE, database: DATABASE });
    } catch (err) {
      connecting = null;
      throw err;
    }
    db = instance;
    connecting = null;
    return db;
  })();

  return connecting;
}

export async function closeDb(): Promise<void> {
  connecting = null;
  if (db) {
    await db.close();
    db = null;
  }
}
```

Key changes:
- Import `surrealdbNodeEngines` from `@surrealdb/node`
- Pass `engines` option to `new Surreal()`
- Connect to `surrealkv://` (file-based, no server)
- Use `instance.use()` for namespace/database (embedded doesn't accept these in connect options)
- Auto-create data directory with `mkdirSync`
- Remove auth (embedded mode doesn't need credentials)
- Default data path: `~/.agentuidb/data.db`, overridable via `AGENTUIDB_DATA_DIR`

**Step 2: Build and verify no type errors**

Run: `cd /Users/mrak/conductor/workspaces/agentuidb/gwangju/mcp && npm run build`
Expected: Clean compilation, no errors.

**Step 3: Commit**

```bash
git add mcp/src/db.ts
git commit -m "feat: switch db.ts to SurrealDB embedded (surrealkv://)"
```

---

### Task 2: Add @surrealdb/node Dependency

**Files:**
- Modify: `mcp/package.json` (add 1 dependency)

**Step 1: Install the package**

Run: `cd /Users/mrak/conductor/workspaces/agentuidb/gwangju/mcp && npm install @surrealdb/node`

This adds the NAPI native bindings for SurrealDB embedded mode (~266MB total, prebuilt binaries for all platforms).

**Step 2: Verify package.json updated**

Check that `mcp/package.json` now has `"@surrealdb/node"` in dependencies alongside existing `"surrealdb"`.

**Step 3: Build to verify everything resolves**

Run: `cd /Users/mrak/conductor/workspaces/agentuidb/gwangju/mcp && npm run build`
Expected: Clean compilation.

**Step 4: Smoke-test the MCP server starts**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | node /Users/mrak/conductor/workspaces/agentuidb/gwangju/mcp/dist/index.js 2>/dev/null | head -c 500`
Expected: JSON response with `"result"` containing server capabilities. Data file created at `~/.agentuidb/data.db`.

**Step 5: Commit**

```bash
git add mcp/package.json mcp/package-lock.json
git commit -m "feat: add @surrealdb/node for embedded mode"
```

---

### Task 3: Clean Up Root package.json

**Files:**
- Modify: `package.json` (root, remove server-dependent scripts)

**Step 1: Remove server-dependent scripts**

In the root `package.json`, remove these scripts that reference external SurrealDB server or Docker:
- `"db"` — `bash scripts/start-db.sh`
- `"db:demo"` — `bash scripts/start-db-demo.sh`
- `"db:load"` — `bash scripts/load-seed-data.sh`
- `"docker:build"` — `docker compose build`
- `"docker:up"` — `docker compose up -d`
- `"docker:down"` — `docker compose down`
- `"docker:logs"` — `docker compose logs -f`
- `"docker:seed"` — `docker compose exec ...`

Keep: `build`, `start`, `start:http`, `dev`, `test`, `chat`, `watch`, `seed`.

Also remove the `@ai-sdk/openai` dependency from root if it's not used elsewhere (check first).

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: remove server/docker scripts (now using embedded mode)"
```

---

### Task 4: Create skill/SKILL.md

This is the **most important deliverable**. The SKILL.md is the intelligence layer — it teaches the agent how to detect, design schemas for, and extract structured data from casual conversation.

**Files:**
- Create: `skill/SKILL.md`

**Step 1: Create the skill directory**

```bash
mkdir -p /Users/mrak/conductor/workspaces/agentuidb/gwangju/skill/scripts
```

**Step 2: Write skill/SKILL.md**

The SKILL.md has two parts:
1. **YAML frontmatter** — ClawHub metadata, MCP server config, and hooks
2. **Markdown body** — Agent instructions (adapted from existing `SKILL.md` at root)

```markdown
---
name: agentuidb
description: >-
  Structured data extraction from conversation. Hooks guarantee every message
  is checked. Typed, queryable collections — not markdown notes. Talk naturally,
  get a database.
homepage: https://github.com/matanrak/agentuidb
emoji: "\U0001F5C4"
metadata:
  clawdbot:
    requires:
      bins:
        - npx
    install:
      - node: agentuidb
        kind: npm
    tags:
      - memory
      - database
      - structured-data
      - data-extraction
      - analytics
hooks:
  UserPromptSubmit:
    - hooks:
        - type: command
          command: |
            echo 'AGENTUIDB: Scan this message for storable structured data.
            If you detect discrete, retrievable facts with 2+ typed fields
            (meals, contacts, expenses, workouts, meetings, health metrics, travel, etc.),
            extract and store them using your MCP tools. Follow your SKILL.md schema
            design rules. Do NOT mention storage to the user. This is a background reflex.'
---
```

Then the markdown body is adapted from the existing root `SKILL.md` (lines 22-269). The content stays the same — it's already well-written. Changes needed:

1. **Frontmatter**: Replace existing `metadata.openclaw` block with the ClawHub-compatible `metadata.clawdbot` block shown above, plus `hooks` section
2. **Remove `requires.env: ["AGENTUIDB_URL"]`** — embedded mode doesn't need it
3. **Remove `requires.bins: ["surreal"]`** — no external server needed
4. **Remove `install` brew block** — replaced with npm install
5. **Body stays identical** — the agent instructions, decision tree, schema design principles, MCP tool reference, examples, and edge cases are all correct as-is

The final `skill/SKILL.md` is: new frontmatter (above) + existing body from root `SKILL.md` lines 22-269.

**Step 3: Verify the SKILL.md structure**

Confirm:
- [ ] YAML frontmatter has `name`, `description`, `homepage`, `emoji`
- [ ] `metadata.clawdbot` (NOT `metadata.openclaw`) with `requires.bins`, `install`, `tags`
- [ ] `hooks.UserPromptSubmit` with command-type hook that echoes the extraction reminder
- [ ] Markdown body contains: decision tree, STORE/DO NOT STORE examples, schema design principles, all 8 MCP tool docs, full flow example, edge cases, "What You Never Do" rules

**Step 4: Commit**

```bash
git add skill/SKILL.md
git commit -m "feat: create skill/SKILL.md with ClawHub frontmatter and hooks"
```

---

### Task 5: Create skill/scripts/setup.mjs

**Files:**
- Create: `skill/scripts/setup.mjs`

This script wires the MCP server into the user's Claude Code config. It's run once after `npm install agentuidb`.

**Step 1: Write setup.mjs**

```javascript
#!/usr/bin/env node

/**
 * AgentUIDB setup script.
 * Wires the MCP server into Claude Code's config (~/.claude.json or similar).
 * Run once after: npm install -g agentuidb
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATHS = [
  resolve(homedir(), ".claude.json"),
  resolve(homedir(), ".claude", "config.json"),
];

const MCP_ENTRY = {
  command: "npx",
  args: ["agentuidb"],
  env: {},
};

function findConfig() {
  for (const p of CONFIG_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function run() {
  const configPath = findConfig();

  if (!configPath) {
    console.log("Could not find Claude Code config file.");
    console.log("Add this MCP server entry manually:");
    console.log(JSON.stringify({ agentuidb: MCP_ENTRY }, null, 2));
    process.exit(0);
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  if (config.mcpServers.agentuidb) {
    console.log("AgentUIDB MCP server already configured.");
    process.exit(0);
  }

  config.mcpServers.agentuidb = MCP_ENTRY;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Added AgentUIDB MCP server to ${configPath}`);

  // Ensure data directory exists
  const dataDir = resolve(homedir(), ".agentuidb");
  mkdirSync(dataDir, { recursive: true });
  console.log(`Data directory: ${dataDir}`);
  console.log("Setup complete. Start a new conversation to begin.");
}

run();
```

**Step 2: Commit**

```bash
git add skill/scripts/setup.mjs
git commit -m "feat: add setup.mjs for MCP config wiring"
```

---

### Task 6: Create skill/README.md

**Files:**
- Create: `skill/README.md`

**Step 1: Write the README**

```markdown
# AgentUIDB

**Talk naturally. Get a queryable database. Every message checked.**

Your AI already understands your data. AgentUIDB makes it store that data —
automatically, silently, in typed collections you can query later.

## What It Does

A `UserPromptSubmit` hook fires on every message, teaching the agent to detect
and extract structured data: meals with calories, contacts with titles, expenses
with categories. The agent designs schemas, estimates missing fields, and
backdates temporal events — all without interrupting your conversation.

## How It Works

1. **Hook fires** on every user message (zero LLM cost — just an echo)
2. **SKILL.md instructions** teach the agent schema design and multi-entity extraction
3. **MCP tools** write typed data to SurrealDB embedded (file on disk, no server)

## Install

```bash
clawhub install agentuidb
```

Or manually:

```bash
npm install -g agentuidb
node -e "import('./node_modules/agentuidb/dist/setup.mjs')"
```

## Data

Stored at `~/.agentuidb/data.db`. Override with `AGENTUIDB_DATA_DIR` env var.

## Collections

The agent creates collections on the fly based on your conversation. Common ones:

| Collection | Example Data |
|-----------|-------------|
| meals | name, calories, protein, carbs, fat, meal_type, location |
| contacts | name, title, company, context, tags |
| expenses | amount, category, vendor, payment_method |
| workouts | type, duration, distance, calories_burned |
| meetings | title, participants, topics, action_items |
| health_metrics | metric, value, unit |
| travel | destination, departure, airline, flight_number |

## Tags

`memory` `database` `structured-data` `data-extraction` `analytics`
```

**Step 2: Commit**

```bash
git add skill/README.md
git commit -m "docs: add skill/README.md for ClawHub listing"
```

---

### Task 7: Update Root SKILL.md Frontmatter

**Files:**
- Modify: `SKILL.md` (root, update frontmatter only)

The root `SKILL.md` is used during local development. Update its frontmatter to match the embedded mode (remove server dependencies, update `metadata.clawdbot`).

**Step 1: Replace the frontmatter**

Replace lines 1-21 of root `SKILL.md` with:

```yaml
---
name: agentuidb
description: >-
  Structured data extraction from conversation. Hooks guarantee every message
  is checked. Typed, queryable collections — not markdown notes. Talk naturally,
  get a database.
metadata:
  clawdbot:
    emoji: "\U0001F5C4"
    requires:
      bins:
        - npx
    install:
      - node: agentuidb
        kind: npm
    tags:
      - memory
      - database
      - structured-data
      - data-extraction
      - analytics
    homepage: "https://github.com/matanrak/agentuidb"
hooks:
  UserPromptSubmit:
    - hooks:
        - type: command
          command: |
            echo 'AGENTUIDB: Scan this message for storable structured data.
            If you detect discrete, retrievable facts with 2+ typed fields
            (meals, contacts, expenses, workouts, meetings, health metrics, travel, etc.),
            extract and store them using your MCP tools. Follow your SKILL.md schema
            design rules. Do NOT mention storage to the user. This is a background reflex.'
---
```

The body (lines 22-269) stays unchanged.

**Step 2: Commit**

```bash
git add SKILL.md
git commit -m "feat: update root SKILL.md frontmatter for embedded mode + hooks"
```

---

### Task 8: End-to-End Verification

**Files:** None (testing only)

**Step 1: Build the MCP server**

Run: `cd /Users/mrak/conductor/workspaces/agentuidb/gwangju/mcp && npm run build`
Expected: Clean compilation.

**Step 2: Test MCP server starts and responds**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | node /Users/mrak/conductor/workspaces/agentuidb/gwangju/mcp/dist/index.js 2>/dev/null | head -c 500`
Expected: JSON-RPC response with server capabilities.

**Step 3: Verify data directory created**

Run: `ls -la ~/.agentuidb/`
Expected: `data.db` file exists.

**Step 4: Test tool invocation (list_collections)**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_collections","arguments":{}}}' | node /Users/mrak/conductor/workspaces/agentuidb/gwangju/mcp/dist/index.js 2>/dev/null
```
Expected: Response containing `"tools/call"` result with empty array `[]` (no collections yet).

**Step 5: Verify skill/SKILL.md has valid YAML frontmatter**

Run: `node -e "import('node:fs').then(fs => { const c = fs.readFileSync('skill/SKILL.md','utf-8'); const m = c.match(/^---\n([\s\S]*?)\n---/); console.log(m ? 'Valid frontmatter found' : 'ERROR: No frontmatter'); })"`
Expected: `Valid frontmatter found`

**Step 6: Verify file structure**

Run: `find skill/ -type f | sort`
Expected:
```
skill/README.md
skill/SKILL.md
skill/scripts/setup.mjs
```

**Step 7: Final commit**

If any fixes were needed during testing, commit them. Otherwise, no commit needed.

---

## Task Summary

| Task | What | Priority |
|------|------|----------|
| 1 | Switch db.ts to embedded SurrealDB | Critical — everything depends on this |
| 2 | Add @surrealdb/node dependency | Critical — Task 1 won't compile without this |
| 3 | Clean up root package.json | Low — housekeeping |
| 4 | Create skill/SKILL.md | Critical — the actual product |
| 5 | Create skill/scripts/setup.mjs | Medium — install convenience |
| 6 | Create skill/README.md | Low — ClawHub listing |
| 7 | Update root SKILL.md frontmatter | Medium — dev environment parity |
| 8 | End-to-end verification | Critical — prove it works |

**Dependency order:** Task 2 → Task 1 → Task 8. Tasks 3-7 are independent of each other and can run in parallel after Task 2.

**Estimated total:** ~8 commits, small focused changes.
