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
          "SELECT layouts FROM view_layouts WHERE view_id = $viewId LIMIT 1",
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
            `INSERT INTO view_layouts (view_id, layouts) VALUES ($viewId, $layouts)
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
