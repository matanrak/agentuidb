# Move Widget & View Storage to SQLite

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all localStorage-based persistence (widgets, nav views) with SQLite tables, making the DB the single source of truth.

**Architecture:** Add `widgets` and `nav_views` tables in `core/src/db.ts`. Rewrite `storage.ts` to expose async functions that call `dbQuery()` instead of `localStorage`. Update the React hooks to use async loading. Remove dead `SavedView` code.

**Tech Stack:** SQLite (better-sqlite3), Next.js API route (`/api/db`), React hooks

---

### Task 1: Add DB tables for widgets and nav views

**Files:**
- Modify: `core/src/db.ts`

**Step 1: Add `widgets` and `nav_views` table creation**

Add after the `_view_layouts` table creation in `getDb()`:

```ts
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
      layouts    TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
```

**Step 2: Commit**

```
git add core/src/db.ts
git commit -m "feat: add widgets and nav_views tables to SQLite schema"
```

---

### Task 2: Rewrite storage.ts to use DB instead of localStorage

**Files:**
- Modify: `dashboard/src/lib/storage.ts`

**Step 1: Rewrite storage.ts**

Replace the entire file. Remove all localStorage code and the dead `SavedView` type. Make load functions async via `dbQuery`. Keep the same interfaces (`SavedWidget`, `NavView`, `WidgetLayoutItem`) so consumers don't break.

```ts
import { dbQuery } from "@/lib/db-client";

export interface SavedWidget {
  id: string;
  title: string;
  spec: unknown;
  collections: string[];
  order: number;
  created_at: string;
}

export async function loadWidgets(): Promise<SavedWidget[]> {
  const [rows] = await dbQuery<[SavedWidget[]]>(
    'SELECT id, title, spec, collections, "order", created_at FROM widgets ORDER BY "order" ASC'
  );
  return rows ?? [];
}

export async function saveWidget(widget: SavedWidget): Promise<void> {
  await dbQuery(
    `INSERT INTO widgets (id, title, spec, collections, "order", created_at)
     VALUES ($id, $title, $spec, $collections, $order, $created_at)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       spec = excluded.spec,
       collections = excluded.collections,
       "order" = excluded."order",
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    {
      id: widget.id,
      title: widget.title,
      spec: widget.spec,
      collections: widget.collections,
      order: widget.order,
      created_at: widget.created_at,
    }
  );
}

export async function deleteWidget(id: string): Promise<void> {
  await dbQuery("DELETE FROM widgets WHERE id = $id", { id });
}

export async function saveWidgetOrder(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await dbQuery(
      'UPDATE widgets SET "order" = $order, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = $id',
      { id: orderedIds[i], order: i }
    );
  }
}

// Nav Views

export interface WidgetLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface NavView {
  id: string;
  name: string;
  widgetIds: string[];
  layouts?: Record<string, WidgetLayoutItem[]>;
  created_at: string;
}

export async function loadNavViews(): Promise<NavView[]> {
  const [rows] = await dbQuery<
    [Array<{ id: string; name: string; widget_ids: string[]; layouts: Record<string, WidgetLayoutItem[]> | null; created_at: string }>]
  >(
    "SELECT id, name, widget_ids, layouts, created_at FROM nav_views ORDER BY created_at ASC"
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    widgetIds: r.widget_ids ?? [],
    layouts: r.layouts ?? undefined,
    created_at: r.created_at,
  }));
}

