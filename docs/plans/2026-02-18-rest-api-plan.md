# REST API Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all raw SQL from client-side code by creating dedicated REST API routes that handle SQL server-side.

**Architecture:** Create 8 Next.js API routes (one per resource). Migrate 8 client-side files to use `fetch()` instead of `dbQuery(sql)`. Delete `db-client.ts` when done.

**Tech Stack:** Next.js API routes, better-sqlite3 (via `@agentuidb/core/db`), existing `buildCollectionQuery` from `@agentuidb/core/query`.

**Important context:**
- Database: SQLite via `better-sqlite3`, accessed through `getDb()` from `@agentuidb/core/db`
- JSON columns: Several tables store JSON as TEXT (`spec`, `collections`, `widget_ids`, `layouts`, `tool_calls`). Routes must `JSON.parse()` these on read and `JSON.stringify()` on write.
- No test framework in dashboard — verify via `npm run build` and manual testing
- The existing `/api/db/route.ts` has a `processRows()` helper for JSON parsing and a `serializeParams()` helper — these are specific to the generic query pattern and won't be reused

---

### Task 1: Create `/api/widgets` route and migrate storage.ts widget functions

**Files:**
- Create: `dashboard/src/app/api/widgets/route.ts`
- Modify: `dashboard/src/lib/storage.ts` (lines 1-56 — widget functions)

**Step 1: Create the widgets API route**

Create `dashboard/src/app/api/widgets/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

function parseWidget(row: Record<string, unknown>) {
  return {
    ...row,
    spec: typeof row.spec === "string" ? JSON.parse(row.spec) : row.spec,
    collections: typeof row.collections === "string" ? JSON.parse(row.collections) : row.collections,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(
      'SELECT id, title, spec, collections, "order", created_at FROM widgets ORDER BY "order" ASC'
    ).all() as Record<string, unknown>[];
    return NextResponse.json(rows.map(parseWidget));
  } catch (err) {
    console.error("[/api/widgets] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const widget = await req.json();
    const db = getDb();
    db.prepare(
      `INSERT INTO widgets (id, title, spec, collections, "order", created_at)
       VALUES ($id, $title, $spec, $collections, $order, $created_at)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         spec = excluded.spec,
         collections = excluded.collections,
         "order" = excluded."order",
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    ).run({
      id: widget.id,
      title: widget.title,
      spec: JSON.stringify(widget.spec),
      collections: JSON.stringify(widget.collections),
      order: widget.order,
      created_at: widget.created_at,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/widgets] PUT", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { orderedIds } = await req.json() as { orderedIds: string[] };
    if (!orderedIds?.length) {
      return NextResponse.json({ ok: true });
    }
    const db = getDb();
    const cases = orderedIds.map((_, i) => `WHEN $id${i} THEN ${i}`).join(" ");
    const inList = orderedIds.map((_, i) => `$id${i}`).join(", ");
    const vars: Record<string, unknown> = {};
    orderedIds.forEach((id, i) => { vars[`id${i}`] = id; });
    db.prepare(
      `UPDATE widgets SET "order" = CASE id ${cases} END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id IN (${inList})`
    ).run(vars);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/widgets] PATCH", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const db = getDb();
    db.prepare("DELETE FROM widgets WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/widgets] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 2: Migrate storage.ts widget functions**

Replace the widget functions in `storage.ts`. Remove the `dbQuery` import if no other functions use it yet (they will still use it at this point, so keep the import). Replace:

```typescript
// loadWidgets: replace dbQuery with fetch
export async function loadWidgets(): Promise<SavedWidget[]> {
  const res = await fetch("/api/widgets");
  if (!res.ok) throw new Error("Failed to load widgets");
  return res.json();
}

// saveWidget: replace dbQuery with fetch
export async function saveWidget(widget: SavedWidget): Promise<void> {
  const res = await fetch("/api/widgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(widget),
  });
  if (!res.ok) throw new Error("Failed to save widget");
}

// deleteWidget: replace dbQuery with fetch
export async function deleteWidget(id: string): Promise<void> {
  const res = await fetch(`/api/widgets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete widget");
}

