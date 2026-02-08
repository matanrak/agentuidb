"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send } from "lucide-react";
import { useUIStream, type Spec } from "@json-render/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { useSettings } from "@/hooks/use-settings";
import { useCollections, type CollectionMeta } from "@/hooks/use-collections";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec?: Spec | null;
}

const SUGGESTIONS = [
  "Show me all my collections",
  "Show me my recent meals as a table",
  "Chart my workout calories this month",
  "Show expenses by category as a bar chart",
];

export function ChatPanel() {
  const { settings } = useSettings();
  const { collections } = useCollections();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const collectionsRef = useRef<CollectionMeta[]>(collections);
  collectionsRef.current = collections;

  const { spec, isStreaming, error, send, clear } = useUIStream({
    api: "/api/generate",
    onError: (err) => console.error("Generation error:", err),
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, spec]);

  // When streaming completes, finalize the assistant message with the spec
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && spec) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id === "streaming") {
          return [...prev.slice(0, -1), { ...last, id: crypto.randomUUID(), spec }];
        }
        return prev;
      });
      clear();
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, spec, clear]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput("");

    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: msg },
      { id: "streaming", role: "assistant", content: "", spec: null },
    ]);

    // Build context with collection schemas
    const context: Record<string, unknown> = {};
    if (collectionsRef.current.length > 0) {
      context.collections = collectionsRef.current.map((c) => ({
        name: c.name,
        description: c.description,
        fields: c.fields,
      }));
    }

    // Send to AI with API key from settings
    await send(msg, {
      ...context,
      apiKey: settings.openrouter_api_key,
      model: settings.openrouter_model,
    });
  }, [input, send, settings.openrouter_api_key, settings.openrouter_model]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const hasApiKey = !!settings.openrouter_api_key;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="flex flex-col gap-4 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <h2 className="text-xl font-semibold text-muted-foreground">What would you like to see?</h2>
              <p className="text-sm text-muted-foreground">Ask me to show your data as tables, charts, or dashboards.</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => handleSend(s)} disabled={!hasApiKey}>
                    {s}
                  </Button>
                ))}
              </div>
              {!hasApiKey && (
                <p className="text-xs text-destructive">Set your OpenRouter API key in Settings to get started.</p>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              spec={msg.id === "streaming" ? spec : msg.spec}
              isStreaming={msg.id === "streaming" && isStreaming}
            />
          ))}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2">
              Error: {error.message}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4 bg-background">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? "Ask about your data..." : "Set your OpenRouter API key in Settings first"}
            disabled={isStreaming || !hasApiKey}
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button
            onClick={() => handleSend()}
            disabled={isStreaming || !input.trim() || !hasApiKey}
            size="icon"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
