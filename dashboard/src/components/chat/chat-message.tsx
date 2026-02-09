"use client";

import { useState, useCallback, useRef } from "react";
import { RefreshCw, Code, Eye, Pin, Check } from "lucide-react";
import { type Spec } from "@json-render/react";
import { Button } from "@/components/ui/button";
import { DashboardRenderer } from "@/lib/render/renderer";
import { type EditPendingState } from "@/lib/render/edit-context";
import { useSpecData, extractCollections } from "@/hooks/use-spec-data";
import { useWidgetHub } from "@/hooks/use-widget-hub";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  spec?: Spec | null;
  isStreaming?: boolean;
  widgetTitle?: string;
}

export function ChatMessage({ role, content, spec, isStreaming, widgetTitle }: ChatMessageProps) {
  const { data, setData, dataVersion, isLoading, refresh, handleDataChange } = useSpecData(
    spec && !isStreaming ? spec : null,
  );
  const { startFlyAnimation } = useWidgetHub();
  const [showJson, setShowJson] = useState(false);
  const [editPending, setEditPending] = useState<EditPendingState | null>(null);
  const specContainerRef = useRef<HTMLDivElement>(null);

  const handleAddToHub = useCallback(() => {
    if (!spec || !specContainerRef.current) return;
    const rect = specContainerRef.current.getBoundingClientRect();
    const collections = extractCollections(spec);
    const title = widgetTitle || "Widget";
    startFlyAnimation(rect, { title, spec, collections });
  }, [spec, widgetTitle, startFlyAnimation]);

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] shadow-sm">
          <p className="text-sm leading-relaxed">{content}</p>
        </div>
      </div>
    );
  }

  const hasElements = spec && Object.keys(spec.elements || {}).length > 0;

  return (
    <div className="flex flex-col gap-3 max-w-full">
      {content && (
        <div className="bg-secondary/80 border border-border/30 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[80%]">
          <p className="text-sm leading-relaxed">{content}</p>
        </div>
      )}
      {hasElements && (
        <div ref={specContainerRef} className="border border-border/50 rounded-xl p-4 bg-card/80 backdrop-blur-sm">
          <div className="flex justify-end gap-1 mb-3">
            {editPending && (
              <Button
                size="sm"
                className="h-7 rounded-lg bg-success hover:bg-success/90 text-white text-xs px-2.5"
                onClick={() => editPending.save()}
                disabled={editPending.saving}
                title="Save changes to database"
              >
                <Check className="size-3.5 mr-1" />
                {editPending.saving ? "Saving..." : `Save (${editPending.count})`}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg text-muted-foreground hover:text-primary"
              onClick={handleAddToHub}
              title="Pin to Widget Hub"
            >
              <Pin className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setShowJson((v) => !v)}
              title={showJson ? "Show rendered UI" : "Show JSON spec"}
            >
              {showJson ? <Eye className="size-3.5" /> : <Code className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => refresh()}
              disabled={isLoading}
              title="Refresh data"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {showJson ? (
            <pre className="text-xs font-mono bg-background/50 border border-border/30 rounded-lg p-3 overflow-auto max-h-[500px] text-muted-foreground">
              {JSON.stringify(spec, null, 2)}
            </pre>
          ) : (
            <DashboardRenderer
              key={dataVersion}
              spec={spec}
              data={data}
              setData={setData}
              onDataChange={handleDataChange}
              onSaved={refresh}
              onEditPendingChange={setEditPending}
              loading={isStreaming}
            />
          )}
        </div>
      )}
    </div>
  );
}
