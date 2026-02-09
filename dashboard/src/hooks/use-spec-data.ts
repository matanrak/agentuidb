"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { type Spec } from "@json-render/react";
import { getSurreal } from "@/lib/surreal";

async function queryCollection(collection: string, limit = 50): Promise<Record<string, unknown>[]> {
  const db = getSurreal();
  if (!db) {
    console.warn("queryCollection: SurrealDB not connected");
    return [];
  }
  // Use backtick-escaped table name instead of type::table() to avoid SurrealDB v2 IAM issues
  const safeName = collection.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeName) return [];
  const query = `SELECT * FROM \`${safeName}\` ORDER BY created_at DESC LIMIT ${limit}`;
  const [results] = await db.query<[Record<string, unknown>[]]>(query);
  return results ?? [];
}

export function extractCollections(spec: Spec): string[] {
  const collections = new Set<string>();
  const elements = spec.elements || {};
  for (const el of Object.values(elements)) {
    const element = el as { type: string; props?: Record<string, unknown> };
    if (element.props?.dataPath) {
      const collection = (element.props.dataPath as string).split(".")[0];
      if (collection) collections.add(collection);
    }
  }
  return Array.from(collections);
}

export function useSpecData(spec: Spec | null, options?: { autoLoad?: boolean }) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [dataVersion, setDataVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const loadedRef = useRef(false);
  const autoLoad = options?.autoLoad ?? true;

  const loadData = useCallback(async (specToLoad: Spec) => {
    const collections = extractCollections(specToLoad);
    if (collections.length === 0) return;

    setIsLoading(true);
    const newData: Record<string, unknown> = {};
    for (const collection of collections) {
      try {
        const results = await queryCollection(collection);
        newData[collection] = results;
      } catch (err) {
        console.error(`Failed to query ${collection}:`, err);
      }
    }
    setData(newData);
    setDataVersion((v) => v + 1);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!spec || !autoLoad) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadData(spec);
  }, [spec, autoLoad, loadData]);

  const refresh = useCallback(async () => {
    if (!spec) return;
    await loadData(spec);
  }, [spec, loadData]);

  const handleDataChange = useCallback((path: string, value: unknown) => {
    setData((prev) => {
      const next = { ...prev };
      const parts = path.split("/");
      let current: Record<string, unknown> = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        if (!(part in current) || typeof current[part] !== "object") {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]!] = value;
      return next;
    });
    setDataVersion((v) => v + 1);
  }, []);

  return { data, setData, dataVersion, isLoading, refresh, handleDataChange };
}
