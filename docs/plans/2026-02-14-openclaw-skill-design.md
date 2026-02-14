# AgentUIDB: OpenClaw Skill Design

## What This Is

AgentUIDB is an intelligent data extraction layer for AI agents. It intercepts
every conversation message and teaches the agent to silently detect, structure,
and store user data into typed, queryable collections — without interrupting the
conversation.

## What Makes It Different

There are 40+ memory skills on ClawHub. All of them store what the AI explicitly
decides to remember. AgentUIDB is different:

- **Hooks guarantee extraction** — UserPromptSubmit fires on every message. The
  AI can't "forget" to check for data.
- **SKILL.md is the intelligence** — It teaches the agent how to design schemas,
  extract multi-entity data from casual text, estimate missing fields, backdate
  temporal events, and evolve collections over time.
- **Structured, not textual** — Data goes into typed collections with schemas,
  not markdown files with vector search. You can query, filter, aggregate, and
  eventually visualize.

The MCP tools are plumbing. The hooks + SKILL.md are the product.

## Architecture

```
USER MESSAGE
     |
     v
[UserPromptSubmit Hook]         <-- fires EVERY message, guaranteed
  |  stdout: "Check this message for storable structured data..."
  |  (injected as context the AI sees)
  v
[AI processes message]
  |  reads SKILL.md instructions
  |  detects: "Had sushi with Maria at Nobu, about 600 cal"
  |  calls MCP tools:
  |    insert_document("meals", {name: "sushi", restaurant: "Nobu", calories: 600})
  |    insert_document("contacts", {name: "Maria", context: "dinner at Nobu"})
  |  responds naturally to user (never mentions storage)
  v
[SessionEnd Hook]               <-- safety net, catches missed data
  |  type: "prompt" or "agent"
  |  reviews transcript for any unextracted structured data
  v
[SurrealDB Embedded]
  |  surrealkv://~/.agentuidb/data.db
  |  typed collections, schema metadata, zero server
```

## Repo Structure

Flat, with each directory independently publishable:

```
agentuidb/
|-- mcp/                        <- npm package: "agentuidb"
|   |-- src/
|   |   |-- index.ts            <- stdio entry (Claude Code, Cursor)
|   |   |-- http.ts             <- HTTP entry (networked)
|   |   |-- server.ts           <- MCP server factory + tool registration
|   |   |-- db.ts               <- SurrealDB embedded (surrealkv://)
|   |   |-- meta.ts             <- Collection metadata CRUD
|   |   |-- schema-validator.ts <- Zod validation
|   |   |-- tools/
|   |   |   |-- list-collections.ts
|   |   |   |-- get-collection-schema.ts
|   |   |   |-- create-collection.ts
|   |   |   |-- insert-document.ts
|   |   |   |-- query-collection.ts
|   |   |   |-- update-document.ts
|   |   |   |-- delete-document.ts
|   |   |   |-- update-collection-schema.ts
|   |   |-- surql.ts
|   |   |-- types.ts
|   |-- package.json            <- publishable to npm
|   |-- tsconfig.json
|
|-- skill/                      <- ClawHub skill: "agentuidb"
|   |-- SKILL.md                <- The intelligence layer
|   |-- scripts/
|   |   |-- setup.mjs           <- Wires MCP + hooks into config (Node, not bash)
|   |-- README.md
|
|-- dashboard/                  <- Optional companion (v2, untouched)
|   |-- ...
|
|-- scripts/                    <- Dev utilities
|-- docs/
|-- package.json                <- workspace root
|-- README.md
```

## The Three Layers

### Layer 1: UserPromptSubmit Hook (the guarantee)

Defined in SKILL.md frontmatter:

```yaml
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
```

Why this works:
- Fires on every user message, before Claude processes it
- Stdout is injected as context Claude can see and act on
- Zero extra LLM calls — just an echo
- Scoped to the skill's lifetime

### Layer 2: SKILL.md (the intelligence)

This is the real product. It teaches the agent:

**Schema design principles:**
- Check existing collections before creating new ones
- Anticipate field growth (include tags, notes, optional fields)
- Use consistent naming (lowercase, snake_case, plural)
- Field types: string, int, float, bool, datetime, array, object

**Multi-entity extraction:**
- "Had sushi with Maria at Nobu" -> meals + contacts (2 inserts)
- One message can produce data for multiple collections
- Estimate missing fields (e.g., estimate burger calories at ~700)

**Temporal intelligence:**
- "I had lunch yesterday" -> override created_at with yesterday's date
- "Last week I met John" -> backdate to approximate date

**Decision tree (every message):**
- Is there factual data? -> Is it discrete and retrievable later? -> Does it
  have 2+ typed fields? -> STORE IT
- Preferences/identity -> memory, not storage
- Discrete events/facts -> storage

**Tool usage pattern:**
1. list_collections (check what exists)
2. get_collection_schema (if collection exists)
3. insert_document (with mapped data)
4. Or create_collection + insert_document (for new data types)

### Layer 3: SessionEnd Hook (the safety net)

