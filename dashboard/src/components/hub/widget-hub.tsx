"use client";

import { useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "motion/react";
import { useWidgetHub } from "@/hooks/use-widget-hub";
import { SortableWidgetCard } from "./sortable-widget-card";

export function WidgetHub() {
  const { widgets, removeWidget, reorderWidgets } = useWidgetHub();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sortedWidgets = useMemo(
    () => [...widgets].sort((a, b) => a.order - b.order),
    [widgets],
  );

  const widgetIds = useMemo(() => sortedWidgets.map((w) => w.id), [sortedWidgets]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: { active: { id: string | number } }) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgetIds.indexOf(String(active.id));
    const newIndex = widgetIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(widgetIds, oldIndex, newIndex);
    reorderWidgets(newOrder);
  }

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-dot-grid-subtle">
        <div className="size-12 rounded-2xl bg-primary/8 flex items-center justify-center">
          <LayoutGrid className="size-5 text-primary/60" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground/80">Widget Hub</p>
          <p className="text-xs text-muted-foreground/50 mt-1 max-w-48">
            Pin widgets from chat to build your dashboard
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="size-3.5 text-primary/60" />
          <span className="text-xs font-medium text-foreground/70">Widget Hub</span>
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">{widgets.length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-3 p-4">
              <AnimatePresence mode="popLayout">
                {sortedWidgets.map((widget) => (
                  <motion.div
                    key={widget.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className=""
                  >
                    <SortableWidgetCard widget={widget} onRemove={removeWidget} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
