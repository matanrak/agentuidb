"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  loadChatMessages,
  saveChatMessage,
  updateChatSession,
  type SavedChatMessage,
} from "@/lib/storage";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
  state: "calling" | "done" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

interface UseAgentChatOptions {
  api: string;
  sessionId: string | null;
  body?: Record<string, unknown>;
  onFinish?: () => void;
}

export function useAgentChat({ api, sessionId, body, onFinish }: UseAgentChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const isLoadingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // Load messages from DB when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    // Don't overwrite in-progress messages during streaming
    if (isLoadingRef.current) return;
    loadChatMessages(sessionId)
      .then((saved) => {
        // Re-check in case streaming started while we were loading
        if (isLoadingRef.current) return;
        const restored: ChatMessage[] = saved.map((m) => ({
          id: m.id,
          role: m.role,
          // DB auto-parses JSON strings into objects — coerce back to string
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          toolCalls: m.tool_calls?.length ? (m.tool_calls as ToolCall[]) : undefined,
        }));
        setMessages(restored);
      })
      .catch(console.error);
  }, [sessionId]);

  const persistMessage = useCallback((msg: ChatMessage) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const saved: SavedChatMessage = {
      id: msg.id,
      session_id: sid,
      role: msg.role,
      content: msg.content,
      tool_calls: msg.toolCalls ?? [],
      created_at: new Date().toISOString(),
    };
    saveChatMessage(saved).catch(console.error);
  }, []);

  const append = useCallback(
    async (message: { role: "user"; content: string }, overrideSessionId?: string) => {
      const sid = overrideSessionId ?? sessionIdRef.current;
      if (overrideSessionId) sessionIdRef.current = overrideSessionId;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message.content,
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        toolCalls: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      isLoadingRef.current = true;
      setError(null);

      // Persist user message
      if (sid) {
        persistMessage(userMsg);
        updateChatSession(sid, {}).catch(console.error);
      }

      // Build message history for the API (all previous messages + new user message)
      const historyMessages = [...messagesRef.current, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyMessages, ...body }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let textAccum = "";
        let toolCallsAccum: ToolCall[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7);
            } else if (line.startsWith("data: ") && currentEvent) {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === "tool_call") {
                const tc: ToolCall = {
                  name: data.name,
                  args: data.args,
                  state: "calling",
                };
                toolCallsAccum = [...toolCallsAccum, tc];
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = { ...copy[copy.length - 1] };
                  last.toolCalls = [...toolCallsAccum];
                  copy[copy.length - 1] = last;
                  return copy;
                });
              } else if (currentEvent === "tool_result") {
                const idx = toolCallsAccum.findIndex(
                  (c) => c.name === data.name && c.state === "calling",
                );
                if (idx >= 0) {
                  const isError = data.result?.includes?.('"error"') ?? false;
                  toolCallsAccum = [...toolCallsAccum];
                  toolCallsAccum[idx] = {
                    ...toolCallsAccum[idx],
                    result: data.result,
                    state: isError ? "error" : "done",
                  };
                }
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = { ...copy[copy.length - 1] };
                  last.toolCalls = [...toolCallsAccum];
                  copy[copy.length - 1] = last;
                  return copy;
                });
              } else if (currentEvent === "text") {
                textAccum = data.content;
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = { ...copy[copy.length - 1] };
                  last.content = textAccum;
                  copy[copy.length - 1] = last;
                  return copy;
                });
              } else if (currentEvent === "text_delta") {
                textAccum += data.content;
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = { ...copy[copy.length - 1] };
                  last.content = textAccum;
                  copy[copy.length - 1] = last;
                  return copy;
                });
              } else if (currentEvent === "error") {
                setError(new Error(data.message));
              }

              currentEvent = "";
            }
          }
        }

        // Resolve any tool calls still stuck in "calling" state
        const hasUnresolved = toolCallsAccum.some((c) => c.state === "calling");
        if (hasUnresolved) {
          toolCallsAccum = toolCallsAccum.map((c) =>
            c.state === "calling" ? { ...c, state: "done" as const } : c,
          );
          setMessages((prev) => {
            const copy = [...prev];
            const last = { ...copy[copy.length - 1] };
            last.toolCalls = [...toolCallsAccum];
            copy[copy.length - 1] = last;
            return copy;
          });
        }

        // Persist completed assistant message
        if (sid) {
          persistMessage({
            id: assistantMsg.id,
            role: "assistant",
            content: textAccum,
            toolCalls: toolCallsAccum.length > 0 ? toolCallsAccum : undefined,
          });
        }

        onFinish?.();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
        abortRef.current = null;
      }
    },
    [api, body, onFinish, persistMessage],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, input, setInput, append, isLoading, error, stop };
}
