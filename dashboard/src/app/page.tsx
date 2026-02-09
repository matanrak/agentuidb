import { Header } from "@/components/layout/header";
import { ChatPanel } from "@/components/chat/chat-panel";
import { WidgetHub } from "@/components/hub/widget-hub";
import { FlyAnimation } from "@/components/hub/fly-animation";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

export default function DashboardPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={50} minSize={30}>
            <ChatPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={20}>
            <WidgetHub />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      <FlyAnimation />
    </div>
  );
}
