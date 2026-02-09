"use client";

import { Navbar } from "@/components/layout/navbar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { WorkshopPanel } from "@/components/workshop/workshop-panel";
import { WidgetHub } from "@/components/hub/widget-hub";
import { FlyAnimation } from "@/components/hub/fly-animation";
import { ViewPanel } from "@/components/views/view-panel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useViews } from "@/hooks/use-views";

export default function DashboardPage() {
  const { activeTab } = useViews();
  const showSplitPanel = activeTab === "chat" || activeTab === "workshop";

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
              <WidgetHub title="Recent Widgets" />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <>
            {activeTab === "widgets" && <WidgetHub />}
            {!["chat", "workshop", "widgets"].includes(activeTab) && (
              <ViewPanel viewId={activeTab} />
            )}
          </>
        )}
      </main>
      <FlyAnimation />
    </div>
  );
}
