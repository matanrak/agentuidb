import { Header } from "@/components/layout/header";
import { ChatPanel } from "@/components/chat/chat-panel";

export default function DashboardPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <main className="flex-1 overflow-hidden">
        <ChatPanel />
      </main>
    </div>
  );
}
