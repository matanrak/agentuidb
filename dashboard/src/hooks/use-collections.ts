"use client";

import { useState, useEffect, useCallback } from "react";
import { useSurreal } from "./use-surreal";

export interface FieldDefinition {
  name: string;
  type: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

export interface CollectionMeta {
  id?: string;
  name: string;
  description: string;
  fields: FieldDefinition[];
  created_at: string;
  updated_at: string;
  sampleDocs?: Record<string, unknown>[];
}

export function useCollections() {
  const { db, status } = useSurreal();
  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!db || status !== "connected") return;
    setLoading(true);
    try {
      const [results] = await db.query<[CollectionMeta[]]>(
        "SELECT * FROM _collections_meta ORDER BY name ASC"
      );
      const metas = results ?? [];

      // Fetch 2 sample docs per collection for agent context
      const withSamples = await Promise.all(
        metas.map(async (col) => {
          try {
            const safeName = col.name.replace(/[^a-zA-Z0-9_]/g, "");
            const [docs] = await db.query<[Record<string, unknown>[]]>(
              `SELECT * FROM \`${safeName}\` ORDER BY created_at DESC LIMIT 2`
            );
            return { ...col, sampleDocs: docs ?? [] };
          } catch {
            return { ...col, sampleDocs: [] };
          }
        })
      );

      setCollections(withSamples);
    } catch (err) {
      console.error("Failed to fetch collections:", err);
    } finally {
      setLoading(false);
    }
  }, [db, status]);

  useEffect(() => {
    if (status === "connected") {
      refresh();
    }
  }, [status, refresh]);

  return { collections, loading, refresh };
}
