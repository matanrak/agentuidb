"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Surreal from "surrealdb";
import { connectSurreal, closeSurreal } from "@/lib/surreal";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface SurrealContextValue {
  db: Surreal | null;
  status: ConnectionStatus;
  error: string | null;
  reconnect: () => void;
}

const SurrealContext = createContext<SurrealContextValue | null>(null);

const SURREAL_CONFIG = {
  url: process.env.NEXT_PUBLIC_SURREALDB_URL ?? "http://127.0.0.1:8000",
  username: process.env.NEXT_PUBLIC_SURREALDB_USER ?? "root",
  password: process.env.NEXT_PUBLIC_SURREALDB_PASS ?? "root",
  namespace: process.env.NEXT_PUBLIC_SURREALDB_NS ?? "agentuidb",
  database: process.env.NEXT_PUBLIC_SURREALDB_DB ?? "default",
};

export function SurrealProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Surreal | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const connectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    if (!SURREAL_CONFIG.url) return;

    connectingRef.current = true;
    setStatus("connecting");
    setError(null);

    try {
      const instance = await connectSurreal(SURREAL_CONFIG);
      setDb(instance);
      setStatus("connected");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
      setDb(null);
    } finally {
      connectingRef.current = false;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      closeSurreal();
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    closeSurreal().then(connect);
  }, [connect]);

  return (
    <SurrealContext.Provider value={{ db, status, error, reconnect }}>
      {children}
    </SurrealContext.Provider>
  );
}

export function useSurreal(): SurrealContextValue {
  const ctx = useContext(SurrealContext);
  if (!ctx) throw new Error("useSurreal must be used within SurrealProvider");
  return ctx;
}
