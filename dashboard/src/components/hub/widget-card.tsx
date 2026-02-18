"use client";

import { forwardRef } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { type Spec } from "@json-render/react";
import { WidgetCard as SharedWidgetCard } from "@/components/shared/widget-card";
import type { SavedWidget } from "@/lib/storage";

interface HubWidgetCardProps {
  widget: SavedWidget;
  onRemove: (id: string) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  style?: React.CSSProperties;
  isDragging?: boolean;
}

export const WidgetCard = forwardRef<HTMLDivElement, HubWidgetCardProps>(
  function WidgetCard({ widget, onRemove, dragAttributes, dragListeners, style, isDragging }, ref) {
    return (
      <SharedWidgetCard
        ref={ref}
        spec={widget.spec as Spec}
        title={widget.title}
        widgetId={widget.id}
        rawSpec={widget.spec}
        onRemove={() => onRemove(widget.id)}
        addToView
        dragAttributes={dragAttributes}
        dragListeners={dragListeners}
        style={style}
        isDragging={isDragging}
      />
    );
  },
);
