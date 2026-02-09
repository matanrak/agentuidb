"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WidgetCard } from "./widget-card";
import type { SavedWidget } from "@/lib/storage";

interface SortableWidgetCardProps {
  widget: SavedWidget;
  onRemove: (id: string) => void;
}

export function SortableWidgetCard({ widget, onRemove }: SortableWidgetCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <WidgetCard
      ref={setNodeRef}
      widget={widget}
      onRemove={onRemove}
      dragAttributes={attributes}
      dragListeners={listeners}
      style={style}
      isDragging={isDragging}
    />
  );
}
