"use client";

import { useSurreal } from "@/hooks/use-surreal";

export function ConnectionStatus() {
  const { status, error } = useSurreal();

  const colors: Record<string, string> = {
    connected: "bg-emerald-400",
    connecting: "bg-amber-400 animate-pulse",
    disconnected: "bg-muted-foreground/40",
    error: "bg-red-400",
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
