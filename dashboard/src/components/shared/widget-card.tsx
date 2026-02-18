"use client";

import { useState, useCallback, useMemo, forwardRef } from "react";
import {
  GripVertical,
  RefreshCw,
  X,
  Check,
  FolderPlus,
  Plus,
  Code,
  Eye,
  Pin,
} from "lucide-react";
import { type Spec } from "@json-render/react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { DashboardRenderer } from "@/lib/render/renderer";
import { type EditPendingState } from "@/lib/render/edit-context";
import { useSpecData } from "@/hooks/use-spec-data";
import { useViews } from "@/hooks/use-views";
import { collectPinableKeys, usePinSubWidget } from "@/lib/render/sub-widget-pin";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WidgetCardProps {
  spec: Spec;
  title: string;
  widgetId?: string;
  rawSpec?: unknown;
  onPin?: () => void;
  onRemove?: () => void;
  addToView?: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  showDragHandle?: boolean;
  isDragging?: boolean;
  style?: React.CSSProperties;
  loadingOverride?: boolean;
  className?: string;
  contentClassName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WidgetCard = forwardRef<HTMLDivElement, WidgetCardProps>(
  function WidgetCard(
    {
      spec,
      title,
      widgetId,
      rawSpec,
      onPin,
      onRemove,
      addToView,
      dragAttributes,
      dragListeners,
      showDragHandle,
      isDragging,
      style,
      loadingOverride,
      className,
      contentClassName,
    },
    ref,
  ) {
    // ---- Data fetching & editing ----
    // When loadingOverride is true (e.g. streaming), pass null to avoid fetching against an incomplete spec
    const { data, setData, dataVersion, isLoading, refresh, handleDataChange } =
      useSpecData(loadingOverride ? null : spec);
    const [editPending, setEditPending] = useState<EditPendingState | null>(
      null,
    );

    // ---- Sub-widget pinning ----
    const hasPinableChildren = useMemo(
      () => collectPinableKeys(spec).size > 0,
      [spec],
    );
    const handlePinElement = usePinSubWidget(spec);

    // ---- Show code toggle ----
    const [showJson, setShowJson] = useState(false);

    // ---- Remove with 2-second confirm ----
    const [confirmRemove, setConfirmRemove] = useState(false);
    const handleRemove = useCallback(() => {
      if (!onRemove) return;
      if (confirmRemove) {
        onRemove();
      } else {
        setConfirmRemove(true);
        setTimeout(() => setConfirmRemove(false), 2000);
      }
    }, [confirmRemove, onRemove]);

    // ---- Add-to-view dropdown ----
    const { views, addView, addWidgetToView, removeWidgetFromView } =
      useViews();

    // Determine effective loading state (streaming override wins)
    const loading = loadingOverride ?? isLoading;

    const hasDrag = !!(dragAttributes && dragListeners);
    const showHandle = showDragHandle || hasDrag;

    return (
      <div
        ref={ref}
        style={style}
        className={`border border-border/50 rounded-xl bg-card/80 backdrop-blur-sm overflow-hidden widget-card-hover transition-shadow ${isDragging ? "opacity-50 shadow-lg shadow-primary/10" : ""} ${className ?? ""}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          {/* Drag handle */}
          {showHandle && (
            <button
              className="drag-handle text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing"
              {...(hasDrag ? { ...dragAttributes, ...dragListeners } : {})}
            >
              <GripVertical className="size-3.5" />
            </button>
          )}

          {/* Title */}
          <span className="text-xs font-medium text-foreground/80 truncate flex-1">
            {title}
          </span>

          {/* Save edits */}
          {editPending && (
            <Button
              size="sm"
              className="h-6 rounded-md bg-success hover:bg-success/90 text-white text-xs px-2"
              onClick={() => editPending.save()}
              disabled={editPending.saving}
              title="Save changes to database"
            >
              <Check className="size-3 mr-1" />
              {editPending.saving ? "..." : `Save (${editPending.count})`}
            </Button>
          )}

          {/* Pin to library */}
          {onPin && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 rounded-md text-muted-foreground hover:text-primary"
              onClick={onPin}
              title="Pin to Widget Hub"
            >
              <Pin className="size-3" />
            </Button>
          )}

          {/* Add to view dropdown */}
          {addToView && widgetId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                  title="Add to view"
                >
                  <FolderPlus className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                {views.length > 0 && (
                  <>
                    {views.map((view) => {
                      const inView = view.widgetIds.includes(widgetId);
                      return (
                        <DropdownMenuCheckboxItem
                          key={view.id}
                          checked={inView}
                          onCheckedChange={() =>
                            inView
                              ? removeWidgetFromView(view.id, widgetId)
                              : addWidgetToView(
                                  view.id,
                                  widgetId,
                                  rawSpec ?? spec,
                                )
                          }
                        >
                          {view.name}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    const name = prompt("View name:");
                    if (name?.trim()) {
                      const viewId = addView(name.trim());
                      addWidgetToView(viewId, widgetId, rawSpec ?? spec);
                    }
                  }}
                >
                  <Plus className="size-3.5" />
                  New View...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Show code toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setShowJson((v) => !v)}
            title={showJson ? "Show rendered UI" : "Show JSON spec"}
          >
            {showJson ? (
              <Eye className="size-3" />
            ) : (
              <Code className="size-3" />
            )}
          </Button>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => refresh()}
            disabled={isLoading}
            title="Refresh data"
          >
            <RefreshCw
              className={`size-3 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>

          {/* Remove with confirm */}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className={`size-6 rounded-md transition-colors ${confirmRemove ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground"}`}
              onClick={handleRemove}
              title={confirmRemove ? "Click again to remove" : "Remove widget"}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>

        {/* Content */}
        <div className={contentClassName ?? "p-3"}>
          {showJson ? (
            <pre className="text-xs font-mono bg-background/50 border border-border/30 rounded-lg p-3 overflow-auto max-h-[500px] text-muted-foreground">
              {JSON.stringify(spec, null, 2)}
            </pre>
          ) : (
            <DashboardRenderer
              key={dataVersion}
              spec={spec}
              data={data}
              setData={setData}
              onDataChange={handleDataChange}
              onSaved={refresh}
              onEditPendingChange={setEditPending}
              loading={loading}
              pinnable={hasPinableChildren}
              onPinElement={
                hasPinableChildren ? handlePinElement : undefined
              }
            />
          )}
        </div>
      </div>
    );
  },
);
