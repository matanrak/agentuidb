import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";
import { escIdent } from "@agentuidb/core/query";

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
        if (!/^(SELECT|WITH)\b/i.test(sql)) {
          return NextResponse.json(
            { error: "Only SELECT and WITH queries are allowed" },
            { status: 400 },
          );
        }
        const params = serializeParams(body.vars);
        const rows = db.prepare(sql).all(params) as Record<string, unknown>[];
        return NextResponse.json({ result: [processRows(rows)] });
      }
      case "save_layout": {
        const viewId = body.viewId as string;
        const layouts = body.layouts;
        if (!viewId || layouts === undefined) {
          return NextResponse.json({ error: "viewId and layouts required" }, { status: 400 });
        }
        db.prepare(
          `INSERT INTO _view_layouts (view_id, layouts) VALUES (?, ?)
           ON CONFLICT(view_id) DO UPDATE SET layouts = excluded.layouts, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        ).run(viewId, typeof layouts === "object" ? JSON.stringify(layouts) : layouts);
        return NextResponse.json({ result: true });
      }
      case "delete_layout": {
        const viewId = body.viewId as string;
        if (!viewId) {
          return NextResponse.json({ error: "viewId required" }, { status: 400 });
        }
        db.prepare("DELETE FROM _view_layouts WHERE view_id = ?").run(viewId);
        return NextResponse.json({ result: true });
      }
      case "merge": {
        const { collection, id, data } = parseMergeParams(body);
        const safeName = escIdent(collection);
        const existing = db.prepare(
          `SELECT data FROM \`${safeName}\` WHERE id = ?`,
        ).get(id) as { data: string } | undefined;

        if (existing) {
          const merged = { ...JSON.parse(existing.data), ...data };
          db.prepare(`UPDATE \`${safeName}\` SET data = ? WHERE id = ?`).run(
            JSON.stringify(merged),
            id,
          );
        }
        return NextResponse.json({ result: true });
      }
      case "delete": {
        const { collection, id } = parseDeleteParams(body);
        const safeName = escIdent(collection);
        db.prepare(`DELETE FROM \`${safeName}\` WHERE id = ?`).run(id);
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
