"use client";

import type { ReactNode } from "react";
import { DbProvider } from "@/hooks/use-db";
import { WidgetHubProvider } from "@/hooks/use-widget-hub";
import { ViewsProvider } from "@/hooks/use-views";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DbProvider>
      <WidgetHubProvider>
        <ViewsProvider>
          {children}
        </ViewsProvider>
      </WidgetHubProvider>
    </DbProvider>
  );
}
