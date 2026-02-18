"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";


type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface DbContextValue {
  status: ConnectionStatus;
  error: string | null;
  reconnect: () => void;
}

const DbContext = createContext<DbContextValue | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);

    try {
      const ok = await fetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      }).then((r) => r.ok).catch(() => false);
      if (ok) {
        setStatus("connected");
      } else {
        setStatus("error");
        setError("Could not reach database");
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
    <DbContext.Provider value={{ status, error, reconnect }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error("useDb must be used within DbProvider");
  return ctx;
}
