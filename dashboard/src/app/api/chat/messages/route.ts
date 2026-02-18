import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const db = getDb();
    const rows = db
      .prepare(
        "SELECT id, session_id, role, content, tool_calls, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
      )
      .all(sessionId) as Record<string, unknown>[];

    const parsed = rows.map((row) => ({
      ...row,
      tool_calls:
        typeof row.tool_calls === "string"
          ? JSON.parse(row.tool_calls)
          : row.tool_calls,
    }));

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[/api/chat/messages] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const msg = await req.json();
    const db = getDb();

    db.prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, tool_calls, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content = excluded.content,
         tool_calls = excluded.tool_calls`,
    ).run(
      msg.id,
      msg.session_id,
      msg.role,
      msg.content,
      JSON.stringify(msg.tool_calls),
      msg.created_at,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/messages] PUT", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