// saveWidgetOrder: replace dbQuery with fetch
export async function saveWidgetOrder(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const res = await fetch("/api/widgets", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw new Error("Failed to save widget order");
}
```

**Step 3: Verify build**

Run: `npm run build --prefix dashboard`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add dashboard/src/app/api/widgets/route.ts dashboard/src/lib/storage.ts
git commit -m "feat: add /api/widgets route and migrate widget storage"
```

---

### Task 2: Create `/api/nav-views` route and migrate storage.ts nav view functions

**Files:**
- Create: `dashboard/src/app/api/nav-views/route.ts`
- Modify: `dashboard/src/lib/storage.ts` (lines 78-111 — nav view functions)

**Step 1: Create the nav-views API route**

Create `dashboard/src/app/api/nav-views/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

function parseNavView(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    widgetIds: typeof row.widget_ids === "string" ? JSON.parse(row.widget_ids) : row.widget_ids,
    created_at: row.created_at,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, name, widget_ids, created_at FROM nav_views ORDER BY created_at ASC"
    ).all() as Record<string, unknown>[];
    return NextResponse.json(rows.map(parseNavView));
  } catch (err) {
    console.error("[/api/nav-views] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const view = await req.json();
    const db = getDb();
    db.prepare(
      `INSERT INTO nav_views (id, name, widget_ids, created_at)
       VALUES ($id, $name, $widgetIds, $created_at)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         widget_ids = excluded.widget_ids,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    ).run({
      id: view.id,
      name: view.name,
      widgetIds: JSON.stringify(view.widgetIds),
      created_at: view.created_at,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/nav-views] PUT", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const db = getDb();
    db.prepare("DELETE FROM nav_views WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/nav-views] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 2: Migrate storage.ts nav view functions**

Replace the nav view functions in `storage.ts`:

```typescript
export async function loadNavViews(): Promise<NavView[]> {
  const res = await fetch("/api/nav-views");
  if (!res.ok) throw new Error("Failed to load nav views");
  return res.json();
}

export async function saveNavView(view: NavView): Promise<void> {
  const res = await fetch("/api/nav-views", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(view),
  });
  if (!res.ok) throw new Error("Failed to save nav view");
}

export async function deleteNavView(id: string): Promise<void> {
  const res = await fetch(`/api/nav-views?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete nav view");
}
```

**Step 3: Verify build**

Run: `npm run build --prefix dashboard`

**Step 4: Commit**

```bash
git add dashboard/src/app/api/nav-views/route.ts dashboard/src/lib/storage.ts
git commit -m "feat: add /api/nav-views route and migrate nav view storage"
```

---

### Task 3: Create `/api/view-layouts` route and migrate use-view-layout.ts + use-views.tsx

**Files:**
- Create: `dashboard/src/app/api/view-layouts/route.ts`
- Modify: `dashboard/src/hooks/use-view-layout.ts` (replace `dbQuery` SELECT and `dbSaveLayout`)
- Modify: `dashboard/src/hooks/use-views.tsx` (replace `dbDeleteLayout`)

**Step 1: Create the view-layouts API route**

Create `dashboard/src/app/api/view-layouts/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const viewId = searchParams.get("viewId");
    if (!viewId) {
      return NextResponse.json({ error: "viewId required" }, { status: 400 });
    }
    const db = getDb();
    const row = db.prepare(
      "SELECT layouts FROM view_layouts WHERE view_id = ? LIMIT 1"
    ).get(viewId) as { layouts: string } | undefined;
    if (!row) {
      return NextResponse.json(null);
    }
    const layouts = typeof row.layouts === "string" ? JSON.parse(row.layouts) : row.layouts;
    return NextResponse.json(layouts);
  } catch (err) {
    console.error("[/api/view-layouts] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const { viewId, layouts } = await req.json();
    if (!viewId || layouts === undefined) {
      return NextResponse.json({ error: "viewId and layouts required" }, { status: 400 });
    }
    const db = getDb();
    db.prepare(
      `INSERT INTO view_layouts (view_id, layouts) VALUES (?, ?)
       ON CONFLICT(view_id) DO UPDATE SET layouts = excluded.layouts, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    ).run(viewId, JSON.stringify(layouts));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/view-layouts] PUT", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const viewId = searchParams.get("viewId");
    if (!viewId) {
      return NextResponse.json({ error: "viewId required" }, { status: 400 });
    }
    const db = getDb();
    db.prepare("DELETE FROM view_layouts WHERE view_id = ?").run(viewId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/view-layouts] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 2: Migrate use-view-layout.ts**

In `dashboard/src/hooks/use-view-layout.ts`:

1. Remove imports of `dbQuery` and `dbSaveLayout` from `@/lib/db-client`
2. Replace the `dbQuery` SELECT call (lines 42-47) with:

```typescript
const res = await fetch(`/api/view-layouts?viewId=${encodeURIComponent(viewId)}`);
if (res.ok) {
  const layouts = await res.json();
  if (!cancelled && layouts) {
    setLayouts(layouts);
    setIsLoading(false);
    loadedViewRef.current = viewId;
    return;
  }
}
```

3. Replace the `dbSaveLayout` call (lines 96-98) with:

```typescript
await fetch("/api/view-layouts", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ viewId, layouts: newLayouts }),
});
```

**Step 3: Migrate use-views.tsx**

In `dashboard/src/hooks/use-views.tsx`:

1. Remove `import { dbDeleteLayout } from "@/lib/db-client"`
2. Replace `dbDeleteLayout(id)` call (line 46) with:

```typescript
fetch(`/api/view-layouts?viewId=${encodeURIComponent(id)}`, { method: "DELETE" })
```

**Step 4: Verify build**

Run: `npm run build --prefix dashboard`

**Step 5: Commit**

```bash
git add dashboard/src/app/api/view-layouts/route.ts dashboard/src/hooks/use-view-layout.ts dashboard/src/hooks/use-views.tsx
git commit -m "feat: add /api/view-layouts route and migrate layout hooks"
```

---

### Task 4: Create `/api/chat/sessions` route and migrate chat session functions

**Files:**
- Create: `dashboard/src/app/api/chat/sessions/route.ts`
- Modify: `dashboard/src/lib/storage.ts` (lines 131-162 — chat session functions)

**Step 1: Create the chat sessions API route**

Create `dashboard/src/app/api/chat/sessions/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC"
    ).all();
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[/api/chat/sessions] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { id, title } = await req.json();
    const db = getDb();
    db.prepare("INSERT INTO chat_sessions (id, title) VALUES ($id, $title)").run({ id, title });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/sessions] POST", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, title } = await req.json();
    const db = getDb();
    if (title !== undefined) {
      db.prepare(
        `UPDATE chat_sessions SET title = $title, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $id`
      ).run({ id, title });
    } else {
      db.prepare(
        `UPDATE chat_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $id`
      ).run({ id });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/sessions] PATCH", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const db = getDb();
    db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/sessions] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 2: Migrate storage.ts chat session functions**

