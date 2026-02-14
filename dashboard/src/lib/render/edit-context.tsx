"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { dbMerge, dbDelete } from "@/lib/db-client";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface EditContextValue {
  trackEdit: (
    recordId: string,
    field: string,
    newValue: unknown,
    originalValue: unknown,
  ) => void;
  trackDelete: (recordId: string) => void;
  trackRestore: (recordId: string) => void;
  isDeleted: (recordId: string) => boolean;
  isEdited: (recordId: string, field: string) => boolean;
  getEditedValue: (recordId: string, field: string) => unknown | undefined;
  pendingCount: number;
}

const EditContext = createContext<EditContextValue | null>(null);

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

export function useEdit(): EditContextValue {
  const ctx = useContext(EditContext);
  if (!ctx) throw new Error("useEdit must be used within an EditProvider");
  return ctx;
}

// -----------------------------------------------------------------------------
// Smart type coercion: preserve numbers so int/float fields stay correct
// -----------------------------------------------------------------------------

function coerceValue(newValue: unknown, originalValue: unknown): unknown {
  if (typeof newValue !== "string") return newValue;
  if (typeof originalValue === "number") {
    const n = Number(newValue);
    if (!isNaN(n)) return n;
  }
  return newValue;
}

// -----------------------------------------------------------------------------
// Provider + SaveBar
// -----------------------------------------------------------------------------

export interface EditPendingState {
  count: number;
  saving: boolean;
  save: () => Promise<void>;
}

interface EditProviderProps {
  children: ReactNode;
  onSaved?: () => void;
  onPendingChange?: (state: EditPendingState | null) => void;
}

export function EditProvider({ children, onSaved, onPendingChange }: EditProviderProps) {
  const [pendingEdits, setPendingEdits] = useState<
    Map<string, Record<string, unknown>>
  >(() => new Map());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(
    () => new Set(),
  );
  const [isSaving, setIsSaving] = useState(false);

  const trackEdit = useCallback(
    (
      recordId: string,
      field: string,
      newValue: unknown,
      originalValue: unknown,
    ) => {
      const coerced = coerceValue(newValue, originalValue);
      setPendingEdits((prev) => {
        const next = new Map(prev);
        const existing = next.get(recordId) ?? {};
        if (String(coerced) === String(originalValue)) {
          const { [field]: _, ...rest } = existing;
          if (Object.keys(rest).length === 0) {
            next.delete(recordId);
          } else {
            next.set(recordId, rest);
          }
        } else {
          next.set(recordId, { ...existing, [field]: coerced });
        }
        return next;
      });
    },
    [],
  );

  const trackDelete = useCallback((recordId: string) => {
    setPendingDeletes((prev) => new Set(prev).add(recordId));
  }, []);

  const trackRestore = useCallback((recordId: string) => {
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.delete(recordId);
      return next;
    });
  }, []);

  const isDeleted = useCallback(
    (recordId: string) => pendingDeletes.has(recordId),
    [pendingDeletes],
  );

  const isEdited = useCallback(
    (recordId: string, field: string) => {
      const fields = pendingEdits.get(recordId);
      return fields ? field in fields : false;
    },
    [pendingEdits],
  );

  const getEditedValue = useCallback(
    (recordId: string, field: string): unknown | undefined => {
      return pendingEdits.get(recordId)?.[field];
    },
    [pendingEdits],
  );

  const pendingCount = pendingEdits.size + pendingDeletes.size;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      for (const [recordId, fields] of pendingEdits) {
        if (!pendingDeletes.has(recordId)) {
          await dbMerge(recordId, fields);
        }
      }
      for (const recordId of pendingDeletes) {
        await dbDelete(recordId);
      }
      setPendingEdits(new Map());
      setPendingDeletes(new Set());
      onSaved?.();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setIsSaving(false);
    }
  }, [pendingEdits, pendingDeletes, onSaved]);

  // Report pending state to parent for toolbar rendering
  useEffect(() => {
    if (!onPendingChange) return;
    onPendingChange(pendingCount > 0 ? { count: pendingCount, saving: isSaving, save: handleSave } : null);
  }, [pendingCount, isSaving, handleSave, onPendingChange]);

  const value: EditContextValue = {
    trackEdit,
    trackDelete,
    trackRestore,
    isDeleted,
    isEdited,
    getEditedValue,
    pendingCount,
  };

  return (
    <EditContext.Provider value={value}>
      {children}
    </EditContext.Provider>
  );
}
