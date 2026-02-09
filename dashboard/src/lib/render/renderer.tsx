"use client";

import { useMemo, useRef, type ReactNode } from "react";
import {
  Renderer,
  type ComponentRenderer,
  type Spec,
  DataProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";

import { registry, Fallback, handlers as createHandlers } from "./registry";
import { EditProvider, type EditPendingState } from "./edit-context";
import { SubWidgetPinProvider, createPinnableRegistry } from "./sub-widget-pin";

type SetData = (
  updater: (prev: Record<string, unknown>) => Record<string, unknown>,
) => void;

interface DashboardRendererProps {
  spec: Spec | null;
  data?: Record<string, unknown>;
  setData?: SetData;
  onDataChange?: (path: string, value: unknown) => void;
  onSaved?: () => void;
  onEditPendingChange?: (state: EditPendingState | null) => void;
  loading?: boolean;
  /** Enable pin-to-hub on individual sub-elements */
  pinnable?: boolean;
  /** Called when a user pins a sub-element */
  onPinElement?: (elementKey: string, rect: DOMRect) => void;
}

const fallback: ComponentRenderer = ({ element }) => (
  <Fallback type={element.type} />
);

const pinnableRegistry = createPinnableRegistry(registry);

export function DashboardRenderer({
  spec,
  data = {},
  setData,
  onDataChange,
  onSaved,
  onEditPendingChange,
  loading,
  pinnable,
  onPinElement,
}: DashboardRendererProps): ReactNode {
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

  if (!spec) return null;

  let content = (
    <Renderer
      spec={spec}
      registry={pinnable && onPinElement ? pinnableRegistry : registry}
      fallback={fallback}
      loading={loading}
    />
  );

  if (pinnable && onPinElement) {
    content = (
      <SubWidgetPinProvider spec={spec} onPin={onPinElement}>
        {content}
      </SubWidgetPinProvider>
    );
  }

  return (
    <DataProvider initialData={data} onDataChange={onDataChange}>
      <VisibilityProvider>
        <ActionProvider handlers={actionHandlers}>
          <EditProvider onSaved={onSaved} onPendingChange={onEditPendingChange}>
            {content}
          </EditProvider>
        </ActionProvider>
      </VisibilityProvider>
    </DataProvider>
  );
}

export type { Spec };