Replace the chat session functions in `storage.ts`:

```typescript
export async function loadChatSessions(): Promise<ChatSession[]> {
  const res = await fetch("/api/chat/sessions");
  if (!res.ok) throw new Error("Failed to load chat sessions");
  return res.json();
}

export async function createChatSession(session: { id: string; title: string }): Promise<void> {
  const res = await fetch("/api/chat/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  if (!res.ok) throw new Error("Failed to create chat session");
}

export async function updateChatSession(id: string, data: { title?: string }): Promise<void> {
  const res = await fetch("/api/chat/sessions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...data }),
  });
  if (!res.ok) throw new Error("Failed to update chat session");
}

export async function deleteChatSession(id: string): Promise<void> {
  const res = await fetch(`/api/chat/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete chat session");
}
```

**Step 3: Verify build**

Run: `npm run build --prefix dashboard`

**Step 4: Commit**

```bash
git add dashboard/src/app/api/chat/sessions/route.ts dashboard/src/lib/storage.ts
git commit -m "feat: add /api/chat/sessions route and migrate session storage"
```

---

### Task 5: Create `/api/chat/messages` route and migrate chat message functions

**Files:**
- Create: `dashboard/src/app/api/chat/messages/route.ts`
- Modify: `dashboard/src/lib/storage.ts` (lines 164-188 — chat message functions)

**Step 1: Create the chat messages API route**

Create `dashboard/src/app/api/chat/messages/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

