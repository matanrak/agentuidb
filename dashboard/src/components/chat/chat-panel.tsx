"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Sparkles, Table, BarChart3, LayoutDashboard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { useCollections, type CollectionMetaWithSamples } from "@/hooks/use-collections";
import { useAgentChat } from "@/hooks/use-agent-chat";
import {
  loadChatSessions,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  type ChatSession,
} from "@/lib/storage";

const SUGGESTIONS = [
  { text: "Show me all my collections", icon: LayoutDashboard },
  { text: "Show me my recent meals as a table", icon: Table },
  { text: "Chart my workout calories this month", icon: BarChart3 },
  { text: "Show expenses by category as a bar chart", icon: BarChart3 },
];

export function ChatPanel() {
  const { collections, refresh: refreshCollections } = useCollections();
  const scrollRef = useRef<HTMLDivElement>(null);
  const collectionsRef = useRef<CollectionMetaWithSamples[]>(collections);
  collectionsRef.current = collections;

  // Session management
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    loadChatSessions()
      .then((loaded) => {
        setSessions(loaded);
        // Resume most recent session if one exists
        if (loaded.length > 0) {
          setActiveSessionId(loaded[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const { messages, input, setInput, append, isLoading, error } = useAgentChat({
    api: "/api/chat",
    sessionId: activeSessionId,
    body: {
      context: {
        collections: collectionsRef.current.map((c) => ({
          name: c.name,
          description: c.description,
          fields: c.fields,
          sampleDocs: c.sampleDocs,
        })),
      },
    },
    onFinish: () => {
      refreshCollections();
    },
  });

  // Auto-scroll on new messages or streaming updates
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-slot='scroll-area-viewport']");
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  const ensureSession = useCallback(async (firstMessage: string): Promise<string> => {
    if (activeSessionId) return activeSessionId;
    const id = crypto.randomUUID();
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "..." : "");
    await createChatSession({ id, title });
    const session: ChatSession = {
      id,
      title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(id);
    return id;
  }, [activeSessionId]);

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg) return;
      setInput("");
      const sid = await ensureSession(msg);
      append({ role: "user", content: msg }, sid);
    },
    [input, setInput, append, ensureSession],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setShowSessions(false);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setShowSessions(false);
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    await deleteChatSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  }, [activeSessionId]);

  const hasCollections = collections.length > 0;
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex flex-col h-full bg-dot-grid">
      {/* Session header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30">
        <button
          onClick={() => setShowSessions((v) => !v)}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate max-w-[200px]"
        >
          {activeSession?.title ?? "New Chat"}
        </button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={handleNewChat}
          title="New chat"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {/* Session list dropdown */}
      {showSessions && sessions.length > 0 && (
        <div className="border-b border-border/30 bg-card/80 backdrop-blur-sm max-h-48 overflow-y-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors ${
                s.id === activeSessionId ? "bg-muted/30 text-primary" : "text-foreground"
              }`}
            >
              <button
                className="flex-1 text-left truncate"
                onClick={() => handleSelectSession(s.id)}
              >
                {s.title}
              </button>
              <button
                className="text-muted-foreground/50 hover:text-destructive text-xs shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSession(s.id);
                }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

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
                  Ask me to visualize your data, or tell me about your day and I&apos;ll log it.
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
                    disabled={isLoading}
                    className={`flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/50 px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-card hover:border-border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group animate-fade-in-up stagger-${i + 1}`}
                  >
                    <s.icon className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const idx = messages.indexOf(msg);
            const precedingUserMsg =
              msg.role === "assistant"
                ? messages
                    .slice(0, idx)
                    .reverse()
                    .find((m) => m.role === "user")
                : undefined;
            const isLastMessage = idx === messages.length - 1;
            return (
              <div key={msg.id} className="animate-fade-in-up">
                <ChatMessage
                  role={msg.role}
                  content={msg.content}
                  toolCalls={msg.toolCalls}
                  isStreaming={isLoading && isLastMessage && msg.role === "assistant"}
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
              placeholder="Ask about your data or tell me something to log..."
              disabled={isLoading}
              className="min-h-[36px] max-h-32 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground/50"
              rows={1}
            />
            <Button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
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
