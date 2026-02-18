"use client";

import { useState, useCallback, useRef } from "react";

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
  body?: Record<string, unknown>;
  onFinish?: () => void;
}

export function useAgentChat({ api, body, onFinish }: UseAgentChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const append = useCallback(
    async (message: { role: "user"; content: string }) => {
      const userMsg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        role: "user",
        content: message.content,
      };

      const assistantMsg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        role: "assistant",
        content: "",
        toolCalls: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      setError(null);

      // Build message history for the API (all previous messages + new user message)
      const historyMessages = [...messages, userMsg].map((m) => ({
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
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = { ...copy[copy.length - 1] };
                  last.toolCalls = [...(last.toolCalls ?? []), tc];
                  copy[copy.length - 1] = last;
                  return copy;
                });
              } else if (currentEvent === "tool_result") {
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = { ...copy[copy.length - 1] };
                  const calls = [...(last.toolCalls ?? [])];
                  const idx = calls.findIndex(
                    (c) => c.name === data.name && c.state === "calling",
                  );
                  if (idx >= 0) {
                    const isError = data.result?.includes?.('"error"') ?? false;
                    calls[idx] = {
                      ...calls[idx],
                      result: data.result,
                      state: isError ? "error" : "done",
                    };
                  }
                  last.toolCalls = calls;
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

        onFinish?.();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [api, body, messages, onFinish],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, input, setInput, append, isLoading, error, stop };
}
