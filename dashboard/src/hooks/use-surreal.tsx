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

  // Keep React state in sync with SDK auto-reconnect events
  useEffect(() => {
    if (!db) return;

    const onConnected = () => {
      setStatus("connected");
      setError(null);
    };
    const onReconnecting = () => {
      setStatus("connecting");
    };
    const onDisconnected = () => {
      setStatus("disconnected");
    };
    const onError = (err: Error) => {
      setStatus("error");
      setError(err.message);
    };

    db.emitter.subscribe("connected", onConnected);
    db.emitter.subscribe("reconnecting", onReconnecting);
    db.emitter.subscribe("disconnected", onDisconnected);
    db.emitter.subscribe("error", onError);

    return () => {
      db.emitter.unSubscribe("connected", onConnected);
      db.emitter.unSubscribe("reconnecting", onReconnecting);
      db.emitter.unSubscribe("disconnected", onDisconnected);
      db.emitter.unSubscribe("error", onError);
    };
  }, [db]);

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
