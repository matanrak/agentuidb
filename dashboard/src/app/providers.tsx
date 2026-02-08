"use client";

import type { ReactNode } from "react";
import { SettingsProvider } from "@/hooks/use-settings";
import { SurrealProvider } from "@/hooks/use-surreal";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <SurrealProvider>
        {children}
      </SurrealProvider>
    </SettingsProvider>
  );
}
