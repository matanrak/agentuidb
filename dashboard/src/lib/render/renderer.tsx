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
}

const fallback: ComponentRenderer = ({ element }) => (
  <Fallback type={element.type} />
);

export function DashboardRenderer({
  spec,
  data = {},
  setData,
  onDataChange,
  onSaved,
  onEditPendingChange,
  loading,
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

  return (
    <DataProvider initialData={data} onDataChange={onDataChange}>
      <VisibilityProvider>
        <ActionProvider handlers={actionHandlers}>
          <EditProvider onSaved={onSaved} onPendingChange={onEditPendingChange}>
            <Renderer
              spec={spec}
              registry={registry}
              fallback={fallback}
              loading={loading}
            />
          </EditProvider>
        </ActionProvider>
      </VisibilityProvider>
    </DataProvider>
  );
}

export type { Spec };
