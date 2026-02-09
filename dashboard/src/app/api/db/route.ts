import { NextResponse } from "next/server";
import { StringRecordId } from "surrealdb";
import { getServerSurreal, resetServerSurreal } from "@/lib/surreal-server";

export async function POST(req: Request) {
  const body = await req.json();
  const { action } = body;

  try {
    const db = await getServerSurreal();

    switch (action) {
      case "query": {
        const result = await db.query(body.sql, body.vars);
        return NextResponse.json({ result });
      }
      case "merge": {
        const result = await db.merge(
          new StringRecordId(body.id),
          body.data,
        );
        return NextResponse.json({ result });
      }
      case "delete": {
        await db.delete(new StringRecordId(body.id));
        return NextResponse.json({ result: true });
      }
      case "ping": {
        await db.query("RETURN 1");
        return NextResponse.json({ result: true });
      }
      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("[/api/db]", action, err);
    resetServerSurreal();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
