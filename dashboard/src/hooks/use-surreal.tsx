"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Surreal from "surrealdb";
import { connectSurreal, closeSurreal } from "@/lib/surreal";
import { useSettings } from "./use-settings";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface SurrealContextValue {
  db: Surreal | null;
  status: ConnectionStatus;
  error: string | null;
  reconnect: () => void;
}

const SurrealContext = createContext<SurrealContextValue | null>(null);

export function SurrealProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [db, setDb] = useState<Surreal | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const connectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    if (!settings.surrealdb_url) return;

    connectingRef.current = true;
    setStatus("connecting");
    setError(null);

    try {
      const instance = await connectSurreal({
        url: settings.surrealdb_url,
        namespace: settings.surrealdb_namespace,
        database: settings.surrealdb_database,
        username: settings.surrealdb_user,
        password: settings.surrealdb_pass,
      });
      setDb(instance);
      setStatus("connected");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
      setDb(null);
    } finally {
      connectingRef.current = false;
    }
  }, [settings.surrealdb_url, settings.surrealdb_namespace, settings.surrealdb_database, settings.surrealdb_user, settings.surrealdb_pass]);

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
