import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        'SELECT id, title, spec, collections, "order", created_at FROM widgets ORDER BY "order" ASC',
      )
      .all() as Record<string, unknown>[];

    const parsed = rows.map((row) => ({
      ...row,
      spec: typeof row.spec === "string" ? JSON.parse(row.spec) : row.spec,
      collections:
        typeof row.collections === "string"
          ? JSON.parse(row.collections)
          : row.collections,
    }));

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[/api/widgets] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const widget = await req.json();
    const db = getDb();

    db.prepare(
      `INSERT INTO widgets (id, title, spec, collections, "order", created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         spec = excluded.spec,
         collections = excluded.collections,
         "order" = excluded."order",
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).run(
      widget.id,
      widget.title,
      JSON.stringify(widget.spec),
      JSON.stringify(widget.collections),
      widget.order,
      widget.created_at,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/widgets] PUT", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { orderedIds } = (await req.json()) as { orderedIds: string[] };

    if (!orderedIds || orderedIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const db = getDb();

    const cases = orderedIds.map((_, i) => `WHEN ? THEN ${i}`).join(" ");
    const placeholders = orderedIds.map(() => "?").join(", ");
    const sql = `UPDATE widgets SET "order" = CASE id ${cases} END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id IN (${placeholders})`;

    db.prepare(sql).run(...orderedIds, ...orderedIds);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/widgets] PATCH", err);
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
    db.prepare("DELETE FROM widgets WHERE id = ?").run(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/widgets] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
