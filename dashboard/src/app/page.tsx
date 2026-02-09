"use client";

import { Header } from "@/components/layout/header";
import { ChatPanel } from "@/components/chat/chat-panel";
import { WorkshopPanel } from "@/components/workshop/workshop-panel";
import { WidgetHub } from "@/components/hub/widget-hub";
import { FlyAnimation } from "@/components/hub/fly-animation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { MessageSquare, Wand2 } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={50} minSize={30}>
            <Tabs defaultValue="chat" className="h-full flex flex-col">
              <div className="px-4 pt-3 pb-0">
                <TabsList className="w-full">
                  <TabsTrigger value="chat" className="flex-1 gap-1.5">
                    <MessageSquare className="size-3.5" />
                    Chat
                  </TabsTrigger>
                  <TabsTrigger value="workshop" className="flex-1 gap-1.5">
                    <Wand2 className="size-3.5" />
                    Workshop
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="chat" className="flex-1 overflow-hidden">
                <ChatPanel />
              </TabsContent>
              <TabsContent value="workshop" className="flex-1 overflow-hidden">
                <WorkshopPanel />
              </TabsContent>
            </Tabs>
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