export async function saveNavView(view: NavView): Promise<void> {
  await dbQuery(
    `INSERT INTO nav_views (id, name, widget_ids, layouts, created_at)
     VALUES ($id, $name, $widgetIds, $layouts, $created_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       widget_ids = excluded.widget_ids,
       layouts = excluded.layouts,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    {
      id: view.id,
      name: view.name,
      widgetIds: view.widgetIds,
      layouts: view.layouts ?? null,
      created_at: view.created_at,
    }
  );
}

export async function deleteNavView(id: string): Promise<void> {
  await dbQuery("DELETE FROM nav_views WHERE id = $id", { id });
}
```

**Step 2: Commit**

```
git add dashboard/src/lib/storage.ts
git commit -m "feat: rewrite storage.ts to use SQLite instead of localStorage"
```

---

### Task 3: Update useWidgetHub hook for async DB operations

**Files:**
- Modify: `dashboard/src/hooks/use-widget-hub.tsx`

**Step 1: Update the hook**

Replace the localStorage-based persist pattern with async DB calls. Load widgets from DB on mount.

```tsx
"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { type Spec } from "@json-render/react";
import { loadWidgets, saveWidget, deleteWidget, saveWidgetOrder, type SavedWidget } from "@/lib/storage";

interface FlyingWidget {
  sourceRect: DOMRect;
  title: string;
  spec: Spec;
  collections: string[];
}

interface WidgetHubContextValue {
  widgets: SavedWidget[];
  addWidget: (title: string, spec: Spec, collections: string[]) => string;
  removeWidget: (id: string) => void;
  reorderWidgets: (orderedIds: string[]) => void;
  flyingWidget: FlyingWidget | null;
  startFlyAnimation: (sourceRect: DOMRect, widget: { title: string; spec: Spec; collections: string[] }) => void;
  completeFlyAnimation: () => void;
}

const WidgetHubContext = createContext<WidgetHubContextValue | null>(null);

export function WidgetHubProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<SavedWidget[]>([]);
  const [flyingWidget, setFlyingWidget] = useState<FlyingWidget | null>(null);

  useEffect(() => {
    loadWidgets().then(setWidgets).catch(console.error);
  }, []);

  const addWidget = useCallback((title: string, spec: Spec, collections: string[]): string => {
    const id = Math.random().toString(36).slice(2);
    const widget: SavedWidget = {
      id,
      title,
      spec,
      collections,
      order: widgets.length,
      created_at: new Date().toISOString(),
    };
    setWidgets((prev) => [...prev, widget]);
    saveWidget(widget).catch(console.error);
    return id;
  }, [widgets]);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => {
      const next = prev.filter((w) => w.id !== id).map((w, i) => ({ ...w, order: i }));
      saveWidgetOrder(next.map((w) => w.id)).catch(console.error);
      return next;
    });
    deleteWidget(id).catch(console.error);
  }, []);

  const reorderWidgets = useCallback((orderedIds: string[]) => {
    setWidgets((prev) => {
      const byId = new Map(prev.map((w) => [w.id, w]));
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((w): w is SavedWidget => !!w)
        .map((w, i) => ({ ...w, order: i }));
      saveWidgetOrder(orderedIds).catch(console.error);
      return next;
    });
  }, []);

  const startFlyAnimation = useCallback((sourceRect: DOMRect, widget: { title: string; spec: Spec; collections: string[] }) => {
    setFlyingWidget({ sourceRect, ...widget });
  }, []);

  const completeFlyAnimation = useCallback(() => {
    if (flyingWidget) {
      addWidget(flyingWidget.title, flyingWidget.spec, flyingWidget.collections);
      setFlyingWidget(null);
    }
  }, [flyingWidget, addWidget]);

  return (
    <WidgetHubContext.Provider value={{
      widgets,
      addWidget,
      removeWidget,
      reorderWidgets,
      flyingWidget,
      startFlyAnimation,
      completeFlyAnimation,
    }}>
      {children}
    </WidgetHubContext.Provider>
  );
}

export function useWidgetHub() {
  const ctx = useContext(WidgetHubContext);
  if (!ctx) throw new Error("useWidgetHub must be used within WidgetHubProvider");
  return ctx;
}
```

**Step 2: Commit**

```
git add dashboard/src/hooks/use-widget-hub.tsx
git commit -m "feat: update useWidgetHub to persist widgets in SQLite"
```

---

### Task 4: Update useViews hook for async DB operations

**Files:**
- Modify: `dashboard/src/hooks/use-views.tsx`

**Step 1: Update the hook**

Replace localStorage calls with async DB calls. Each mutation saves the affected view to DB individually.

```tsx
"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { loadNavViews, saveNavView, deleteNavView, type NavView, type WidgetLayoutItem } from "@/lib/storage";
import { getDefaultWidgetSize } from "@/lib/widget-sizing";
import { dbQuery } from "@/lib/db-client";

interface ViewsContextValue {
  views: NavView[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  addView: (name: string) => string;
  removeView: (id: string) => void;
  addWidgetToView: (viewId: string, widgetId: string, widgetSpec?: unknown) => void;
  removeWidgetFromView: (viewId: string, widgetId: string) => void;
  updateViewLayouts: (viewId: string, layouts: Record<string, WidgetLayoutItem[]>) => void;
}

const ViewsContext = createContext<ViewsContextValue | null>(null);

export function ViewsProvider({ children }: { children: ReactNode }) {
  const [views, setViews] = useState<NavView[]>([]);
  const [activeTab, setActiveTab] = useState("chat");

  useEffect(() => {
    loadNavViews().then(setViews).catch(console.error);
  }, []);

  const addView = useCallback((name: string): string => {
    const id = Math.random().toString(36).slice(2);
    const view: NavView = {
      id,
      name,
      widgetIds: [],
      created_at: new Date().toISOString(),
    };
    setViews((prev) => [...prev, view]);
    saveNavView(view).catch(console.error);
    setActiveTab(id);
    return id;
  }, []);

  const removeView = useCallback((id: string) => {
    setViews((prev) => prev.filter((v) => v.id !== id));
    deleteNavView(id).catch(console.error);
    dbQuery("DELETE FROM _view_layouts WHERE view_id = $viewId", { viewId: id }).catch(() => {});
    setActiveTab((current) => (current === id ? "widgets" : current));
  }, []);

  const addWidgetToView = useCallback((viewId: string, widgetId: string, widgetSpec?: unknown) => {
    setViews((prev) => {
      const next = prev.map((v) => {
        if (v.id !== viewId || v.widgetIds.includes(widgetId)) return v;

        const newWidgetIds = [...v.widgetIds, widgetId];

        let newLayouts = v.layouts ? { ...v.layouts } : undefined;
        if (newLayouts) {
          for (const [bp, items] of Object.entries(newLayouts)) {
            const maxY = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
            const cols = bp === "lg" ? 12 : bp === "md" ? 8 : 4;
            const size = getDefaultWidgetSize(widgetSpec, cols);
            newLayouts[bp] = [
              ...items,
              { i: widgetId, x: 0, y: maxY, w: size.w, h: size.h, minW: 2, minH: 2 },
            ];
          }
        }

        const updated = { ...v, widgetIds: newWidgetIds, layouts: newLayouts };
        saveNavView(updated).catch(console.error);
        return updated;
      });
      return next;
    });
  }, []);

  const removeWidgetFromView = useCallback((viewId: string, widgetId: string) => {
    setViews((prev) => {
      const next = prev.map((v) => {
        if (v.id !== viewId) return v;

        const newWidgetIds = v.widgetIds.filter((wid) => wid !== widgetId);

        let newLayouts = v.layouts ? { ...v.layouts } : undefined;
        if (newLayouts) {
          for (const [bp, items] of Object.entries(newLayouts)) {
            newLayouts[bp] = items.filter((item) => item.i !== widgetId);
          }
        }

        const updated = { ...v, widgetIds: newWidgetIds, layouts: newLayouts };
        saveNavView(updated).catch(console.error);
        return updated;
      });
      return next;
    });
  }, []);

  const updateViewLayouts = useCallback((viewId: string, layouts: Record<string, WidgetLayoutItem[]>) => {
    setViews((prev) => {
      const next = prev.map((v) => {
        if (v.id !== viewId) return v;
        const updated = { ...v, layouts };
        saveNavView(updated).catch(console.error);
        return updated;
      });
      return next;
    });
  }, []);

  return (
    <ViewsContext.Provider value={{
      views,
      activeTab,
      setActiveTab,
      addView,
      removeView,
      addWidgetToView,
      removeWidgetFromView,
      updateViewLayouts,
    }}>
      {children}
    </ViewsContext.Provider>
  );
}

export function useViews() {
  const ctx = useContext(ViewsContext);
  if (!ctx) throw new Error("useViews must be used within ViewsProvider");
  return ctx;
}
```

**Step 2: Commit**

```
git add dashboard/src/hooks/use-views.tsx
git commit -m "feat: update useViews to persist nav views in SQLite"
```

---

### Task 5: Simplify useViewLayout — remove localStorage fallback

**Files:**
- Modify: `dashboard/src/hooks/use-view-layout.ts`

**Step 1: Remove the localStorage fallback path**

The hook currently falls back to `view.layouts` from localStorage. Since views are now DB-backed, simplify to: load from `_view_layouts` table or generate defaults.

```ts
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDb } from "./use-db";
import { useViews } from "./use-views";
import { useWidgetHub } from "./use-widget-hub";
import { dbQuery } from "@/lib/db-client";
import { generateDefaultLayout } from "@/lib/widget-sizing";
import type { WidgetLayoutItem } from "@/lib/storage";
import type { Layout, ResponsiveLayouts } from "react-grid-layout";

export function useViewLayout(viewId: string, widgetIds: string[]) {
  const { status } = useDb();
  const { updateViewLayouts } = useViews();
  const { widgets } = useWidgetHub();
  const [layouts, setLayouts] = useState<ResponsiveLayouts>({});
  const [isLoading, setIsLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedViewRef = useRef<string>("");

  // Build a spec lookup map
  const specMap = useRef(new Map<string, unknown>());
  useEffect(() => {
    const map = new Map<string, unknown>();
    for (const w of widgets) {
      map.set(w.id, w.spec);
    }
    specMap.current = map;
  }, [widgets]);

  // Load layout from DB or generate defaults
  useEffect(() => {
    if (loadedViewRef.current === viewId) return;
    if (status !== "connected") return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);

      try {
        const [results] = await dbQuery<
          [Array<{ layouts: ResponsiveLayouts }>]
        >(
          "SELECT layouts FROM _view_layouts WHERE view_id = $viewId LIMIT 1",
          { viewId },
        );
        if (!cancelled && results?.[0]?.layouts) {
          setLayouts(results[0].layouts);
          setIsLoading(false);
          loadedViewRef.current = viewId;
          return;
        }
      } catch (err) {
        console.warn("Failed to load layout from DB:", err);
      }

      // Generate defaults
      if (!cancelled) {
        const lg = generateDefaultLayout(widgetIds, specMap.current, 12);
        const md = generateDefaultLayout(widgetIds, specMap.current, 8);
        const sm = generateDefaultLayout(widgetIds, specMap.current, 4);
        setLayouts({ lg, md, sm });
        setIsLoading(false);
        loadedViewRef.current = viewId;
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [viewId, status, widgetIds, widgets]);

  // Reset tracking when view changes
  useEffect(() => {
    return () => {
      loadedViewRef.current = "";
    };
  }, [viewId]);

  // Cancel debounce timer on view switch or unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [viewId]);

  // Debounced persist to DB
  const persistLayouts = useCallback(
    (newLayouts: ResponsiveLayouts) => {
      updateViewLayouts(viewId, newLayouts as Record<string, WidgetLayoutItem[]>);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await dbQuery(
            `INSERT INTO _view_layouts (view_id, layouts) VALUES ($viewId, $layouts)
             ON CONFLICT(view_id) DO UPDATE SET layouts = excluded.layouts, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
            { viewId, layouts: newLayouts },
          );
        } catch (err) {
          console.error("Failed to save layout to DB:", err);
        }
      }, 500);
    },
    [viewId, updateViewLayouts],
  );

  const onLayoutChange = useCallback(
    (_currentLayout: Layout, allLayouts: ResponsiveLayouts) => {
      setLayouts(allLayouts);
      persistLayouts(allLayouts);
    },
    [persistLayouts],
  );

  return { layouts, onLayoutChange, isLoading };
}
```

**Step 2: Commit**

```
git add dashboard/src/hooks/use-view-layout.ts
git commit -m "refactor: simplify useViewLayout, remove localStorage fallback"
```

---

### Task 6: Build and verify

**Step 1: Build the project**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

**Step 2: Smoke test**

Run dev server, create a widget, create a view, add widget to view, refresh — data should persist.

**Step 3: Commit any fixes if needed**
