"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import type {
  Spec,
  ComponentRegistry,
  ComponentRenderProps,
} from "@json-render/react";
import { extractTransforms } from "./transforms";

// ---------------------------------------------------------------------------
// Spec + element key context
// ---------------------------------------------------------------------------

interface ElementCtxValue {
  spec: Spec;
  keyMap: WeakMap<object, string>;
  /** Fallback: type+props fingerprint → key (for when json-render clones elements) */
  fingerprints: Map<string, string>;
}

const ElementCtx = createContext<ElementCtxValue | null>(null);

function fingerprint(el: { type: string; props?: Record<string, unknown> }): string {
  return `${el.type}::${JSON.stringify(el.props ?? {})}`;
}

/**
 * Provides spec + element key resolution for wrapped registries.
 */
export function ElementKeyProvider({
  spec,
  children,
}: {
  spec: Spec;
  children: ReactNode;
}) {
  const value = useMemo<ElementCtxValue>(() => {
    const keyMap = new WeakMap<object, string>();
    const fingerprints = new Map<string, string>();
    for (const [key, el] of Object.entries(spec.elements)) {
      keyMap.set(el, key);
      const fp = fingerprint(el);
      // Only store if unique — ambiguous fingerprints are useless
      if (fingerprints.has(fp)) {
        fingerprints.delete(fp);
      } else {
        fingerprints.set(fp, key);
      }
    }
    return { spec, keyMap, fingerprints };
  }, [spec]);

  return (
    <ElementCtx.Provider value={value}>{children}</ElementCtx.Provider>
  );
}

/** Look up the spec key for an element object. */
export function useElementKey(element: object): string | undefined {
  const ctx = useContext(ElementCtx);
  if (!ctx) return undefined;
  // Fast path: exact object reference
  const key = ctx.keyMap.get(element);
  if (key) return key;
  // Fallback: match by type + props fingerprint
  const el = element as { type?: string; props?: Record<string, unknown> };
  if (el.type) return ctx.fingerprints.get(fingerprint(el as { type: string; props?: Record<string, unknown> }));
  return undefined;
}

/** Access the full spec from within a wrapped component. */
export function useSpec(): Spec | null {
  const ctx = useContext(ElementCtx);
  return ctx?.spec ?? null;
}

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

function titleOf(element: { type: string; props?: Record<string, unknown> }): string | undefined {
  const p = element.props as Record<string, unknown> | undefined;
  if (typeof p?.title === "string" && p.title) return p.title;
  if (typeof p?.text === "string" && p.text) return p.text;
  return undefined;
}

/**
 * Collect dataPaths referenced by elements, then include any _transforms
 * whose output chain leads to those dataPaths.
 */
function includeTransforms(
  spec: Spec,
  elements: Spec["elements"],
): Spec["elements"] {
  const transforms = extractTransforms(spec);
  if (transforms.length === 0) return elements;

  // Collect dataPaths used by the sub-spec elements
  const usedPaths = new Set<string>();
  for (const el of Object.values(elements)) {
    const dp = (el.props as Record<string, unknown> | undefined)?.dataPath;
    if (typeof dp === "string") usedPaths.add(dp.split(".")[0]!);
  }

  // Walk transform chains: if output is used, its source may also be needed
  const outputMap = new Map(transforms.map((t) => [t.output, t]));
  const needed = new Set<string>();
  for (const path of usedPaths) {
    let cur = path;
    while (outputMap.has(cur)) {
      needed.add(cur);
      cur = outputMap.get(cur)!.source;
    }
  }

  if (needed.size === 0) return elements;

  // Build a _transforms element with only the relevant transforms
  const relevantTransforms = transforms.filter((t) => needed.has(t.output));
  return {
    ...elements,
    _transforms: {
      type: "_Transforms",
      props: { transforms: relevantTransforms },
      children: [],
    },
  };
}

/**
 * Extract a sub-widget spec from a parent spec.
 * Single-child Card: unwrap the Card (WidgetCard already provides chrome).
 * Includes relevant _transforms so derived dataPaths keep working.
 */
export function extractSubWidget(
  spec: Spec,
  elementKey: string,
): { subSpec: Spec; title: string } {
  const rootEl = spec.elements[elementKey];
  if (!rootEl) return { subSpec: { root: elementKey, elements: {} }, title: "Widget" };

  // Single-child Card → unwrap
  if (rootEl.type === "Card" && rootEl.children?.length === 1) {
    const childKey = rootEl.children[0]!;
    const childEl = spec.elements[childKey];
    if (childEl) {
      const cardTitle = titleOf(rootEl);
      const childTitle = titleOf(childEl);
      const title =
        cardTitle && childTitle && cardTitle !== childTitle
          ? `${cardTitle} — ${childTitle}`
          : cardTitle || childTitle || rootEl.type;
      const elements = collectElements(spec, childKey);
      if (cardTitle && childTitle) {
        elements[childKey] = {
          ...childEl,
          props: { ...(childEl.props as Record<string, unknown>), title: undefined },
        };
      }
      return { subSpec: { root: childKey, elements: includeTransforms(spec, elements) }, title };
    }
  }

  const elements = collectElements(spec, elementKey);
  return { subSpec: { root: elementKey, elements: includeTransforms(spec, elements) }, title: titleOf(rootEl) || rootEl.type };
}

// ---------------------------------------------------------------------------
// Wrapper props & registry wrapping
// ---------------------------------------------------------------------------

export interface ElementWrapperProps {
  /** The element type (e.g. "Card", "BarChart") */
  type: string;
  /** The element key in the spec (e.g. "trend-card") — requires ElementKeyProvider */
  elementKey?: string;
  /** The full element object */
  element: ComponentRenderProps["element"];
  /** The rendered component */
  children: ReactNode;
}

/**
 * Wrap every component in a registry with a wrapper component.
 */
export function wrapRegistry(
  base: ComponentRegistry,
  Wrapper: ComponentType<ElementWrapperProps>,
): ComponentRegistry {
  return Object.fromEntries(
    Object.entries(base).map(([type, Component]) => [
      type,
      function WrappedElement(renderProps: ComponentRenderProps) {
        const elementKey = useElementKey(renderProps.element);
        return (
          <Wrapper
            type={type}
            elementKey={elementKey}
            element={renderProps.element}
          >
            <Component {...renderProps} />
          </Wrapper>
        );
      },
    ]),
  );
}
