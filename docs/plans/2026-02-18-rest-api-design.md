# Remove Raw SQL from Client — RESTful API Routes

## Problem

Client-side code (dashboard) contains raw SQL strings that get sent via RPC to `/api/db` for execution. SQL belongs on the server, not the client.

## Current Architecture

```
Client (React hooks/lib)
  → storage.ts builds SQL strings
  → db-client.ts sends them via POST /api/db
  → /api/db/route.ts executes against SQLite
```

8 client-side files touch the database through `db-client.ts`:

| File | SQL statements | Purpose |
|---|---|---|
| `lib/storage.ts` | 12 | Widgets, nav views, chat sessions/messages CRUD |
| `hooks/use-view-layout.ts` | 1 | View layout SELECT |
| `hooks/use-collections.ts` | 2 | Collection metadata + sample docs |
| `lib/render/registry.tsx` | 1 (via `buildCollectionQuery`) | Collection data for widgets |
| `hooks/use-spec-data.ts` | 1 (via `buildCollectionQuery`) | Collection data loading |
| `lib/render/edit-context.tsx` | 0 (uses `dbMerge`/`dbDelete` RPC) | Record editing |
| `hooks/use-views.tsx` | 0 (uses `dbDeleteLayout` RPC) | Layout deletion |
| `hooks/use-db.tsx` | 0 (uses `dbPing` RPC) | Connection status |

## Target Architecture

```
Client (React hooks/lib)
  → storage.ts makes fetch() calls
  → Dedicated REST routes handle SQL server-side
```

## New API Routes

### 1. `/api/widgets/route.ts`

| Method | Purpose | Replaces |
|---|---|---|
| `GET` | List all widgets ordered by `order` ASC | `loadWidgets()` |
| `PUT` | Upsert a widget (insert or update on conflict) | `saveWidget()` |
| `PATCH` | Reorder widgets (body: `{orderedIds: string[]}`) | `saveWidgetOrder()` |
| `DELETE` | Delete widget by `?id=xxx` | `deleteWidget()` |

### 2. `/api/nav-views/route.ts`

| Method | Purpose | Replaces |
|---|---|---|
| `GET` | List all nav views ordered by `created_at` ASC | `loadNavViews()` |
| `PUT` | Upsert a nav view | `saveNavView()` |
| `DELETE` | Delete nav view by `?id=xxx` | `deleteNavView()` |

### 3. `/api/view-layouts/route.ts`

| Method | Purpose | Replaces |
|---|---|---|
| `GET` | Get layout by `?viewId=xxx` | SELECT in `use-view-layout.ts` |
| `PUT` | Upsert a layout | `dbSaveLayout()` |
| `DELETE` | Delete layout by `?viewId=xxx` | `dbDeleteLayout()` |

### 4. `/api/chat/sessions/route.ts`

| Method | Purpose | Replaces |
|---|---|---|
| `GET` | List sessions ordered by `updated_at` DESC | `loadChatSessions()` |
| `POST` | Create a session | `createChatSession()` |
| `PATCH` | Update session title / touch `updated_at` | `updateChatSession()` |
| `DELETE` | Delete session + cascade messages by `?id=xxx` | `deleteChatSession()` |

### 5. `/api/chat/messages/route.ts`

| Method | Purpose | Replaces |
|---|---|---|
| `GET` | List messages for session `?sessionId=xxx` | `loadChatMessages()` |
| `PUT` | Upsert a message | `saveChatMessage()` |

### 6. `/api/collections/route.ts`

| Method | Purpose | Replaces |
|---|---|---|
| `GET` | List collection metadata with sample docs (`?samples=2`) | `useCollections()` queries |

### 7. `/api/collections/[name]/query/route.ts`

| Method | Purpose | Replaces |
|---|---|---|
| `POST` | Query collection with filters/sort/limit (uses `buildCollectionQuery` server-side) | `queryDbCollection()` in registry.tsx, `queryCollection()` in use-spec-data.ts |

### 8. `/api/collections/[name]/[id]/route.ts`

| Method | Purpose | Replaces |
|---|---|---|
| `PATCH` | Merge/partial-update a record | `dbMerge()` in edit-context.tsx |
| `DELETE` | Delete a record | `dbDelete()` in edit-context.tsx |

## Client-Side Changes

### `lib/storage.ts`

Keeps all type exports and function signatures. Internals change from `dbQuery(sql)` to `fetch("/api/...")`.

### `lib/db-client.ts`

Deleted entirely. All callers migrate to either:
- Functions in `storage.ts` (for widgets, nav views, chat)
- Direct fetch calls to new routes (for collections, view layouts)

### Hook changes

| Hook | Change |
|---|---|
| `use-view-layout.ts` | Replace `dbQuery` SELECT with `fetch("/api/view-layouts?viewId=...")`, keep `dbSaveLayout` → `fetch PUT /api/view-layouts` |
| `use-collections.ts` | Replace 2 SQL queries with `fetch("/api/collections?samples=2")` |
| `use-spec-data.ts` | Replace `queryCollection()` with `fetch POST /api/collections/[name]/query` |
| `use-views.tsx` | Replace `dbDeleteLayout()` with `fetch DELETE /api/view-layouts` |
| `use-db.tsx` | Replace `dbPing()` with `fetch GET /api/db` (keep ping action) |

### `lib/render/registry.tsx`

Replace `queryDbCollection()` with fetch to `/api/collections/[name]/query`.

### `lib/render/edit-context.tsx`

Replace `dbMerge()`/`dbDelete()` with fetch to `/api/collections/[name]/[id]`.

## Deletions

- `lib/db-client.ts` — generic SQL-over-RPC proxy
- `query` action in `/api/db/route.ts` — no more arbitrary SQL from client
- `merge`, `delete`, `save_layout`, `delete_layout` actions in `/api/db/route.ts`
- After full migration, `/api/db/route.ts` reduces to just `ping` or gets deleted

## What Stays the Same

- All types/interfaces (`SavedWidget`, `NavView`, `ChatSession`, etc.)
- All function signatures in `storage.ts` — callers don't change
- `core/src/` server-side SQL untouched
- `/api/chat/route.ts` (AI streaming) and `/api/generate/route.ts` unrelated and untouched
