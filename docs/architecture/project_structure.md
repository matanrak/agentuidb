# Project Structure

AgentUIDB is a monorepo with 4 npm workspaces. The core library owns all database logic; everything else is a thin adapter.

```
agentuidb/
  core/          @agentuidb/core     — DB engine, types, query builder
  mcp/           agentuidb           — MCP server for Claude Code (stdio)
  plugin/        @agentuidb/openclaw — OpenClaw plugin adapter
  dashboard/     dashboard           — Next.js UI for browsing data
  scripts/                           — Dev utilities (test, seed, chat, watch)
  docs/                              — Architecture docs, screenshots, SKILL.md
```

## Dependency graph

```
mcp ──────→ @agentuidb/core
plugin ───→ @agentuidb/core
dashboard ─→ @agentuidb/core
```

All three consumers reference core via `"file:../core"` (npm workspaces). Core has zero internal dependencies on the others.

## core/

The shared engine. SQLite (better-sqlite3) with JSON columns as a document store.

| File | Role |
|---|---|
| `db.ts` | Opens/closes the SQLite database (`~/.agentuidb/agentuidb.sqlite`), creates system tables |
| `handlers.ts` | CRUD operations — returns MCP-shaped `ToolResult` objects |
| `sql.ts` | `escIdent()` and `buildCollectionQuery()` — generates `json_extract()`-based SQL |
| `meta.ts` | Reads/writes `_collections_meta` (collection schemas) |
| `schema-validator.ts` | Validates documents against field definitions using Zod |
| `types.ts` | `FieldType`, `FieldDefinition`, `CollectionMeta` |

**Exports** (subpath):
- `.` — handlers + closeDb
- `./query` — `escIdent`, `buildCollectionQuery`
- `./types` — type definitions only
- `./db` — `getDb`, `closeDb` (native module — server-side only)

The `./db` subpath exists so dashboard can import it in API routes without leaking `better-sqlite3` into the client bundle.

## mcp/

MCP server for Claude Code. Registers 8 tools (list_collections, get_collection_schema, create_collection, insert_document, query_collection, update_document, delete_document, update_collection_schema) backed by core handlers.

| File | Role |
|---|---|
| `server.ts` | MCP tool registration + system instructions |
| `index.ts` | Stdio transport entry point (`npx agentuidb`) |
| `http.ts` | HTTP transport variant (StreamableHTTPServerTransport) |

Dependencies: `@modelcontextprotocol/sdk`, `zod`, `@agentuidb/core`.

## plugin/

OpenClaw plugin — same 8 tools, registered via `api.registerTool()` instead of MCP SDK. Uses TypeBox for parameter schemas (OpenClaw convention) and imports handler functions from core.

| File | Role |
|---|---|
| `index.ts` | Plugin entry — `export default { id, name, register(api) }` |
| `openclaw.plugin.json` | OpenClaw plugin manifest |

## dashboard/

Next.js 16 app with AI-powered widget generation. The dashboard does NOT call core handlers directly — it proxies through `/api/db` which opens the same SQLite file server-side.

```
dashboard/
  src/
    app/
      api/db/route.ts        — SQLite proxy (query, merge, delete, ping)
      api/generate/route.ts   — AI widget generation (OpenAI SDK)
    hooks/
      use-db.tsx              — DbProvider context (connection status)
      use-collections.ts      — Fetches collection metadata
      use-spec-data.ts        — Loads collection data for widgets
      use-views.tsx            — View/tab management
      use-view-layout.ts      — Grid layout persistence
    lib/
      db-client.ts            — Client-side fetch wrapper for /api/db
      render/
        registry.tsx          — JSON-render component registry (charts, tables)
        catalog.ts            — Component + action schema definitions
        edit-context.tsx       — Inline edit tracking + save
```

Key architectural decisions:
- `better-sqlite3` is in `serverExternalPackages` so Turbopack doesn't bundle it
- `/api/db` auto-expands the `data` JSON column so clients see flat documents
- Layouts persist to both `_view_layouts` table and localStorage (fallback)

## scripts/

| Script | What it does |
|---|---|
| `test.mjs` | Sends test messages through the MCP server |
| `seed.mjs` | Seeds sample collections and documents |
| `chat.mjs` | Interactive chat session with the MCP server |
| `watch.mjs` | Watches core + mcp for changes and rebuilds |

## Build

```bash
npm run build          # builds core then mcp
npm run build --prefix dashboard  # builds Next.js
```

Core must build first — mcp and dashboard import from `@agentuidb/core/dist/`.
