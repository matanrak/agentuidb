import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

export async function POST(req: Request) {
  const body = await req.json();
  const { action } = body;

  try {
    if (action === "ping") {
      const db = getDb();
      db.prepare("SELECT 1").get();
      return NextResponse.json({ result: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[/api/db]", action, err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
