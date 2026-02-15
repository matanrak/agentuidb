import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";

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
          } catch {}
        }
      }
      result[key] = val;
    }

    return expandedData ? { ...result, ...expandedData } : result;
  });
}

function serializeParams(vars: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!vars) return {};
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(vars)) {
    result[key] = typeof val === "object" && val !== null ? JSON.stringify(val) : val;
  }
  return result;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { action } = body;

  try {
    const db = getDb();

    switch (action) {
      case "query": {
        const sql = (body.sql as string).trim();
        const params = serializeParams(body.vars);
        const stmt = db.prepare(sql);

        if (/^(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql)) {
          const rows = stmt.all(params) as Record<string, unknown>[];
          return NextResponse.json({ result: [processRows(rows)] });
        } else {
          stmt.run(params);
          return NextResponse.json({ result: [[]] });
        }
      }
      case "merge": {
        const { collection, id, data } = parseMergeParams(body);
        const existing = db.prepare(
          `SELECT data FROM \`${collection}\` WHERE id = ?`,
        ).get(id) as { data: string } | undefined;

        if (existing) {
          const merged = { ...JSON.parse(existing.data), ...data };
          db.prepare(`UPDATE \`${collection}\` SET data = ? WHERE id = ?`).run(
            JSON.stringify(merged),
            id,
          );
        }
        return NextResponse.json({ result: true });
      }
      case "delete": {
        const { collection, id } = parseDeleteParams(body);
        db.prepare(`DELETE FROM \`${collection}\` WHERE id = ?`).run(id);
        return NextResponse.json({ result: true });
      }
      case "ping": {
        db.prepare("SELECT 1").get();
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
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

function parseMergeParams(body: Record<string, unknown>): {
  collection: string;
  id: string;
  data: Record<string, unknown>;
} {
  if (body.collection) {
    return {
      collection: body.collection as string,
      id: body.id as string,
      data: body.data as Record<string, unknown>,
    };
  }
  const parts = String(body.id).split(":");
  if (parts.length >= 2) {
    return {
      collection: parts[0],
      id: parts.slice(1).join(":"),
      data: body.data as Record<string, unknown>,
    };
  }
  throw new Error("Cannot determine collection for merge. Provide 'collection' field.");
}

function parseDeleteParams(body: Record<string, unknown>): {
  collection: string;
  id: string;
} {
  if (body.collection) {
    return { collection: body.collection as string, id: body.id as string };
  }
  const parts = String(body.id).split(":");
  if (parts.length >= 2) {
    return { collection: parts[0], id: parts.slice(1).join(":") };
  }
  throw new Error("Cannot determine collection for delete. Provide 'collection' field.");
}