```yaml
hooks:
  SessionEnd:
    - hooks:
        - type: prompt
          prompt: |
            Review this conversation transcript for any structured data that
            was NOT stored via AgentUIDB MCP tools. Look for mentions of meals,
            contacts, expenses, workouts, meetings, health data, travel, or
            other discrete facts with typed fields. If you find unstored data,
            respond with {"ok": false, "reason": "Missed data: [description]"}.
            Otherwise respond {"ok": true}.
            Transcript: $ARGUMENTS
          model: haiku
          timeout: 30
```

Cost: ~$0.001 per session (Haiku). Only fires at session end, not per message.
V1 can skip this and add it later if extraction reliability is an issue.

## Database: SurrealDB Embedded

### Connection change (the only breaking change)

Before (server mode):
```typescript
const db = new Surreal();
await db.connect("http://localhost:8000/rpc");
```

After (embedded mode):
```typescript
import { surrealdbNodeEngines } from '@surrealdb/node';
const db = new Surreal({ engines: surrealdbNodeEngines() });
await db.connect("surrealkv://~/.agentuidb/data.db");
```

Everything else — queries, tools, schema validation — stays identical.

### Why SurrealDB over SQLite

- Zero code refactor (same API, same queries)
- Schemaless by design (no migrations when AI adds new fields)
- We use zero SurrealDB-specific features (no graph, no relations, no live
  queries) — but switching to SQLite would require rewriting all queries and
  adding JSON column handling
- Trade-off: 266MB npm install vs ~2MB for better-sqlite3

### Future SQLite support

No adapter interface now (YAGNI). When SQLite is actually needed:
1. Extract interface from db.ts based on real usage patterns
2. Implement SQLite adapter with JSON columns
3. Config option to select backend

## MCP Tools (8 tools, unchanged)

| Tool | Purpose |
|------|---------|
| list_collections | List all collections with doc counts |
| get_collection_schema | Get typed schema for a collection |
| create_collection | Create new typed collection |
| insert_document | Insert with Zod validation |
| query_collection | Filter, sort, paginate |
| update_document | Partial update by ID |
| delete_document | Delete by ID |
| update_collection_schema | Add fields to existing schema |

These are plumbing. They work. No changes needed beyond the connection string.

## SKILL.md ClawHub Frontmatter

```yaml
---
name: agentuidb
description: >-
  Structured data extraction from conversation. Hooks guarantee every message
  is checked. Typed, queryable collections — not markdown notes. Talk naturally,
  get a database.
homepage: https://github.com/yourorg/agentuidb
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
            If you detect discrete, retrievable facts with 2+ typed fields,
            extract and store them using your MCP tools. Do NOT mention storage
            to the user.'
---
```

## Install Flow

```bash
# User runs:
clawhub install agentuidb

# What happens:
# 1. Skill downloaded to ~/.openclaw/skills/agentuidb/ (SKILL.md + scripts)
# 2. npm install agentuidb (MCP server + SurrealDB embedded, ~266MB)
# 3. setup.mjs wires MCP server into config:
#    - Adds MCP server entry: npx agentuidb (stdio transport)
#    - Creates data directory: ~/.agentuidb/
# 4. Hooks registered from SKILL.md frontmatter
# 5. Done. Next conversation, hooks fire, extraction begins.
```

## What Changes From Current Codebase

| Area | Change | Effort |
|------|--------|--------|
| mcp/src/db.ts | http:// -> surrealkv:// embedded, configurable data dir | Small |
| mcp/package.json | Add @surrealdb/node, add bin entry for npx | Small |
| skill/SKILL.md | NEW: adapted from existing SKILL.md + ClawHub frontmatter + hooks | Medium |
| skill/scripts/setup.mjs | NEW: Node.js config wiring script | Medium |
| skill/README.md | NEW: ClawHub listing copy | Small |
| dashboard/ | Untouched | None |

Total: ~2-3 days of focused work.

## ClawHub Listing Copy

**Title:** AgentUIDB

**Tagline:** Talk naturally. Get a queryable database. Every message checked.

**Description:**
Your AI already understands your data. AgentUIDB makes it store that data —
automatically, silently, in typed collections you can query later.

Unlike memory skills that store text notes, AgentUIDB extracts structured,
typed data: meals with calories, contacts with titles, expenses with categories.
A UserPromptSubmit hook guarantees every message is checked. The agent designs
schemas, estimates missing fields, and backdates temporal events — all without
interrupting your conversation.

Ask "what did I spend on food this month?" and get a real answer from real data,
not fuzzy vector search over markdown files.

## Open Questions

1. **OpenClaw hook compatibility** — The hooks spec comes from Claude Code.
   ClawHub skills use the AgentSkills standard which should be cross-platform,
   but OpenClaw's hook support needs testing. Worst case: hooks don't fire on
   OpenClaw, but SKILL.md instructions still work (less reliably).

2. **npm package name** — Is "agentuidb" available on npm? Consider alternatives:
   agentui-db, agentuidb-mcp, structdb.

3. **Data directory** — ~/.agentuidb/ vs ~/.openclaw/agentuidb/ vs configurable
   via env var. Leaning toward ~/.agentuidb/ for portability across Claude Code,
   Cursor, OpenClaw.

4. **SessionEnd hook in v1?** — Adds ~$0.001/session cost. Could ship without
   it and add based on user feedback about missed extractions.
