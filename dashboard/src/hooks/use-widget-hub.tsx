"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { StringRecordId } from "surrealdb";
import { type Spec } from "@json-render/react";
import { getSurreal } from "@/lib/surreal";
import { useSurreal } from "./use-surreal";
import type { SavedWidget } from "@/lib/storage";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function normalize(r: Record<string, unknown>): SavedWidget {
  return { ...r, id: String(r.id) } as SavedWidget;
}

async function dbLoad(): Promise<SavedWidget[]> {
  const db = getSurreal();
  if (!db) return [];
  const [rows] = await db.query<[Record<string, unknown>[]]>(
    "SELECT * FROM pinned_widgets ORDER BY order ASC",
  );
  return (rows ?? []).map(normalize);
}

async function dbCreate(data: Omit<SavedWidget, "id">): Promise<SavedWidget | null> {
  const db = getSurreal();
  if (!db) return null;
  const [rows] = await db.query<[Record<string, unknown>[]]>(
    "CREATE pinned_widgets CONTENT $data",
    { data },
  );
  const r = rows?.[0];
  return r ? normalize(r) : null;
}

async function dbDelete(id: string): Promise<void> {
  const db = getSurreal();
  if (!db) return;
  await db.query("DELETE $id", { id: new StringRecordId(id) });
}

async function dbSetOrder(id: string, order: number): Promise<void> {
  const db = getSurreal();
  if (!db) return;
  await db.query("UPDATE $id SET order = $order", {
    id: new StringRecordId(id),
    order,
  });
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

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
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const { status } = useSurreal();

  // Load widgets from DB once connected
  useEffect(() => {
    if (status !== "connected") return;
    dbLoad().then(setWidgets).catch(console.error);
  }, [status]);

  const addWidget = useCallback((title: string, spec: Spec, collections: string[]): string => {
    const tempId = `temp_${Math.random().toString(36).slice(2)}`;
    const created_at = new Date().toISOString();
    const order = widgetsRef.current.length;

    setWidgets((prev) => [...prev, { id: tempId, title, spec, collections, order, created_at }]);

    dbCreate({ title, spec, collections, order, created_at })
      .then((created) => {
        if (created) {
          setWidgets((prev) => prev.map((w) => (w.id === tempId ? created : w)));
        }
      })
      .catch(console.error);

    return tempId;
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id).map((w, i) => ({ ...w, order: i })));

    if (!id.startsWith("temp_")) {
      dbDelete(id).catch(console.error);
    }
  }, []);

  const reorderWidgets = useCallback((orderedIds: string[]) => {
    const prev = widgetsRef.current;
    const byId = new Map(prev.map((w) => [w.id, w]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((w): w is SavedWidget => !!w)
      .map((w, i) => ({ ...w, order: i }));

    setWidgets(reordered);

    for (const w of reordered) {
      if (!w.id.startsWith("temp_")) {
        dbSetOrder(w.id, w.order).catch(console.error);
      }
    }
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
