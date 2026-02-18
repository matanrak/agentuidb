"use client";

import { useState, useEffect, useCallback } from "react";
import type { FieldDefinition, CollectionMeta } from "@agentuidb/core/types";
import { useDb } from "./use-db";

export type { FieldDefinition, CollectionMeta };

export type CollectionMetaWithSamples = CollectionMeta & {
  sampleDocs?: Record<string, unknown>[];
};

export function useCollections() {
  const { status } = useDb();
  const [collections, setCollections] = useState<CollectionMetaWithSamples[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (status !== "connected") return;
    setLoading(true);
    try {
      const res = await fetch("/api/collections?samples=2");
      if (!res.ok) throw new Error("Failed to fetch collections");
      const data = await res.json();
      setCollections(data);
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
