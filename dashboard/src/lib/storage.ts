export interface SavedWidget {
  id: string;
  title: string;
  spec: unknown;
  collections: string[];
  order: number;
  created_at: string;
}

export async function loadWidgets(): Promise<SavedWidget[]> {
  const res = await fetch("/api/widgets");
  if (!res.ok) throw new Error("Failed to load widgets");
  return res.json();
}

export async function saveWidget(widget: SavedWidget): Promise<void> {
  const res = await fetch("/api/widgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(widget),
  });
  if (!res.ok) throw new Error("Failed to save widget");
}

export async function deleteWidget(id: string): Promise<void> {
  const res = await fetch(`/api/widgets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete widget");
}

export async function saveWidgetOrder(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const res = await fetch("/api/widgets", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) throw new Error("Failed to save widget order");
}

// Nav Views

export interface WidgetLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface NavView {
  id: string;
  name: string;
  widgetIds: string[];
  layouts?: Record<string, WidgetLayoutItem[]>;
  created_at: string;
}

export async function loadNavViews(): Promise<NavView[]> {
  const res = await fetch("/api/nav-views");
  if (!res.ok) throw new Error("Failed to load nav views");
  return res.json();
}

export async function saveNavView(view: NavView): Promise<void> {
  const res = await fetch("/api/nav-views", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(view),
  });
  if (!res.ok) throw new Error("Failed to save nav view");
}

export async function deleteNavView(id: string): Promise<void> {
  const res = await fetch(`/api/nav-views?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete nav view");
}

// Chat Sessions & Messages

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SavedChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls: Array<{ name: string; args: Record<string, unknown>; result?: string; state: string }>;
  created_at: string;
}

export async function loadChatSessions(): Promise<ChatSession[]> {
  const res = await fetch("/api/chat/sessions");
  if (!res.ok) throw new Error("Failed to load chat sessions");
  return res.json();
}

export async function createChatSession(session: { id: string; title: string }): Promise<void> {
  const res = await fetch("/api/chat/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  if (!res.ok) throw new Error("Failed to create chat session");
}

export async function updateChatSession(id: string, data: { title?: string }): Promise<void> {
  const res = await fetch("/api/chat/sessions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...data }),
  });
  if (!res.ok) throw new Error("Failed to update chat session");
}

export async function deleteChatSession(id: string): Promise<void> {
  const res = await fetch(`/api/chat/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete chat session");
}

export async function loadChatMessages(sessionId: string): Promise<SavedChatMessage[]> {
  const res = await fetch(`/api/chat/messages?sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error("Failed to load chat messages");
  return res.json();
}

export async function saveChatMessage(msg: SavedChatMessage): Promise<void> {
  const res = await fetch("/api/chat/messages", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error("Failed to save chat message");
}
