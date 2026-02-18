import { dbQuery } from "@/lib/db-client";

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
  const [rows] = await dbQuery<
    [Array<{ id: string; name: string; widget_ids: string[]; created_at: string }>]
  >(
    "SELECT id, name, widget_ids, created_at FROM nav_views ORDER BY created_at ASC"
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    widgetIds: r.widget_ids ?? [],
    created_at: r.created_at,
  }));
}

export async function saveNavView(view: NavView): Promise<void> {
  await dbQuery(
    `INSERT INTO nav_views (id, name, widget_ids, created_at)
     VALUES ($id, $name, $widgetIds, $created_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       widget_ids = excluded.widget_ids,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    {
      id: view.id,
      name: view.name,
      widgetIds: view.widgetIds,
      created_at: view.created_at,
    }
  );
}

export async function deleteNavView(id: string): Promise<void> {
  await dbQuery("DELETE FROM nav_views WHERE id = $id", { id });
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
  const [rows] = await dbQuery<[ChatSession[]]>(
    "SELECT id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC"
  );
  return rows ?? [];
}

export async function createChatSession(session: { id: string; title: string }): Promise<void> {
  await dbQuery(
    `INSERT INTO chat_sessions (id, title) VALUES ($id, $title)`,
    { id: session.id, title: session.title }
  );
}

export async function updateChatSession(id: string, data: { title?: string }): Promise<void> {
  if (data.title !== undefined) {
    await dbQuery(
      `UPDATE chat_sessions SET title = $title, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $id`,
      { id, title: data.title }
    );
  } else {
    await dbQuery(
      `UPDATE chat_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $id`,
      { id }
    );
  }
}

export async function deleteChatSession(id: string): Promise<void> {
  await dbQuery("DELETE FROM chat_messages WHERE session_id = $id", { id });
  await dbQuery("DELETE FROM chat_sessions WHERE id = $id", { id });
}

export async function loadChatMessages(sessionId: string): Promise<SavedChatMessage[]> {
  const [rows] = await dbQuery<[SavedChatMessage[]]>(
    "SELECT id, session_id, role, content, tool_calls, created_at FROM chat_messages WHERE session_id = $sessionId ORDER BY created_at ASC",
    { sessionId }
  );
  return rows ?? [];
}

export async function saveChatMessage(msg: SavedChatMessage): Promise<void> {
  await dbQuery(
    `INSERT INTO chat_messages (id, session_id, role, content, tool_calls, created_at)
     VALUES ($id, $sessionId, $role, $content, $toolCalls, $created_at)
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content,
       tool_calls = excluded.tool_calls`,
    {
      id: msg.id,
      sessionId: msg.session_id,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.tool_calls,
      created_at: msg.created_at,
    }
  );
}
