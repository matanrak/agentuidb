"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Code, Eye } from "lucide-react";
import { type Spec } from "@json-render/react";
import { Button } from "@/components/ui/button";
import { DashboardRenderer } from "@/lib/render/renderer";
import { getSurreal } from "@/lib/surreal";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  spec?: Spec | null;
  isStreaming?: boolean;
}

/**
 * Query SurrealDB for a collection.
 */
async function queryCollection(collection: string, limit = 50): Promise<Record<string, unknown>[]> {
  const db = getSurreal();
  if (!db) {
    console.warn("queryCollection: SurrealDB not connected");
    return [];
  }

  const query = `SELECT * FROM type::table($table) ORDER BY created_at DESC LIMIT ${limit}`;
  const [results] = await db.query<[Record<string, unknown>[]]>(query, { table: collection });
  return results ?? [];
}

/**
 * Scan spec elements for dataPath props and extract unique collection names.
 */
function extractCollections(spec: Spec): string[] {
  const collections = new Set<string>();
  const elements = spec.elements || {};

  for (const el of Object.values(elements)) {
    const element = el as { type: string; props?: Record<string, unknown> };
    if (element.props?.dataPath) {
      // dataPath is like "meals" or "meals.data" — take the first segment as collection name
      const collection = (element.props.dataPath as string).split(".")[0];
      if (collection) collections.add(collection);
    }
  }

  return Array.from(collections);
}

export function ChatMessage({ role, content, spec, isStreaming }: ChatMessageProps) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [dataVersion, setDataVersion] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const loadedRef = useRef(false);

  // Auto-detect collections from spec and fetch data
  const loadData = useCallback(async (specToLoad: Spec) => {
    const collections = extractCollections(specToLoad);
    if (collections.length === 0) return;

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
  }, []);

  // Load data when spec finishes streaming
  useEffect(() => {
    if (!spec || isStreaming) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadData(spec);
  }, [spec, isStreaming, loadData]);

  const handleRefresh = useCallback(async () => {
    if (!spec) return;
    setIsRefreshing(true);
    await loadData(spec);
    setIsRefreshing(false);
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

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2 max-w-[80%]">
          <p className="text-sm">{content}</p>
        </div>
      </div>
    );
  }

  const hasElements = spec && Object.keys(spec.elements || {}).length > 0;

  return (
    <div className="flex flex-col gap-3 max-w-full">
      {content && (
        <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2 max-w-[80%]">
          <p className="text-sm">{content}</p>
        </div>
      )}
      {hasElements && (
        <div className="border rounded-lg p-4 bg-card">
          <div className="flex justify-end gap-1 mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowJson((v) => !v)}
              title={showJson ? "Show rendered UI" : "Show JSON spec"}
            >
              {showJson ? <Eye className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {showJson ? (
            <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-[500px]">
              {JSON.stringify(spec, null, 2)}
            </pre>
          ) : (
            <DashboardRenderer
              key={dataVersion}
              spec={spec}
              data={data}
              setData={setData}
              onDataChange={handleDataChange}
              loading={isStreaming}
            />
          )}
        </div>
      )}
    </div>
  );
}
