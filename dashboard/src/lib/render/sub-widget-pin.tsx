"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { type Spec, type ComponentRegistry, type ComponentRenderProps } from "@json-render/react";
import { Pin } from "lucide-react";
import { extractCollections } from "@/hooks/use-spec-data";
import { useWidgetHub } from "@/hooks/use-widget-hub";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Structural elements are "transparent" — we look through them to find pinable children. */
const STRUCTURAL_TYPES = new Set(["Stack", "Grid", "Tabs", "TabContent"]);

/** Trivial elements that aren't meaningful as standalone widgets. */
const TRIVIAL_TYPES = new Set([
  "Heading", "Text", "Badge", "Separator", "Divider",
  "Skeleton", "Avatar", "Progress", "Alert", "Button",
]);

// ---------------------------------------------------------------------------
// Sub-spec extraction
// ---------------------------------------------------------------------------

/** Collect an element + all its descendants into a flat map. */
function collectElements(spec: Spec, key: string): Spec["elements"] {
  const elements: Spec["elements"] = {};
  function walk(k: string) {
    const el = spec.elements[k];
    if (!el) return;
    elements[k] = el;
    for (const childKey of el.children ?? []) walk(childKey);
  }
  walk(key);
  return elements;
}

/**
 * Extract a sub-widget spec from a parent spec.
 *
 * Single-child Card optimisation: if the element is a Card with exactly 1
 * child, the Card wrapper is stripped (the WidgetCard in the hub already
 * provides card chrome) and the titles are merged.
 */
export function extractSubWidget(
  spec: Spec,
  elementKey: string,
): { subSpec: Spec; title: string } {
  const rootEl = spec.elements[elementKey];
  if (!rootEl) return { subSpec: { root: elementKey, elements: {} }, title: "Widget" };

  // Single-child Card → unwrap, merge titles, strip inner title
  if (rootEl.type === "Card" && rootEl.children?.length === 1) {
    const childKey = rootEl.children[0]!;
    const childEl = spec.elements[childKey];
    if (childEl) {
      const cardTitle = titleOf(rootEl);
      const childTitle = titleOf(childEl);

      // Combined title: prefer card title, append child title if different
      const title =
        cardTitle && childTitle && cardTitle !== childTitle
          ? `${cardTitle} — ${childTitle}`
          : cardTitle || childTitle || rootEl.type;

      // Collect descendants from the child (skip the Card)
      const elements = collectElements(spec, childKey);

      // Strip the child's own title prop to avoid duplication with widget header
      if (cardTitle && childTitle) {
        elements[childKey] = {
          ...childEl,
          props: { ...(childEl.props as Record<string, unknown>), title: undefined },
        };
      }

      return { subSpec: { root: childKey, elements }, title };
    }
  }

  // Default: keep as-is
  const elements = collectElements(spec, elementKey);
  return { subSpec: { root: elementKey, elements }, title: titleOf(rootEl) || rootEl.type };
}

// ---------------------------------------------------------------------------
// Title helpers
// ---------------------------------------------------------------------------

function titleOf(element: { type: string; props?: Record<string, unknown> }): string | undefined {
  const p = element.props as Record<string, unknown> | undefined;
  if (typeof p?.title === "string" && p.title) return p.title;
  if (typeof p?.text === "string" && p.text) return p.text;
  return undefined;
}

/** Public helper — always returns a string. */
export function getElementTitle(element: { type: string; props?: Record<string, unknown> }): string {
  return titleOf(element) ?? element.type;
}

// ---------------------------------------------------------------------------
// Pinable key resolution
// ---------------------------------------------------------------------------

/**
 * Walk from the root through structural containers and collect all
 * "meaningful" element keys that should show a pin button.
 * Stops recursing once a meaningful element is found (so its internal
 * children don't also get pins — avoids nested hover conflicts).
 */
export function collectPinableKeys(spec: Spec): Set<string> {
  const pinable = new Set<string>();

  function traverse(key: string) {
    const el = spec.elements[key];
    if (!el) return;

    if (STRUCTURAL_TYPES.has(el.type)) {
      // Transparent structural container — recurse into children
      for (const childKey of el.children ?? []) traverse(childKey);
    } else if (!TRIVIAL_TYPES.has(el.type)) {
      // Meaningful content element — mark pinable, don't recurse deeper
      pinable.add(key);
    }
  }

  const root = spec.elements[spec.root];
  for (const childKey of root?.children ?? []) traverse(childKey);
  return pinable;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SubWidgetPinCtx {
  elementKeyMap: WeakMap<object, string>;
  pinableKeys: Set<string>;
  onPin: (elementKey: string, rect: DOMRect) => void;
}

const Ctx = createContext<SubWidgetPinCtx | null>(null);

export function SubWidgetPinProvider({
  spec,
  onPin,
  children,
}: {
  spec: Spec;
  onPin: (elementKey: string, rect: DOMRect) => void;
  children: ReactNode;
}) {
  const elementKeyMap = useMemo(() => {
    const map = new WeakMap<object, string>();
    for (const [key, el] of Object.entries(spec.elements)) {
      map.set(el, key);
    }
    return map;
  }, [spec]);

  const pinableKeys = useMemo(() => collectPinableKeys(spec), [spec]);

  return (
    <Ctx.Provider value={{ elementKeyMap, pinableKeys, onPin }}>
      {children}
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Shared hook
// ---------------------------------------------------------------------------

/** Returns a stable callback for pinning sub-elements via the fly animation. */
export function usePinSubWidget(spec: Spec | null) {
  const { startFlyAnimation } = useWidgetHub();

  return useCallback(
    (elementKey: string, rect: DOMRect) => {
      if (!spec) return;
      const { subSpec, title } = extractSubWidget(spec, elementKey);
      const collections = extractCollections(subSpec);
      startFlyAnimation(rect, { title, spec: subSpec, collections });
    },
    [spec, startFlyAnimation],
  );
}

// ---------------------------------------------------------------------------
// Pinnable registry wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap every component in the registry so that pinable elements
 * show a pin-to-hub button on hover.
 */
export function createPinnableRegistry(baseRegistry: ComponentRegistry): ComponentRegistry {
  const pinnable: ComponentRegistry = {};

  for (const [type, Component] of Object.entries(baseRegistry)) {
    const Wrapped = function PinnableComponent(props: ComponentRenderProps) {
      const ctx = useContext(Ctx);
      const wrapperRef = useRef<HTMLDivElement>(null);

      if (!ctx) return <Component {...props} />;

      const elementKey = ctx.elementKeyMap.get(props.element);
      if (!elementKey || !ctx.pinableKeys.has(elementKey)) {
        return <Component {...props} />;
      }

      const handlePin = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (wrapperRef.current) {
          ctx.onPin(elementKey, wrapperRef.current.getBoundingClientRect());
        }
      };

      return (
        <div ref={wrapperRef} className="group/subpin relative">
          <Component {...props} />
          <button
            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-background/80 border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/50 backdrop-blur-sm shadow-sm z-10 opacity-0 group-hover/subpin:opacity-100 transition-opacity"
            onClick={handlePin}
            title="Save as widget"
            aria-label="Save as widget"
          >
            <Pin className="size-3" />
          </button>
        </div>
      );
    };
    Wrapped.displayName = `Pinnable(${type})`;
    pinnable[type] = Wrapped;
  }

  return pinnable;
}
