import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT id, name, widget_ids, created_at FROM nav_views ORDER BY created_at ASC",
      )
      .all() as Record<string, unknown>[];

    const parsed = rows.map((row) => ({
      id: row.id,
      name: row.name,
      widgetIds:
        typeof row.widget_ids === "string"
          ? JSON.parse(row.widget_ids)
          : row.widget_ids ?? [],
      created_at: row.created_at,
    }));

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[/api/nav-views] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const view = await req.json();
    const db = getDb();

    db.prepare(
      `INSERT INTO nav_views (id, name, widget_ids, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         widget_ids = excluded.widget_ids,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).run(
      view.id,
      view.name,
      JSON.stringify(view.widgetIds),
      view.created_at,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/nav-views] PUT", err);
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
    db.prepare("DELETE FROM nav_views WHERE id = ?").run(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/nav-views] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
