"use client";

import { useState, useCallback, forwardRef } from "react";
import { GripVertical, RefreshCw, X } from "lucide-react";
import { type Spec } from "@json-render/react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { Button } from "@/components/ui/button";
import { DashboardRenderer } from "@/lib/render/renderer";
import { useSpecData } from "@/hooks/use-spec-data";
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
    const [confirmRemove, setConfirmRemove] = useState(false);

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
        <div className="p-3 overflow-auto max-h-[400px]">
          <DashboardRenderer
            key={dataVersion}
            spec={spec}
            data={data}
            setData={setData}
            onDataChange={handleDataChange}
            loading={isLoading}
          />
        </div>
      </div>
    );
  }
);
