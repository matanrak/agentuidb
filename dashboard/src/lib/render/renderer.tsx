"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Renderer,
  type ComponentRenderer,
  type Spec,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";
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
import { cn } from "@/lib/utils";
import { registry, Fallback, handlers as createHandlers } from "./registry";
import { EditProvider, type EditPendingState } from "./edit-context";
import {
  ElementKeyProvider,
  wrapRegistry,
  useSpec,
  extractSubWidget,
  type ElementWrapperProps,
} from "./element-wrapper";
import { extractCollections, useSpecData } from "@/hooks/use-spec-data";
import { useWidgetHub } from "@/hooks/use-widget-hub";
import { useViews } from "@/hooks/use-views";

// ---------------------------------------------------------------------------
// AddToViewMenu (extracted so useViews() only runs when rendered)
// ---------------------------------------------------------------------------

function AddToViewMenu({
  widgetId,
  rawSpec,
  spec,
}: {
  widgetId: string;
  rawSpec: unknown;
  spec: Spec;
}) {
  const { views, addView, addWidgetToView, removeWidgetFromView } = useViews();

  return (
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
  );
}

// ---------------------------------------------------------------------------
// ElementWrapper — wraps every rendered element
//
// Card → pin button on hover
// other → debug outlines (temporary)
// ---------------------------------------------------------------------------

