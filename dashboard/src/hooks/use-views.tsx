"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { loadNavViews, saveNavViews, type NavView } from "@/lib/storage";

interface ViewsContextValue {
  views: NavView[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  addView: (name: string) => string;
  removeView: (id: string) => void;
  addWidgetToView: (viewId: string, widgetId: string) => void;
  removeWidgetFromView: (viewId: string, widgetId: string) => void;
}

const ViewsContext = createContext<ViewsContextValue | null>(null);

export function ViewsProvider({ children }: { children: ReactNode }) {
  const [views, setViews] = useState<NavView[]>([]);
  const [activeTab, setActiveTab] = useState("chat");

  useEffect(() => {
    setViews(loadNavViews());
  }, []);

  const addView = useCallback((name: string): string => {
    const id = Math.random().toString(36).slice(2);
    const view: NavView = {
      id,
      name,
      widgetIds: [],
      created_at: new Date().toISOString(),
    };
    setViews((prev) => {
      const next = [...prev, view];
      saveNavViews(next);
      return next;
    });
    setActiveTab(id);
    return id;
  }, []);

  const removeView = useCallback((id: string) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      saveNavViews(next);
      return next;
    });
    setActiveTab((current) => (current === id ? "widgets" : current));
  }, []);

  const addWidgetToView = useCallback((viewId: string, widgetId: string) => {
    setViews((prev) => {
      const next = prev.map((v) =>
        v.id === viewId && !v.widgetIds.includes(widgetId)
          ? { ...v, widgetIds: [...v.widgetIds, widgetId] }
          : v
      );
      saveNavViews(next);
      return next;
    });
  }, []);

  const removeWidgetFromView = useCallback((viewId: string, widgetId: string) => {
    setViews((prev) => {
      const next = prev.map((v) =>
        v.id === viewId
          ? { ...v, widgetIds: v.widgetIds.filter((wid) => wid !== widgetId) }
          : v
      );
      saveNavViews(next);
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
