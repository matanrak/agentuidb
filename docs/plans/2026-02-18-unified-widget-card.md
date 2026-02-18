# Unified WidgetCard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace three duplicated widget wrappers with a single shared `WidgetCard` component.

**Architecture:** Create a new shared `WidgetCard` in `components/shared/` that owns the header bar, all toolbar actions (refresh, show code, save edits, sub-widget pin), and `DashboardRenderer` integration. Each context (chat, workshop, hub, view) passes only context-specific props (`onPin`, `onRemove`, `addToView`, drag props). No tests exist in this project — skip TDD, just verify manually.

**Tech Stack:** React, TypeScript, lucide-react icons, @dnd-kit (drag), @json-render/react (specs)

---

### Task 1: Create shared WidgetCard component

**Files:**
- Create: `dashboard/src/components/shared/widget-card.tsx`

**Step 1: Create the shared directory and component**

Create `dashboard/src/components/shared/widget-card.tsx` with the unified component. This merges the patterns from `hub/widget-card.tsx` (header + drag + add-to-view), `chat/chat-message.tsx` (pin + show code), and `views/view-panel.tsx` (minimal view card).

```tsx
"use client";

import { useState, useCallback, useMemo, forwardRef } from "react";
import {
  GripVertical, RefreshCw, X, Check, FolderPlus, Plus, Pin, Code, Eye,
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

export interface WidgetCardProps {
  spec: Spec;
  title: string;

  // Widget ID — needed for add-to-view menu to track membership
  widgetId?: string;
  // Raw spec for add-to-view (may differ from spec if spec is processed)
  rawSpec?: unknown;

  // Context-specific actions
  onPin?: () => void;
  onRemove?: () => void;
  addToView?: boolean;

  // Drag support
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  isDragging?: boolean;
  style?: React.CSSProperties;

  // Loading override (e.g. streaming)
  loadingOverride?: boolean;

  // Layout variant
  className?: string;
  contentClassName?: string;
}

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
      isDragging,
      style,
      loadingOverride,
      className,
      contentClassName,
    },
    ref,
  ) {
    const { data, setData, dataVersion, isLoading, refresh, handleDataChange } =
      useSpecData(spec);
    const { views, addView, addWidgetToView, removeWidgetFromView } = useViews();
    const [showJson, setShowJson] = useState(false);
    const [editPending, setEditPending] = useState<EditPendingState | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);

    const hasPinableChildren = useMemo(
      () => collectPinableKeys(spec).size > 0,
      [spec],
    );
    const handlePinElement = usePinSubWidget(spec);

    const handleRemove = useCallback(() => {
      if (!onRemove) return;
      if (confirmRemove) {
        onRemove();
      } else {
        setConfirmRemove(true);
        setTimeout(() => setConfirmRemove(false), 2000);
      }
    }, [confirmRemove, onRemove]);

    const hasDrag = !!(dragAttributes && dragListeners);

    return (
      <div
        ref={ref}
        style={style}
        className={`border border-border/50 rounded-xl bg-card/80 backdrop-blur-sm overflow-hidden widget-card-hover transition-shadow ${isDragging ? "opacity-50 shadow-lg shadow-primary/10" : ""} ${className ?? ""}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          {hasDrag && (
            <button
              className="drag-handle text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              {...dragAttributes}
              {...dragListeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          )}
          <span className="text-xs font-medium text-foreground/80 truncate flex-1">
            {title}
          </span>

          {/* Save pending edits */}
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

          {/* Pin (save to library) */}
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

          {/* Add to view */}
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
                              : addWidgetToView(view.id, widgetId, rawSpec ?? spec)
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
            {showJson ? <Eye className="size-3" /> : <Code className="size-3" />}
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
            <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>

          {/* Remove */}
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
              loading={loadingOverride ?? isLoading}
              pinnable={hasPinableChildren}
              onPinElement={hasPinableChildren ? handlePinElement : undefined}
            />
          )}
        </div>
      </div>
    );
  },
);
```

**Step 2: Commit**

```bash
git add dashboard/src/components/shared/widget-card.tsx
git commit -m "feat: add shared WidgetCard component"
```

---

### Task 2: Migrate hub/widget-card.tsx to use shared WidgetCard

**Files:**
- Modify: `dashboard/src/components/hub/widget-card.tsx`
- Verify: `dashboard/src/components/hub/sortable-widget-card.tsx` (imports from `./widget-card` — should still work)

**Step 1: Replace hub/widget-card.tsx**

Replace the entire file with a thin wrapper that passes hub-specific props to the shared component.

```tsx
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
```

**Step 2: Verify sortable-widget-card.tsx still compiles**

`sortable-widget-card.tsx` imports `{ WidgetCard } from "./widget-card"` — the export name and props interface haven't changed, so it should work without modification.

**Step 3: Commit**

```bash
git add dashboard/src/components/hub/widget-card.tsx
git commit -m "refactor: hub widget-card uses shared WidgetCard"
```

---

### Task 3: Migrate views/view-panel.tsx to use shared WidgetCard

**Files:**
- Modify: `dashboard/src/components/views/view-panel.tsx`

**Step 1: Replace ViewWidgetCard with shared WidgetCard**

Remove the local `ViewWidgetCard` function and import the shared component. Update the `ViewPanel` to use it.

The key changes:
- Remove the `ViewWidgetCard` function (lines 17-51)
- Remove the `useSpecData` import (shared WidgetCard handles this internally)
- Import `WidgetCard` from shared
- Import `Spec` from `@json-render/react`
- Replace `<ViewWidgetCard>` with `<WidgetCard>` passing view-specific props

```tsx
"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { type Spec } from "@json-render/react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { WidgetCard } from "@/components/shared/widget-card";
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
                <WidgetCard
                  spec={widget.spec as Spec}
                  title={widget.title}
                  onRemove={() => removeWidgetFromView(viewId, widget.id)}
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
```

**Step 2: Commit**

```bash
git add dashboard/src/components/views/view-panel.tsx
git commit -m "refactor: view panel uses shared WidgetCard"
```

---

### Task 4: Migrate chat/chat-message.tsx to use shared WidgetCard

**Files:**
- Modify: `dashboard/src/components/chat/chat-message.tsx`

**Step 1: Replace inline widget rendering with shared WidgetCard**

The key changes:
- Remove all widget-specific state/hooks (`useSpecData`, `usePinSubWidget`, `showJson`, `editPending`)
- Remove unused icon imports (`RefreshCw`, `Code`, `Eye`, `Check`)
- Keep the `handleAddToHub` callback for the `onPin` prop
- Keep `specContainerRef` for the fly animation origin rect
- Replace the inline `<div>` + toolbar + `<DashboardRenderer>` block with `<WidgetCard>`

```tsx
"use client";

