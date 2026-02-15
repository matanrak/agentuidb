"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Sparkles, Table, BarChart3, LayoutDashboard } from "lucide-react";
import { useUIStream, type Spec } from "@json-render/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { useCollections, type CollectionMetaWithSamples } from "@/hooks/use-collections";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec?: Spec | null;
}

const SUGGESTIONS = [
  { text: "Show me all my collections", icon: LayoutDashboard },
  { text: "Show me my recent meals as a table", icon: Table },
  { text: "Chart my workout calories this month", icon: BarChart3 },
  { text: "Show expenses by category as a bar chart", icon: BarChart3 },
];

export function ChatPanel() {
  const { collections } = useCollections();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const collectionsRef = useRef<CollectionMetaWithSamples[]>(collections);
  collectionsRef.current = collections;

  const { spec, isStreaming, error, send, clear } = useUIStream({
    api: "/api/generate",
    onError: (err) => console.error("Generation error:", err),
  });

  // Auto-scroll on new messages
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-slot='scroll-area-viewport']");
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, spec]);

  // When streaming completes, finalize the assistant message with the spec
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && spec) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id === "streaming") {
          return [...prev.slice(0, -1), { ...last, id: Math.random().toString(36).slice(2), spec }];
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
      { id: Math.random().toString(36).slice(2), role: "user", content: msg },
      { id: "streaming", role: "assistant", content: "", spec: null },
    ]);

    // Build context with collection schemas
    const context: Record<string, unknown> = {};
    if (collectionsRef.current.length > 0) {
      context.collections = collectionsRef.current.map((c) => ({
        name: c.name,
        description: c.description,
        fields: c.fields,
        sampleDocs: c.sampleDocs,
      }));
    }

    await send(msg, context);
  }, [input, send]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const hasCollections = collections.length > 0;

  return (
    <div className="flex flex-col h-full bg-dot-grid">
      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="flex flex-col gap-5 max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="flex flex-col items-center gap-3">
                <div className="size-14 rounded-2xl bg-primary/12 flex items-center justify-center mb-2 glow-amber">
                  <Sparkles className="size-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">What would you like to see?</h2>
                <p className="text-sm text-muted-foreground max-w-sm text-center">
                  Ask me to visualize your data as tables, charts, or interactive dashboards.
                </p>
              </div>

              {hasCollections && (
                <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
                  {collections.map((c) => (
                    <Badge key={c.name} variant="secondary" className="text-xs">
                      {c.name}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 max-w-lg w-full">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.text}
                    onClick={() => handleSend(s.text)}
                    disabled={isStreaming}
                    className={`flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/50 px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-card hover:border-border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group animate-fade-in-up stagger-${i + 1}`}
                  >
                    <s.icon className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const precedingUserMsg = msg.role === "assistant"
              ? messages.slice(0, i).reverse().find((m) => m.role === "user")
              : undefined;
            return (
              <div key={msg.id} className="animate-fade-in-up">
                <ChatMessage
                  role={msg.role}
                  content={msg.content}
                  spec={msg.id === "streaming" ? spec : msg.spec}
                  isStreaming={msg.id === "streaming" && isStreaming}
                  widgetTitle={precedingUserMsg?.content}
                />
              </div>
            );
          })}

          {error && (
            <div className="animate-fade-in-up text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
              {error.message}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 pb-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-2 transition-all focus-within:border-primary/50 focus-within:bg-card/80 focus-within:shadow-[0_0_0_3px_oklch(0.57_0.21_46/8%)]">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your data..."
              disabled={isStreaming}
              className="min-h-[36px] max-h-32 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground/50"
              rows={1}
            />
            <Button
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              size="icon"
              className="shrink-0 size-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
