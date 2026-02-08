"use client";

import { ConnectionStatus } from "@/components/settings/connection-status";
import { SettingsDialog } from "@/components/settings/settings-dialog";

export function Header() {
  return (
    <header className="border-b px-4 py-2 flex items-center justify-between bg-background">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">AgentUIDB</h1>
        <ConnectionStatus />
      </div>
      <SettingsDialog />
    </header>
  );
}