function ElementWrapper({ type, elementKey, element, children }: ElementWrapperProps) {
  const spec = useSpec();
  const { startFlyAnimation } = useWidgetHub();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showCode, setShowCode] = useState(false);

  const isRoot = !!(spec && elementKey && elementKey === spec.root);
  const isCard = type === "Card" && !isRoot;

  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!spec || !elementKey || !wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const { subSpec, title } = extractSubWidget(spec, elementKey);
      const collections = extractCollections(subSpec);
      startFlyAnimation(rect, { title, spec: subSpec, collections });
    },
    [spec, elementKey, startFlyAnimation],
  );

  const subSpecJson = useMemo(() => {
    if (!showCode || !spec || !elementKey) return null;
    const { subSpec } = extractSubWidget(spec, elementKey);
    return JSON.stringify(subSpec, null, 2);
  }, [showCode, spec, elementKey]);

  // Root element: transparent wrapper (header is rendered by DashboardRenderer)
  if (isRoot) {
    return <>{children}</>;
  }

  // Non-card elements: transparent wrapper, no chrome
  if (!isCard) {
    return <>{children}</>;
  }

  // Card elements: pin + code toggle on hover
  return (
    <div
      ref={wrapperRef}
      data-element-type={type}
      data-element-key={elementKey}
      className="relative group/element"
    >
      {showCode ? (
        <pre className="text-xs font-mono bg-background/50 border border-border/30 rounded-lg p-3 overflow-auto max-h-[300px] text-muted-foreground m-1">
          {subSpecJson}
        </pre>
      ) : (
        children
      )}
      <div className="absolute top-1.5 right-1.5 mt-4 flex gap-1 z-10 opacity-0 group-hover/element:opacity-100 transition-opacity">
        <button
          className="p-1 rounded-md bg-background/80 border border-border/50 text-muted-foreground hover:text-foreground hover:border-border backdrop-blur-sm shadow-sm"
          onClick={(e) => { e.stopPropagation(); setShowCode((v) => !v); }}
          title={showCode ? "Show rendered UI" : "Show JSON spec"}
          aria-label={showCode ? "Show rendered UI" : "Show JSON spec"}
        >
          {showCode ? <Eye className="size-3" /> : <Code className="size-3" />}
        </button>
        <button
          className="p-1 rounded-md bg-background/80 border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/50 backdrop-blur-sm shadow-sm"
          onClick={handlePin}
          title="Pin as widget"
          aria-label="Pin as widget"
        >
          <Pin className="size-3" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardRenderer — the single entry point for rendering a widget
// ---------------------------------------------------------------------------

type SetData = (
  updater: (prev: Record<string, unknown>) => Record<string, unknown>,
) => void;

export interface DashboardRendererProps {
  spec: Spec | null;
  title?: string;
  widgetId?: string;
  rawSpec?: unknown;
  onPin?: () => void;
  onRemove?: () => void;
  addToView?: boolean;
  loadingOverride?: boolean;
  className?: string;
  contentClassName?: string;
  // Drag support
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  showDragHandle?: boolean;
  isDragging?: boolean;
  style?: React.CSSProperties;
  // Advanced: override data flow (used by eval page)
  data?: Record<string, unknown>;
  setData?: SetData;
  onDataChange?: (path: string, value: unknown) => void;
  onSaved?: () => void;
  onEditPendingChange?: (state: EditPendingState | null) => void;
  loading?: boolean;
  elementWrapper?: React.ComponentType<ElementWrapperProps>;
}

const fallback: ComponentRenderer = ({ element }) => (
  <Fallback type={element.type} />
);

export const DashboardRenderer = forwardRef<HTMLDivElement, DashboardRendererProps>(
  function DashboardRenderer(
    {
      spec,
      title = "Widget",
      widgetId,
      rawSpec,
      onPin,
      onRemove,
      addToView,
      loadingOverride,
      className,
      contentClassName,
      dragAttributes,
      dragListeners,
      showDragHandle,
      isDragging,
      style,
      // Advanced overrides
      data: externalData,
      setData: externalSetData,
      onDataChange: externalOnDataChange,
      onSaved: externalOnSaved,
      onEditPendingChange: externalOnEditPendingChange,
      loading: externalLoading,
      elementWrapper,
    },
    ref,
  ) {
    // ---- Data fetching ----
    const skipFetch = loadingOverride || !!externalData;
    const {
      data: fetchedData,
      setData: fetchedSetData,
      dataVersion,
      isLoading: fetchIsLoading,
      refresh,
      handleDataChange: fetchHandleDataChange,
    } = useSpecData(skipFetch ? null : spec);

    const data = externalData ?? fetchedData;
    const setData = externalSetData ?? fetchedSetData;
    const handleDataChange = externalOnDataChange ?? fetchHandleDataChange;
    const isLoading = externalLoading ?? loadingOverride ?? fetchIsLoading;

    // ---- Edit pending state ----
    const [editPending, setEditPending] = useState<EditPendingState | null>(null);
    const handleEditPendingChange = externalOnEditPendingChange ?? setEditPending;

    // ---- Show code toggle ----
    const [showJson, setShowJson] = useState(false);

    // ---- Remove with 2-second confirm ----
    const [confirmRemove, setConfirmRemove] = useState(false);
    const removeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(removeTimerRef.current), []);
    const handleRemove = useCallback(() => {
      if (!onRemove) return;
      if (confirmRemove) {
        onRemove();
      } else {
        setConfirmRemove(true);
        removeTimerRef.current = setTimeout(() => setConfirmRemove(false), 2000);
      }
    }, [confirmRemove, onRemove]);

    // ---- Action handlers ----
    const dataRef = useRef(data);
    const setDataRef = useRef(setData);
    dataRef.current = data;
    setDataRef.current = setData;

    const actionHandlers = useMemo(
      () =>
        createHandlers(
          () => setDataRef.current,
          () => dataRef.current,
        ),
      [],
    );

    // ---- Registry ----
    const Wrapper = elementWrapper ?? ElementWrapper;
    const activeRegistry = useMemo(
      () => wrapRegistry(registry, Wrapper),
      [Wrapper],
    );

    const onSaved = externalOnSaved ?? refresh;

    if (!spec) return null;

    const hasDrag = !!(dragAttributes && dragListeners);
    const showHandle = showDragHandle || hasDrag;

    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          "border border-border/50 rounded-xl bg-card/80 backdrop-blur-sm overflow-hidden widget-card-hover transition-shadow",
          isDragging && "opacity-50 shadow-lg shadow-primary/10",
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          {showHandle && (
            <button
              className="drag-handle text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing"
              {...(hasDrag ? { ...dragAttributes, ...dragListeners } : {})}
            >
              <GripVertical className="size-3.5" />
            </button>
          )}

          <span className="text-xs font-medium text-foreground/80 truncate flex-1">
            {title}
          </span>

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

          {addToView && widgetId && (
            <AddToViewMenu widgetId={widgetId} rawSpec={rawSpec} spec={spec} />
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setShowJson((v) => !v)}
            title={showJson ? "Show rendered UI" : "Show JSON spec"}
          >
            {showJson ? <Eye className="size-3" /> : <Code className="size-3" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => refresh()}
            disabled={fetchIsLoading}
            title="Refresh data"
          >
            <RefreshCw className={`size-3 ${fetchIsLoading ? "animate-spin" : ""}`} />
          </Button>

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
            <ElementKeyProvider spec={spec}>
              <StateProvider initialState={data} onStateChange={handleDataChange}>
                <VisibilityProvider>
                  <ActionProvider handlers={actionHandlers}>
                    <EditProvider onSaved={onSaved} onPendingChange={handleEditPendingChange}>
                      <Renderer
                        key={dataVersion}
                        spec={spec}
                        registry={activeRegistry}
                        fallback={fallback}
                        loading={isLoading}
                      />
                    </EditProvider>
                  </ActionProvider>
                </VisibilityProvider>
              </StateProvider>
            </ElementKeyProvider>
          )}
        </div>
      </div>
    );
  },
);

export type { Spec };
