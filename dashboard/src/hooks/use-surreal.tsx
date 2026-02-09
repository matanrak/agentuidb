"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { dbPing } from "@/lib/surreal-client";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface SurrealContextValue {
  status: ConnectionStatus;
  error: string | null;
  reconnect: () => void;
}

const SurrealContext = createContext<SurrealContextValue | null>(null);

export function SurrealProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);

    try {
      const ok = await dbPing();
      if (ok) {
        setStatus("connected");
      } else {
        setStatus("error");
        setError("Could not reach SurrealDB");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    connect();
  }, [connect]);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  return (
    <SurrealContext.Provider value={{ status, error, reconnect }}>
      {children}
    </SurrealContext.Provider>
  );
}

export function useSurreal(): SurrealContextValue {
  const ctx = useContext(SurrealContext);
  if (!ctx) throw new Error("useSurreal must be used within SurrealProvider");
  return ctx;
}
