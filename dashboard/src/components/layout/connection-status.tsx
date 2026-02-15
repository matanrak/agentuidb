"use client";

import { useDb } from "@/hooks/use-db";

export function ConnectionStatus() {
  const { status, error } = useDb();

  const colors: Record<string, string> = {
    connected: "bg-success",
    connecting: "bg-warning animate-pulse",
    disconnected: "bg-muted-foreground/40",
    error: "bg-destructive",
  };

  const labels: Record<string, string> = {
    connected: "Connected",
    connecting: "Connecting...",
    disconnected: "Disconnected",
    error: "Connection Error",
  };

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`size-1.5 rounded-full ${colors[status]}`} />
      <span>{labels[status]}</span>
      {error && <span className="text-xs text-destructive truncate max-w-48">({error})</span>}
    </div>
  );
}
