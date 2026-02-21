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
import { DashboardRenderer } from "@/lib/render/renderer";
import { extractCollections } from "@/hooks/use-spec-data";
import { useWidgetHub } from "@/hooks/use-widget-hub";
import { type ToolCall } from "@/hooks/use-agent-chat";
import Markdown from "react-markdown";

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

/** Try to extract a JSON UI spec from content. Returns { spec, text } where text is the non-spec portion. */
function extractSpecFromContent(content: unknown): { spec: Spec | null; text: string | null } {
  // Content may arrive as an object if the DB auto-parsed a JSON string
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (obj.root && obj.elements && typeof obj.elements === "object") {
      return { spec: obj as unknown as Spec, text: null };
    }
    return { spec: null, text: null };
  }
  if (!content || typeof content !== "string") return { spec: null, text: null };

  const raw = content.trim();

  // Try markdown fences first
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (parsed.root && parsed.elements && typeof parsed.elements === "object") {
        const text = raw.replace(fenceMatch[0], "").trim() || null;
        return { spec: parsed as Spec, text };
      }
    } catch {}
  }

  // Try pure JSON (starts with {)
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.root && parsed.elements && typeof parsed.elements === "object") {
        return { spec: parsed as Spec, text: null };
      }
    } catch {}
  }

  // Find JSON embedded in text — look for {"root": or { "root":
  const jsonStart = raw.search(/\{\s*"root"\s*:/);
  if (jsonStart === -1) return { spec: null, text: raw };

  // Find the matching closing brace by counting braces
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }
  if (jsonEnd === -1) return { spec: null, text: raw };

  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd));
    if (parsed.root && parsed.elements && typeof parsed.elements === "object") {
      const before = raw.slice(0, jsonStart).trim();
      const after = raw.slice(jsonEnd).trim();
      const text = [before, after].filter(Boolean).join("\n\n") || null;
      return { spec: parsed as Spec, text };
    }
  } catch {}

  return { spec: null, text: raw };
}

export function ChatMessage({
  role,
  content,
  toolCalls,
  isStreaming,
  widgetTitle,
}: ChatMessageProps) {
  const { spec: parsedSpec, text: surroundingText } = useMemo(
    () => (isStreaming ? { spec: null, text: content } : extractSpecFromContent(content)),
    [content, isStreaming],
  );
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
  // Show surrounding text (before/after spec) or full content if no spec found
  const textContent = hasSpec ? surroundingText : content;

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
          <div className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:whitespace-pre-wrap">
            <Markdown>{textContent}</Markdown>
          </div>
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
          <DashboardRenderer
            spec={parsedSpec}
            title={widgetTitle || "Widget"}
            onPin={handleAddToHub}
          />
        </div>
      )}
    </div>
  );
}
