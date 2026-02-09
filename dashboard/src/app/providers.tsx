"use client";

import type { ReactNode } from "react";
import { SettingsProvider } from "@/hooks/use-settings";
import { SurrealProvider } from "@/hooks/use-surreal";
import { WidgetHubProvider } from "@/hooks/use-widget-hub";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <SurrealProvider>
        <WidgetHubProvider>
          {children}
        </WidgetHubProvider>
      </SurrealProvider>
    </SettingsProvider>
  );
}
