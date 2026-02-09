"use client";

import { Database } from "lucide-react";
import { ConnectionStatus } from "@/components/settings/connection-status";
import { SettingsDialog } from "@/components/settings/settings-dialog";

export function Header() {
  return (
    <header className="border-b border-border/50 px-5 py-3 flex items-center justify-between bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Database className="size-3.5 text-primary" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight text-foreground">AgentUIDB</h1>
        </div>
        <div className="h-4 w-px bg-border" />
        <ConnectionStatus />
      </div>
      <SettingsDialog />
    </header>
  );
}
