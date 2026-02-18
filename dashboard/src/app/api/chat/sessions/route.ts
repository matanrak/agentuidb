import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC",
      )
      .all();

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[/api/chat/sessions] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const { id, title } = await req.json();
    const db = getDb();

    db.prepare(
      "INSERT INTO chat_sessions (id, title) VALUES (?, ?)",
    ).run(id, title);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/sessions] POST", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, title } = await req.json();
    const db = getDb();

    if (title !== undefined) {
      db.prepare(
        "UPDATE chat_sessions SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      ).run(title, id);
    } else {
      db.prepare(
        "UPDATE chat_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      ).run(id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/sessions] PATCH", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const db = getDb();
    db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/sessions] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
