"use client";

import { useCallback, useRef, useMemo } from "react";
import {
  Database,
  Search,
  Plus,
  Pencil,
  Trash2,
  List,
  Settings,
  Loader2,
} from "lucide-react";
import { type Spec } from "@json-render/react";
import { WidgetCard } from "@/components/shared/widget-card";
import { extractCollections } from "@/hooks/use-spec-data";
import { useWidgetHub } from "@/hooks/use-widget-hub";
import { type ToolCall } from "@/hooks/use-agent-chat";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  widgetTitle?: string;
}

const TOOL_META: Record<string, { label: string; icon: typeof Database }> = {
  list_collections: { label: "Listing collections", icon: List },
  get_collection_schema: { label: "Reading schema", icon: Settings },
  create_collection: { label: "Creating collection", icon: Plus },
  insert_document: { label: "Inserting document", icon: Plus },
  query_collection: { label: "Querying data", icon: Search },
  update_document: { label: "Updating document", icon: Pencil },
  delete_document: { label: "Deleting document", icon: Trash2 },
  update_collection_schema: { label: "Updating schema", icon: Settings },
};

function ToolCallIndicator({ tc }: { tc: ToolCall }) {
  const meta = TOOL_META[tc.name] ?? { label: tc.name, icon: Database };
  const Icon = meta.icon;
  const isComplete = tc.state !== "calling";
  const isError = tc.state === "error";

  // Build a short summary of the args
  let detail = "";
  if (tc.args.collection) detail = String(tc.args.collection);
  if (tc.args.name) detail = String(tc.args.name);
  if (tc.args.data && typeof tc.args.data === "object") {
    const keys = Object.keys(tc.args.data as Record<string, unknown>);
    if (detail) detail += ` (${keys.length} fields)`;
    else detail = `${keys.length} fields`;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
      {isComplete ? (
        <div className={`size-4 rounded-full flex items-center justify-center ${isError ? "bg-destructive/15" : "bg-primary/15"}`}>
          <Icon className={`size-2.5 ${isError ? "text-destructive" : "text-primary"}`} />
        </div>
      ) : (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />
      )}
      <span className={isError ? "text-destructive/80" : ""}>
        {meta.label}
        {detail && <span className="text-muted-foreground/60 ml-1">{detail}</span>}
      </span>
    </div>
  );
}

/** Try to parse content as a JSON UI spec. Returns the spec if valid, null otherwise. */
function tryParseSpec(content: unknown): Spec | null {
  // Content may arrive as an object if the DB auto-parsed a JSON string
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (obj.root && obj.elements && typeof obj.elements === "object") {
      return obj as unknown as Spec;
    }
    return null;
  }
  if (!content || typeof content !== "string") return null;
  // Find JSON in the content — it might be wrapped in markdown fences
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }
  // Must look like JSON
  if (!jsonStr.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    // Validate it's a spec: must have root and elements
    if (parsed.root && parsed.elements && typeof parsed.elements === "object") {
      return parsed as Spec;
    }
  } catch {}
  return null;
}

export function ChatMessage({
  role,
  content,
  toolCalls,
  isStreaming,
  widgetTitle,
}: ChatMessageProps) {
  const parsedSpec = useMemo(() => (isStreaming ? null : tryParseSpec(content)), [content, isStreaming]);
  const { startFlyAnimation } = useWidgetHub();
  const specContainerRef = useRef<HTMLDivElement>(null);

  const handleAddToHub = useCallback(() => {
    if (!parsedSpec || !specContainerRef.current) return;
    const rect = specContainerRef.current.getBoundingClientRect();
    const collections = extractCollections(parsedSpec);
    const title = widgetTitle || "Widget";
    startFlyAnimation(rect, { title, spec: parsedSpec, collections });
  }, [parsedSpec, widgetTitle, startFlyAnimation]);

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] shadow-sm">
          <p className="text-sm leading-relaxed">{content}</p>
        </div>
      </div>
    );
  }

  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasSpec = parsedSpec && Object.keys(parsedSpec.elements || {}).length > 0;
  // Show text content only if it's not a spec (if it parsed as a spec, we render the spec instead)
  const textContent = hasSpec ? null : content;

  return (
    <div className="flex flex-col gap-3 max-w-full">
      {/* Tool call indicators */}
      {hasToolCalls && (
        <div className="flex flex-col gap-0.5 px-1">
          {toolCalls.map((tc, i) => (
            <ToolCallIndicator key={`${tc.name}-${i}`} tc={tc} />
          ))}
        </div>
      )}

      {/* Text content (non-spec) */}
      {textContent && (
        <div className="bg-secondary/80 border border-border/30 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[80%]">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{textContent}</p>
        </div>
      )}

      {/* Streaming indicator when no content yet */}
      {isStreaming && !content && !hasToolCalls && (
        <div className="flex items-center gap-2 px-1">
          <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />
          <span className="text-xs text-muted-foreground">Thinking...</span>
        </div>
      )}

      {/* Rendered spec */}
      {hasSpec && (
        <div ref={specContainerRef}>
          <WidgetCard
            spec={parsedSpec}
            title={widgetTitle || "Widget"}
            onPin={handleAddToHub}
          />
        </div>
      )}
    </div>
  );
}