function parseMessage(row: Record<string, unknown>) {
  return {
    ...row,
    tool_calls: typeof row.tool_calls === "string" ? JSON.parse(row.tool_calls) : row.tool_calls,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, session_id, role, content, tool_calls, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId) as Record<string, unknown>[];
    return NextResponse.json(rows.map(parseMessage));
  } catch (err) {
    console.error("[/api/chat/messages] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const msg = await req.json();
    const db = getDb();
    db.prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, tool_calls, created_at)
       VALUES ($id, $sessionId, $role, $content, $toolCalls, $created_at)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         tool_calls = excluded.tool_calls`
    ).run({
      id: msg.id,
      sessionId: msg.session_id,
      role: msg.role,
      content: msg.content,
      toolCalls: JSON.stringify(msg.tool_calls),
      created_at: msg.created_at,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/messages] PUT", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 2: Migrate storage.ts chat message functions**

Replace the chat message functions in `storage.ts`:

```typescript
export async function loadChatMessages(sessionId: string): Promise<SavedChatMessage[]> {
  const res = await fetch(`/api/chat/messages?sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error("Failed to load chat messages");
  return res.json();
}

export async function saveChatMessage(msg: SavedChatMessage): Promise<void> {
  const res = await fetch("/api/chat/messages", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error("Failed to save chat message");
}
```

**Step 3: Verify build**

Run: `npm run build --prefix dashboard`

**Step 4: Commit**

```bash
git add dashboard/src/app/api/chat/messages/route.ts dashboard/src/lib/storage.ts
git commit -m "feat: add /api/chat/messages route and migrate message storage"
```

---

### Task 6: Create `/api/collections` route and migrate use-collections.ts

**Files:**
- Create: `dashboard/src/app/api/collections/route.ts`
- Modify: `dashboard/src/hooks/use-collections.ts`

**Step 1: Create the collections metadata API route**

Create `dashboard/src/app/api/collections/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";
import { escIdent } from "@agentuidb/core/query";

function parseCollectionMeta(row: Record<string, unknown>) {
  return {
    ...row,
    fields: typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const samples = parseInt(searchParams.get("samples") ?? "0", 10);

    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM _collections_meta ORDER BY name ASC"
    ).all() as Record<string, unknown>[];
    const metas = rows.map(parseCollectionMeta);

    if (samples > 0) {
      const withSamples = metas.map((col) => {
        try {
          const safeName = escIdent(col.name as string);
          const docs = db.prepare(
            `SELECT * FROM \`${safeName}\` ORDER BY created_at DESC LIMIT ?`
          ).all(samples) as Record<string, unknown>[];
          // Parse the data JSON column
          const parsedDocs = docs.map((doc) => {
            if (typeof doc.data === "string") {
              try {
                const parsed = JSON.parse(doc.data);
                const { data: _, ...rest } = doc;
                return { ...rest, ...parsed };
              } catch { /* keep as-is */ }
            }
            return doc;
          });
          return { ...col, sampleDocs: parsedDocs };
        } catch {
          return { ...col, sampleDocs: [] };
        }
      });
      return NextResponse.json(withSamples);
    }

    return NextResponse.json(metas);
  } catch (err) {
    console.error("[/api/collections] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 2: Migrate use-collections.ts**

Replace the entire `useCollections` hook internals in `dashboard/src/hooks/use-collections.ts`:

1. Remove `import { escIdent } from "@agentuidb/core/query"`
2. Remove `import { dbQuery } from "@/lib/db-client"`
3. Replace the `refresh` callback body with:

```typescript
const refresh = useCallback(async () => {
  if (status !== "connected") return;
  setLoading(true);
  try {
    const res = await fetch("/api/collections?samples=2");
    if (!res.ok) throw new Error("Failed to fetch collections");
    const data = await res.json();
    setCollections(data);
  } catch (err) {
    console.error("Failed to fetch collections:", err);
  } finally {
    setLoading(false);
  }
}, [status]);
```

**Step 3: Verify build**

Run: `npm run build --prefix dashboard`

**Step 4: Commit**

```bash
git add dashboard/src/app/api/collections/route.ts dashboard/src/hooks/use-collections.ts
git commit -m "feat: add /api/collections route and migrate collections hook"
```

---

### Task 7: Create `/api/collections/[name]/query` route and migrate registry.tsx + use-spec-data.ts

**Files:**
- Create: `dashboard/src/app/api/collections/[name]/query/route.ts`
- Modify: `dashboard/src/lib/render/registry.tsx` (the `queryDbCollection` helper)
- Modify: `dashboard/src/hooks/use-spec-data.ts` (the `queryCollection` helper)

**Step 1: Create the collection query API route**

Create `dashboard/src/app/api/collections/[name]/query/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";
import { buildCollectionQuery } from "@agentuidb/core/query";

function processRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const result: Record<string, unknown> = {};
    let expandedData: Record<string, unknown> | null = null;

    for (const [key, val] of Object.entries(row)) {
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const parsed = JSON.parse(val);
            if (key === "data" && typeof parsed === "object" && !Array.isArray(parsed)) {
              expandedData = parsed;
              continue;
            }
            result[key] = parsed;
            continue;
          } catch { /* keep as string */ }
        }
      }
      result[key] = val;
    }

    return expandedData ? { ...result, ...expandedData } : result;
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await req.json();
    const { query, vars } = buildCollectionQuery({
      collection: name,
      filters: body.filters ?? null,
      sort_by: body.sort_by ?? null,
      sort_order: body.sort_order ?? null,
      limit: body.limit ?? 50,
    });
    const db = getDb();
    const rows = db.prepare(query).all(vars) as Record<string, unknown>[];
    return NextResponse.json(processRows(rows));
  } catch (err) {
    console.error("[/api/collections/query] POST", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 2: Migrate registry.tsx**

In `dashboard/src/lib/render/registry.tsx`:

1. Remove `import { buildCollectionQuery } from "@agentuidb/core/query"`
2. Remove `import { dbQuery } from "@/lib/db-client"`
3. Replace the `queryDbCollection` function (lines 52-68) with:

```typescript
async function queryDbCollection(
  collection: string,
  filters?: Record<string, unknown> | null,
  sort_by?: string | null,
  sort_order?: string | null,
  limit?: number | null,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/collections/${encodeURIComponent(collection)}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, sort_by, sort_order, limit: limit ?? 50 }),
  });
  if (!res.ok) throw new Error(`Failed to query collection ${collection}`);
  return res.json();
}
```

**Step 3: Migrate use-spec-data.ts**

In `dashboard/src/hooks/use-spec-data.ts`:

1. Remove `import { buildCollectionQuery } from "@agentuidb/core/query"`
2. Remove `import { dbQuery } from "@/lib/db-client"`
3. Replace the `queryCollection` function (lines 10-14) with:

```typescript
async function queryCollection(collection: string, limit = 50): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/collections/${encodeURIComponent(collection)}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) throw new Error(`Failed to query collection ${collection}`);
  return res.json();
}
```

**Step 4: Verify build**

Run: `npm run build --prefix dashboard`

**Step 5: Commit**

```bash
git add dashboard/src/app/api/collections/\[name\]/query/route.ts dashboard/src/lib/render/registry.tsx dashboard/src/hooks/use-spec-data.ts
git commit -m "feat: add /api/collections/[name]/query route and migrate data hooks"
```

---

### Task 8: Create `/api/collections/[name]/[id]` route and migrate edit-context.tsx

**Files:**
- Create: `dashboard/src/app/api/collections/[name]/[id]/route.ts`
- Modify: `dashboard/src/lib/render/edit-context.tsx` (replace `dbMerge`/`dbDelete`)

**Step 1: Create the collection record CRUD route**

Create `dashboard/src/app/api/collections/[name]/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";
import { escIdent } from "@agentuidb/core/query";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  try {
    const { name, id } = await params;
    const data = await req.json();
    const db = getDb();
    const safeName = escIdent(name);
    const existing = db.prepare(
      `SELECT data FROM \`${safeName}\` WHERE id = ?`
    ).get(id) as { data: string } | undefined;
    if (existing) {
      const merged = { ...JSON.parse(existing.data), ...data };
      db.prepare(`UPDATE \`${safeName}\` SET data = ? WHERE id = ?`).run(
        JSON.stringify(merged),
        id,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/collections/[name]/[id]] PATCH", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  try {
    const { name, id } = await params;
    const db = getDb();
    const safeName = escIdent(name);
    db.prepare(`DELETE FROM \`${safeName}\` WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/collections/[name]/[id]] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 2: Migrate edit-context.tsx**

In `dashboard/src/lib/render/edit-context.tsx`:

1. Remove `import { dbMerge, dbDelete } from "@/lib/db-client"`
2. Replace `dbMerge(recordId, fields)` call (line 148) with:

```typescript
// recordId format is "collection:id"
const [collection, ...idParts] = recordId.split(":");
const docId = idParts.join(":");
await fetch(`/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(fields),
});
```

3. Replace `dbDelete(recordId)` call (line 151) with:

```typescript
const [delCollection, ...delIdParts] = recordId.split(":");
const delDocId = delIdParts.join(":");
await fetch(`/api/collections/${encodeURIComponent(delCollection)}/${encodeURIComponent(delDocId)}`, {
  method: "DELETE",
});
```

**Step 3: Verify build**

Run: `npm run build --prefix dashboard`

**Step 4: Commit**

```bash
git add dashboard/src/app/api/collections/\[name\]/\[id\]/route.ts dashboard/src/lib/render/edit-context.tsx
git commit -m "feat: add /api/collections/[name]/[id] route and migrate edit context"
```

---

### Task 9: Delete db-client.ts and clean up /api/db/route.ts

**Files:**
- Delete: `dashboard/src/lib/db-client.ts`
- Modify: `dashboard/src/app/api/db/route.ts` (strip to ping only)
- Modify: `dashboard/src/hooks/use-db.tsx` (inline the ping fetch)

**Step 1: Replace dbPing in use-db.tsx**

In `dashboard/src/hooks/use-db.tsx`:

1. Remove `import { dbPing } from "@/lib/db-client"`
2. Replace `dbPing()` call with:

```typescript
const ok = await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ping" }) }).then(r => r.ok).catch(() => false);
```

**Step 2: Delete db-client.ts**

Delete `dashboard/src/lib/db-client.ts`.

**Step 3: Verify no remaining imports of db-client**

Search for any remaining `db-client` imports. By this point, all 8 callers should be migrated:
- `storage.ts` — migrated in Tasks 1-5 (no longer imports `dbQuery`)
- `use-view-layout.ts` — migrated in Task 3
- `use-collections.ts` — migrated in Task 6
- `use-spec-data.ts` — migrated in Task 7
- `registry.tsx` — migrated in Task 7
- `edit-context.tsx` — migrated in Task 8
- `use-views.tsx` — migrated in Task 3
- `use-db.tsx` — migrated in Step 1

Run: `grep -r "db-client" dashboard/src/` — should return nothing.

**Step 4: Strip /api/db/route.ts to ping only**

Replace `dashboard/src/app/api/db/route.ts` with:

```typescript
import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function POST(req: Request) {
  const body = await req.json();
  const { action } = body;

  try {
    if (action === "ping") {
      const db = getDb();
      db.prepare("SELECT 1").get();
      return NextResponse.json({ result: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[/api/db]", action, err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

**Step 5: Verify build**

Run: `npm run build --prefix dashboard`
Expected: Clean build, no errors.

**Step 6: Commit**

```bash
git rm dashboard/src/lib/db-client.ts
git add dashboard/src/app/api/db/route.ts dashboard/src/hooks/use-db.tsx
git commit -m "feat: delete db-client.ts and strip /api/db to ping only"
```

---

### Task 10: Final verification

**Step 1: Full build**

Run: `npm run build --prefix dashboard`
Expected: Clean build.

**Step 2: Lint**

Run: `npm run lint --prefix dashboard`
Expected: No new warnings or errors.

**Step 3: Verify no raw SQL on client**

Run: `grep -rn "SELECT\|INSERT\|UPDATE\|DELETE\|dbQuery" dashboard/src/lib/ dashboard/src/hooks/ dashboard/src/components/ --include="*.ts" --include="*.tsx"` — should only match type names and comments, not actual SQL strings.

**Step 4: Verify all new routes exist**

Check that these files exist:
- `dashboard/src/app/api/widgets/route.ts`
- `dashboard/src/app/api/nav-views/route.ts`
- `dashboard/src/app/api/view-layouts/route.ts`
- `dashboard/src/app/api/chat/sessions/route.ts`
- `dashboard/src/app/api/chat/messages/route.ts`
- `dashboard/src/app/api/collections/route.ts`
- `dashboard/src/app/api/collections/[name]/query/route.ts`
- `dashboard/src/app/api/collections/[name]/[id]/route.ts`

**Step 5: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: final cleanup after REST API migration"
```
