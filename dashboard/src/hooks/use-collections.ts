"use client";

import { useState, useEffect, useCallback } from "react";
import type { FieldDefinition, CollectionMeta } from "@agentuidb/core/types";
import { escIdent } from "@agentuidb/core/query";
import { useSurreal } from "./use-surreal";
import { dbQuery } from "@/lib/surreal-client";

export type { FieldDefinition, CollectionMeta };

export type CollectionMetaWithSamples = CollectionMeta & {
  sampleDocs?: Record<string, unknown>[];
};

export function useCollections() {
  const { status } = useSurreal();
  const [collections, setCollections] = useState<CollectionMetaWithSamples[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (status !== "connected") return;
    setLoading(true);
    try {
      const [results] = await dbQuery<[CollectionMeta[]]>(
        "SELECT * FROM _collections_meta ORDER BY name ASC"
      );
      const metas = results ?? [];

      // Fetch 2 sample docs per collection for agent context
      const withSamples = await Promise.all(
        metas.map(async (col) => {
          try {
            const [docs] = await dbQuery<[Record<string, unknown>[]]>(
              `SELECT * FROM \`${escIdent(col.name)}\` ORDER BY created_at DESC LIMIT 2`
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
  }, [status]);

  useEffect(() => {
    if (status === "connected") {
      refresh();
    }
  }, [status, refresh]);

  return { collections, loading, refresh };
}
