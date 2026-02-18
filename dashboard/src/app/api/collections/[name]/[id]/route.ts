import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";
import { escIdent } from "@agentuidb/core/query";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  try {
    const { name, id } = await params;
    const data = await req.json();
    const db = getDb();
    const safeName = escIdent(name);
    const existing = db.prepare(
      `SELECT data FROM \`${safeName}\` WHERE id = ?`
    ).get(id) as { data: string } | undefined;
    if (existing) {
      const merged = { ...JSON.parse(existing.data), ...data };
      db.prepare(`UPDATE \`${safeName}\` SET data = ? WHERE id = ?`).run(
        JSON.stringify(merged),
        id,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/collections/[name]/[id]] PATCH", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  try {
    const { name, id } = await params;
    const db = getDb();
    const safeName = escIdent(name);
    db.prepare(`DELETE FROM \`${safeName}\` WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/collections/[name]/[id]] DELETE", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
