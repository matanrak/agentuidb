import { Header } from "@/components/layout/header";
import { ChatPanel } from "@/components/chat/chat-panel";
import { WidgetHub } from "@/components/hub/widget-hub";
import { FlyAnimation } from "@/components/hub/fly-animation";

export default function DashboardPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <main className="flex-1 overflow-hidden flex">
        <div className="w-1/2 border-r border-border/50 h-full">
          <ChatPanel />
        </div>
        <div className="w-1/2 h-full">
          <WidgetHub />
        </div>
      </main>
      <FlyAnimation />
    </div>
  );
}
