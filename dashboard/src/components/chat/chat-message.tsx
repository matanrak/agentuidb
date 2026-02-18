"use client";

import { useCallback, useRef } from "react";
import { type Spec } from "@json-render/react";
import { WidgetCard } from "@/components/shared/widget-card";
import { extractCollections } from "@/hooks/use-spec-data";
import { useWidgetHub } from "@/hooks/use-widget-hub";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  spec?: Spec | null;
  isStreaming?: boolean;
  widgetTitle?: string;
}

export function ChatMessage({ role, content, spec, isStreaming, widgetTitle }: ChatMessageProps) {
  const { startFlyAnimation } = useWidgetHub();
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
        <div ref={specContainerRef}>
          <WidgetCard
            spec={spec}
            title={widgetTitle || "Widget"}
            onPin={handleAddToHub}
            loadingOverride={isStreaming}
          />
        </div>
      )}
    </div>
  );
}
