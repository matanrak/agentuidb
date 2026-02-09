"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSurreal } from "./use-surreal";
import { useViews } from "./use-views";
import { useWidgetHub } from "./use-widget-hub";
import { dbQuery } from "@/lib/surreal-client";
import { generateDefaultLayout } from "@/lib/widget-sizing";
import type { WidgetLayoutItem } from "@/lib/storage";
import type { Layout, ResponsiveLayouts } from "react-grid-layout";

// Track what quality of data was used for initialization
type InitSource = "db" | "localStorage" | "defaults" | null;

export function useViewLayout(viewId: string, widgetIds: string[]) {
  const { status } = useSurreal();
  const { views, updateViewLayouts } = useViews();
  const { widgets } = useWidgetHub();
  const [layouts, setLayouts] = useState<ResponsiveLayouts>({});
  const [isLoading, setIsLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initSourceRef = useRef<{ viewId: string; source: InitSource }>({ viewId: "", source: null });

  // Build a spec lookup map
  const specMap = useRef(new Map<string, unknown>());
  useEffect(() => {
    const map = new Map<string, unknown>();
    for (const w of widgets) {
      map.set(w.id, w.spec);
    }
    specMap.current = map;
  }, [widgets]);

  // Load layout — re-runs when viewId, status, or widgets change
  useEffect(() => {
    const prev = initSourceRef.current;
    const sameView = prev.viewId === viewId;

    // Already loaded from an authoritative source for this view — skip
    if (sameView && (prev.source === "db" || prev.source === "localStorage")) return;

    // Already generated defaults with full widget data — skip unless DB just connected
    if (sameView && prev.source === "defaults" && status !== "connected") return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);

      // Try SurrealDB via API proxy
      if (status === "connected") {
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
            initSourceRef.current = { viewId, source: "db" };
            return;
          }
        } catch (err) {
          console.warn("Failed to load layout from SurrealDB:", err);
        }
      }

      // Fall back to in-memory view layouts (from localStorage)
      const view = views.find((v) => v.id === viewId);
      if (!cancelled && view?.layouts?.lg) {
        setLayouts(view.layouts as ResponsiveLayouts);
        setIsLoading(false);
        initSourceRef.current = { viewId, source: "localStorage" };
        return;
      }

      // Generate defaults — use specs if available, otherwise basic sizing
      if (!cancelled) {
        const lg = generateDefaultLayout(widgetIds, specMap.current, 12);
        const md = generateDefaultLayout(widgetIds, specMap.current, 8);
        const sm = generateDefaultLayout(widgetIds, specMap.current, 4);
        setLayouts({ lg, md, sm });
        setIsLoading(false);
        initSourceRef.current = { viewId, source: specMap.current.size > 0 ? "defaults" : null };
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [viewId, status, widgetIds, views, widgets]);

  // Reset init tracking when view changes
  useEffect(() => {
    return () => {
      initSourceRef.current = { viewId: "", source: null };
    };
  }, [viewId]);

  // Cancel debounce timer on view switch or unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [viewId]);

  // Debounced persist to SurrealDB + localStorage
  const persistLayouts = useCallback(
    (newLayouts: ResponsiveLayouts) => {
      updateViewLayouts(viewId, newLayouts as Record<string, WidgetLayoutItem[]>);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const [updated] = await dbQuery<[Array<unknown>]>(
            "UPDATE _view_layouts SET layouts = $layouts, updated_at = time::now() WHERE view_id = $viewId",
            { viewId, layouts: newLayouts },
          );
          if (!updated || (Array.isArray(updated) && updated.length === 0)) {
            await dbQuery(
              "CREATE _view_layouts SET view_id = $viewId, layouts = $layouts, created_at = time::now(), updated_at = time::now()",
              { viewId, layouts: newLayouts },
            );
          }
        } catch (err) {
          console.error("Failed to save layout to SurrealDB:", err);
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
