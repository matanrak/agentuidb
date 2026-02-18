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
    const id = crypto.randomUUID();
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
