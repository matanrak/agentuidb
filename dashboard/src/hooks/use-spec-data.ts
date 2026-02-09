"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { type Spec } from "@json-render/react";
import { dbQuery } from "@/lib/surreal-client";
import { useSurreal } from "./use-surreal";
import { extractTransforms, extractTransformCollections, applyTransforms } from "@/lib/render/transforms";

async function queryCollection(collection: string, limit = 50): Promise<Record<string, unknown>[]> {
  const esc = (name: string) => name.replace(/`/g, "``");
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const query = `SELECT * FROM \`${esc(collection)}\` ORDER BY created_at DESC LIMIT ${safeLimit}`;
  const [results] = await dbQuery<[Record<string, unknown>[]]>(query);
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
  // Also include collections referenced by transforms
  const transforms = extractTransforms(spec);
  for (const col of extractTransformCollections(transforms)) {
    collections.add(col);
  }
  // Remove transform output names — those are derived datasets, not real collections
  const transformOutputs = new Set(transforms.map((t) => t.output));
  for (const output of transformOutputs) {
    collections.delete(output);
  }
  return Array.from(collections);
}

export function useSpecData(spec: Spec | null, options?: { autoLoad?: boolean }) {
  const { status } = useSurreal();
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

    // Apply data transforms to produce derived datasets
    const transforms = extractTransforms(specToLoad);
    const enrichedData = transforms.length > 0 ? applyTransforms(newData, transforms) : newData;

    setData(enrichedData);
    setDataVersion((v) => v + 1);
    setIsLoading(false);
  }, []);

  // Reset when DB disconnects so we retry on reconnect
  useEffect(() => {
    if (status !== "connected") {
      loadedRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (status !== "connected") return;
    if (!spec || !autoLoad) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadData(spec);
  }, [spec, autoLoad, loadData, status]);

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
