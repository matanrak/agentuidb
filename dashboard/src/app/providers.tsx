"use client";

import type { ReactNode } from "react";
import { SettingsProvider } from "@/hooks/use-settings";
import { SurrealProvider } from "@/hooks/use-surreal";
import { WidgetHubProvider } from "@/hooks/use-widget-hub";
import { ViewsProvider } from "@/hooks/use-views";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <SurrealProvider>
        <WidgetHubProvider>
          <ViewsProvider>
            {children}
          </ViewsProvider>
        </WidgetHubProvider>
      </SurrealProvider>
    </SettingsProvider>
  );
}
