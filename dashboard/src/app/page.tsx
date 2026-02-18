"use client";

import { Navbar } from "@/components/layout/navbar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { WorkshopPanel } from "@/components/workshop/workshop-panel";
import { WidgetHub } from "@/components/hub/widget-hub";
import { FlyAnimation } from "@/components/hub/fly-animation";
import { ViewPanel } from "@/components/views/view-panel";
import { DatabasePanel } from "@/components/database/database-panel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useViews } from "@/hooks/use-views";

export default function DashboardPage() {
  const { activeTab } = useViews();
  const showSplitPanel = activeTab === "chat" || activeTab === "workshop";
  const showFullPanel = activeTab === "widgets" || activeTab === "database";

  return (
    <div className="h-screen flex flex-col">
      <div className="accent-stripe" />
      <Navbar />
      <main className="flex-1 overflow-hidden">
        {showSplitPanel ? (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={50} minSize={30}>
              {activeTab === "chat" && <ChatPanel />}
              {activeTab === "workshop" && <WorkshopPanel />}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={20}>
              <WidgetHub title="Widget Inventory" />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <>
            {activeTab === "widgets" && <WidgetHub />}
            {activeTab === "database" && <DatabasePanel />}
            {!showSplitPanel && !showFullPanel && (
              <ViewPanel viewId={activeTab} />
            )}
          </>
        )}
      </main>
      <FlyAnimation />
    </div>
  );
}
