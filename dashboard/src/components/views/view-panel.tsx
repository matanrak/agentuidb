"use client";

import { useMemo } from "react";
import { LayoutGrid, X, GripVertical } from "lucide-react";
import { type Spec } from "@json-render/react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Button } from "@/components/ui/button";
import { DashboardRenderer } from "@/lib/render/renderer";
import { useViews } from "@/hooks/use-views";
import { useWidgetHub } from "@/hooks/use-widget-hub";
import { useViewLayout } from "@/hooks/use-view-layout";
import { useSpecData } from "@/hooks/use-spec-data";
import type { SavedWidget } from "@/lib/storage";

function ViewWidgetCard({ widget, onRemove }: { widget: SavedWidget; onRemove: () => void }) {
  const spec = widget.spec as Spec;
  const { data, setData, dataVersion, isLoading, refresh, handleDataChange } = useSpecData(spec);

  return (
    <div className="h-full flex flex-col border border-border/50 rounded-xl bg-card/80 backdrop-blur-sm overflow-hidden widget-card-hover">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
        <div className="drag-handle text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing">
          <GripVertical className="size-3.5" />
        </div>
        <span className="text-xs font-medium text-foreground/80 truncate flex-1">{widget.title}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 rounded-md text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          title="Remove from view"
        >
          <X className="size-3" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <DashboardRenderer
          key={dataVersion}
          spec={spec}
          data={data}
          setData={setData}
          onDataChange={handleDataChange}
          onSaved={refresh}
          loading={isLoading}
        />
      </div>
    </div>
  );
}

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
                <ViewWidgetCard
                  widget={widget}
                  onRemove={() => removeWidgetFromView(viewId, widget.id)}
                />
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}
