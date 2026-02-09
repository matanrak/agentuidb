"use client";

import { useState, useCallback, useMemo, forwardRef } from "react";
import { GripVertical, RefreshCw, X, Check, FolderPlus, Plus } from "lucide-react";
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
import type { SavedWidget } from "@/lib/storage";

interface WidgetCardProps {
  widget: SavedWidget;
  onRemove: (id: string) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  style?: React.CSSProperties;
  isDragging?: boolean;
}

export const WidgetCard = forwardRef<HTMLDivElement, WidgetCardProps>(
  function WidgetCard({ widget, onRemove, dragAttributes, dragListeners, style, isDragging }, ref) {
    const spec = widget.spec as Spec;
    const { data, setData, dataVersion, isLoading, refresh, handleDataChange } = useSpecData(spec);
    const { views, addView, addWidgetToView, removeWidgetFromView } = useViews();
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [editPending, setEditPending] = useState<EditPendingState | null>(null);
    const hasPinableChildren = useMemo(() => collectPinableKeys(spec).size > 0, [spec]);
    const handlePinElement = usePinSubWidget(spec);

    const handleRemove = useCallback(() => {
      if (confirmRemove) {
        onRemove(widget.id);
      } else {
        setConfirmRemove(true);
        setTimeout(() => setConfirmRemove(false), 2000);
      }
    }, [confirmRemove, onRemove, widget.id]);

    return (
      <div
        ref={ref}
        style={style}
        className={`border border-border/50 rounded-xl bg-card/80 backdrop-blur-sm overflow-hidden widget-card-hover transition-shadow ${isDragging ? "opacity-50 shadow-lg shadow-primary/10" : ""}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          <button
            className="drag-handle text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            {...dragAttributes}
            {...dragListeners}
          >
            <GripVertical className="size-3.5" />
          </button>
          <span className="text-xs font-medium text-foreground/80 truncate flex-1">{widget.title}</span>
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
                    const inView = view.widgetIds.includes(widget.id);
                    return (
                      <DropdownMenuCheckboxItem
                        key={view.id}
                        checked={inView}
                        onCheckedChange={() =>
                          inView
                            ? removeWidgetFromView(view.id, widget.id)
                            : addWidgetToView(view.id, widget.id, widget.spec)
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
                    addWidgetToView(viewId, widget.id, widget.spec);
                  }
                }}
              >
                <Plus className="size-3.5" />
                New View...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => refresh()}
            disabled={isLoading}
            title="Refresh data"
          >
            <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`size-6 rounded-md transition-colors ${confirmRemove ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground"}`}
            onClick={handleRemove}
            title={confirmRemove ? "Click again to remove" : "Remove widget"}
          >
            <X className="size-3" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-3">
          <DashboardRenderer
            key={dataVersion}
            spec={spec}
            data={data}
            setData={setData}
            onDataChange={handleDataChange}
            onSaved={refresh}
            onEditPendingChange={setEditPending}
            loading={isLoading}
            pinnable={hasPinableChildren}
            onPinElement={hasPinableChildren ? handlePinElement : undefined}
          />
        </div>
      </div>
    );
  }
);