import { useCallback, useRef } from "react";
import { type Spec } from "@json-render/react";
import { WidgetCard } from "@/components/shared/widget-card";
import { extractCollections } from "@/hooks/use-spec-data";
import { useWidgetHub } from "@/hooks/use-widget-hub";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  spec?: Spec | null;
  isStreaming?: boolean;
  widgetTitle?: string;
}

export function ChatMessage({ role, content, spec, isStreaming, widgetTitle }: ChatMessageProps) {
  const { startFlyAnimation } = useWidgetHub();
  const specContainerRef = useRef<HTMLDivElement>(null);

  const handleAddToHub = useCallback(() => {
    if (!spec || !specContainerRef.current) return;
    const rect = specContainerRef.current.getBoundingClientRect();
    const collections = extractCollections(spec);
    const title = widgetTitle || "Widget";
    startFlyAnimation(rect, { title, spec, collections });
  }, [spec, widgetTitle, startFlyAnimation]);

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] shadow-sm">
          <p className="text-sm leading-relaxed">{content}</p>
        </div>
      </div>
    );
  }

  const hasElements = spec && Object.keys(spec.elements || {}).length > 0;

  return (
    <div className="flex flex-col gap-3 max-w-full">
      {content && (
        <div className="bg-secondary/80 border border-border/30 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[80%]">
          <p className="text-sm leading-relaxed">{content}</p>
        </div>
      )}
      {hasElements && (
        <div ref={specContainerRef}>
          <WidgetCard
            spec={spec}
            title={widgetTitle || "Widget"}
            onPin={handleAddToHub}
            loadingOverride={isStreaming}
          />
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/src/components/chat/chat-message.tsx
git commit -m "refactor: chat message uses shared WidgetCard"
```

---

### Task 5: Migrate workshop/workshop-panel.tsx to use shared WidgetCard

**Files:**
- Modify: `dashboard/src/components/workshop/workshop-panel.tsx`

**Step 1: Replace inline widget rendering with shared WidgetCard**

The key changes:
- Remove widget-specific state/hooks (`useSpecData`, `usePinSubWidget`, `showJson`)
- Remove unused icon imports (`Pin`, `Code`, `Eye`)
- Keep all workshop-specific logic (generation, streaming, WORKSHOP_PROMPTS, collections)
- Keep `specContainerRef` for fly animation
- Replace the inline widget `<div>` with `<WidgetCard>`

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Wand2, Lightbulb, AlertCircle } from "lucide-react";
import { useUIStream, type Spec } from "@json-render/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WidgetCard } from "@/components/shared/widget-card";
import { extractCollections } from "@/hooks/use-spec-data";
import { useCollections } from "@/hooks/use-collections";
import { useWidgetHub } from "@/hooks/use-widget-hub";

const WORKSHOP_PROMPTS = [
  "Create a comprehensive executive dashboard that shows the most interesting patterns across all my data. Include key metrics, trends over time, and category breakdowns.",
  "Build a dashboard focused on recent activity and trends. Show what's changed recently, highlight outliers, and surface any interesting correlations between collections.",
  "Design an analytical dashboard that tells a story about my data. Start with the big picture, then drill into the most interesting details. Use creative chart combinations.",
  "Create a dashboard that compares and contrasts data across my collections. Find connections, show distributions, and highlight the most noteworthy data points.",
  "Build a visual summary of everything in my data. Focus on making it beautiful and insightful — use stat cards for key numbers, charts for trends, and tables for recent items.",
];

export function WorkshopPanel() {
  const { collections } = useCollections();
  const { startFlyAnimation } = useWidgetHub();
  const [generatedSpec, setGeneratedSpec] = useState<Spec | null>(null);
  const [hasAutoGenerated, setHasAutoGenerated] = useState(false);
  const specContainerRef = useRef<HTMLDivElement>(null);

  const { spec, isStreaming, error, send, clear } = useUIStream({
    api: "/api/generate",
    onError: (err) => console.error("Workshop generation error:", err),
  });

  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && spec) {
      setGeneratedSpec(spec);
      clear();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, spec, clear]);

  const generate = useCallback(async () => {
    setGeneratedSpec(null);
    const prompt = WORKSHOP_PROMPTS[Math.floor(Math.random() * WORKSHOP_PROMPTS.length)]!;
    const context: Record<string, unknown> = { mode: "workshop" };
    if (collections.length > 0) {
      context.collections = collections.map((c) => ({
        name: c.name,
        description: c.description,
        fields: c.fields,
      }));
    }
    await send(prompt, context);
  }, [send, collections]);

  useEffect(() => {
    if (!hasAutoGenerated && !isStreaming && collections.length > 0) {
      setHasAutoGenerated(true);
      generate();
    }
  }, [hasAutoGenerated, isStreaming, collections.length, generate]);

  const handleAddToHub = useCallback(() => {
    if (!generatedSpec || !specContainerRef.current) return;
    const rect = specContainerRef.current.getBoundingClientRect();
    const specCollections = extractCollections(generatedSpec);
    startFlyAnimation(rect, { title: "Workshop Dashboard", spec: generatedSpec, collections: specCollections });
  }, [generatedSpec, startFlyAnimation]);

  const hasCollections = collections.length > 0;
  const activeSpec = isStreaming ? spec : generatedSpec;
  const canGenerate = hasCollections && !isStreaming;

  if (!hasCollections) {
    return (
      <div className="flex flex-col h-full bg-dot-grid">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
            <div className="size-12 rounded-2xl bg-muted/50 flex items-center justify-center">
              <AlertCircle className="size-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-sm font-medium text-foreground">Not ready yet</h2>
              <p className="text-sm text-muted-foreground">
                Connect to the database and add some collections first.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-dot-grid">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <Lightbulb className="size-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">
            AI-generated views of your data
          </span>
        </div>
        <div className="flex items-center gap-2">
          {collections.length > 0 && (
            <div className="flex gap-1 mr-1">
              {collections.slice(0, 4).map((c) => (
                <Badge key={c.name} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {c.name}
                </Badge>
              ))}
              {collections.length > 4 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{collections.length - 4}
                </Badge>
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 rounded-lg"
            onClick={generate}
            disabled={!canGenerate}
          >
            <RefreshCw className={`size-3 ${isStreaming ? "animate-spin" : ""}`} />
            {isStreaming ? "Generating..." : "New ideas"}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {isStreaming && !activeSpec && (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
              <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse-glow">
                <Wand2 className="size-6 text-primary" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <p className="text-lg font-medium text-foreground">Crafting your dashboard</p>
                <p className="text-sm text-muted-foreground">Analyzing collections and finding insights</p>
              </div>
              <div className="w-full max-w-sm space-y-3 mt-2">
                <div className="h-2 rounded-full animate-shimmer" />
                <div className="h-2 rounded-full animate-shimmer" style={{ animationDelay: "0.3s" }} />
                <div className="h-2 rounded-full animate-shimmer w-2/3" style={{ animationDelay: "0.6s" }} />
              </div>
            </div>
          )}

          {activeSpec && (
            <div ref={specContainerRef} className="animate-fade-in-up">
              <WidgetCard
                spec={activeSpec}
                title="Workshop Dashboard"
                onPin={isStreaming ? undefined : handleAddToHub}
                loadingOverride={isStreaming}
              />
            </div>
          )}

          {error && !isStreaming && (
            <div className="flex flex-col items-center gap-4 py-16">
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                {error.message}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs gap-1.5"
                onClick={generate}
              >
                <RefreshCw className="size-3" />
                Try again
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add dashboard/src/components/workshop/workshop-panel.tsx
git commit -m "refactor: workshop panel uses shared WidgetCard"
```

---

### Task 6: Verify the app builds and clean up

**Step 1: Run the build**

```bash
cd dashboard && npm run build
```

Fix any type errors or import issues that come up.

**Step 2: Manual verification**

Open the app and verify all three contexts:
1. Chat — widget renders with header (title, pin, show code, refresh)
2. Hub — widget renders with header (drag, title, add-to-view, show code, refresh, remove)
3. View — widget renders with header (drag, title, show code, refresh, remove)

**Step 3: Remove unused imports from storage.ts if any**

Check if `Button`, `DashboardRenderer`, or `useSpecData` imports remain unused in modified files.

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: clean up unused imports after widget card unification"
```
