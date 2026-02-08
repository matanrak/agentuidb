"use client";

import { useSurreal } from "@/hooks/use-surreal";

export function ConnectionStatus() {
  const { status, error } = useSurreal();

  const colors: Record<string, string> = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500 animate-pulse",
    disconnected: "bg-gray-400",
    error: "bg-red-500",
  };

  const labels: Record<string, string> = {
    connected: "Connected",
    connecting: "Connecting...",
    disconnected: "Disconnected",
    error: "Connection Error",
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      <span>{labels[status]}</span>
      {error && <span className="text-xs text-destructive truncate max-w-48">({error})</span>}
    </div>
  );
}
