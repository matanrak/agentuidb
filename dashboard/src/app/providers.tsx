"use client";

import type { ReactNode } from "react";
import { SurrealProvider } from "@/hooks/use-surreal";
import { WidgetHubProvider } from "@/hooks/use-widget-hub";
import { ViewsProvider } from "@/hooks/use-views";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SurrealProvider>
      <WidgetHubProvider>
        <ViewsProvider>
          {children}
        </ViewsProvider>
      </WidgetHubProvider>
    </SurrealProvider>
  );
}
