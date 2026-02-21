"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { type Spec } from "@json-render/react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { DashboardRenderer } from "@/lib/render/renderer";
import { useViews } from "@/hooks/use-views";
import { useWidgetHub } from "@/hooks/use-widget-hub";
import { useViewLayout } from "@/hooks/use-view-layout";
import type { SavedWidget } from "@/lib/storage";

export function ViewPanel({ viewId }: { viewId: string }) {
  const { views, removeWidgetFromView } = useViews();
  const { widgets } = useWidgetHub();

  const view = views.find((v) => v.id === viewId);

  const widgetIds = useMemo(() => view?.widgetIds ?? [], [view?.widgetIds]);

  const viewWidgets = useMemo(() => {
    if (!view) return [];
    const byId = new Map(widgets.map((w) => [w.id, w]));
    return widgetIds
      .map((id) => byId.get(id))
      .filter((w): w is SavedWidget => !!w);
  }, [view, widgets, widgetIds]);

  const { layouts, onLayoutChange, isLoading } = useViewLayout(viewId, widgetIds);

  const { width, containerRef, mounted } = useContainerWidth();

  if (!view) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        View not found
      </div>
    );
  }

  if (viewWidgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 empty-state-glow">
        <div className="size-14 rounded-2xl bg-primary/8 flex items-center justify-center">
          <LayoutGrid className="size-6 text-primary/50" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-foreground/70">{view.name}</p>
          <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-60 leading-relaxed">
            Add widgets from the Widgets tab using the menu on each card
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <LayoutGrid className="size-3.5 text-primary/60" />
        <span className="text-xs font-medium text-foreground/70">{view.name}</span>
        <span className="text-[10px] text-muted-foreground/50 tabular-nums">{viewWidgets.length}</span>
      </div>
      <div className="flex-1 overflow-auto p-4" ref={containerRef}>
        {mounted && (
          <ResponsiveGridLayout
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 768, sm: 0 }}
            cols={{ lg: 12, md: 8, sm: 4 }}
            rowHeight={80}
            width={width}
            onLayoutChange={onLayoutChange}
            dragConfig={{ enabled: true, handle: ".drag-handle" }}
            resizeConfig={{ enabled: true, handles: ["se"] }}
            margin={[12, 12] as const}
            containerPadding={[0, 0] as const}
            compactor={verticalCompactor}
          >
            {viewWidgets.map((widget) => (
              <div key={widget.id}>
                <DashboardRenderer
                  spec={widget.spec as Spec}
                  title={widget.title}
                  onRemove={() => removeWidgetFromView(viewId, widget.id)}
                  showDragHandle
                  className="h-full flex flex-col"
                  contentClassName="flex-1 overflow-auto p-3"
                />
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}
