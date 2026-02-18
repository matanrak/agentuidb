"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { loadNavViews, saveNavView, deleteNavView, type NavView, type WidgetLayoutItem } from "@/lib/storage";
import { getDefaultWidgetSize } from "@/lib/widget-sizing";
import { dbDeleteLayout } from "@/lib/db-client";

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
    const id = crypto.randomUUID();
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
    dbDeleteLayout(id).catch(() => {});
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
    setViews((prev) =>
      prev.map((v) => (v.id === viewId ? { ...v, layouts } : v))
    );
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
