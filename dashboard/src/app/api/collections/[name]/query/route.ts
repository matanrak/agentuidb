import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";
import { buildCollectionQuery } from "@agentuidb/core/query";

function processRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const result: Record<string, unknown> = {};
    let expandedData: Record<string, unknown> | null = null;
    for (const [key, val] of Object.entries(row)) {
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const parsed = JSON.parse(val);
            if (key === "data" && typeof parsed === "object" && !Array.isArray(parsed)) {
              expandedData = parsed;
              continue;
            }
            result[key] = parsed;
            continue;
          } catch { /* keep as string */ }
        }
      }
      result[key] = val;
    }
    return expandedData ? { ...result, ...expandedData } : result;
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await req.json();
    const { query, vars } = buildCollectionQuery({
      collection: name,
      filters: body.filters ?? null,
      sort_by: body.sort_by ?? null,
      sort_order: body.sort_order ?? null,
      limit: body.limit ?? 50,
    });
    const db = getDb();
    const rows = db.prepare(query).all(vars) as Record<string, unknown>[];
    return NextResponse.json(processRows(rows));
  } catch (err) {
    console.error("[/api/collections/query] POST", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
