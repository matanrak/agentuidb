import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const viewId = searchParams.get("viewId");
    if (!viewId) {
      return NextResponse.json({ error: "viewId required" }, { status: 400 });
    }
    const db = getDb();
    const row = db.prepare(
      "SELECT layouts FROM view_layouts WHERE view_id = ? LIMIT 1"
    ).get(viewId) as { layouts: string } | undefined;
    if (!row) {
      return NextResponse.json(null);
    }
    const layouts = typeof row.layouts === "string" ? JSON.parse(row.layouts) : row.layouts;
    return NextResponse.json(layouts);
  } catch (err) {
    console.error("[/api/view-layouts] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const { viewId, layouts } = await req.json();
    if (!viewId || layouts === undefined) {
      return NextResponse.json({ error: "viewId and layouts required" }, { status: 400 });
    }
    const db = getDb();
    db.prepare(
      `INSERT INTO view_layouts (view_id, layouts) VALUES (?, ?)
       ON CONFLICT(view_id) DO UPDATE SET layouts = excluded.layouts, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    ).run(viewId, JSON.stringify(layouts));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/view-layouts] PUT", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const viewId = searchParams.get("viewId");
    if (!viewId) {
      return NextResponse.json({ error: "viewId required" }, { status: 400 });
    }
    const db = getDb();
    db.prepare("DELETE FROM view_layouts WHERE view_id = ?").run(viewId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/view-layouts] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
