import { NextResponse } from "next/server";
import { getDb, closeDb } from "@agentuidb/core/db";
import { escIdent } from "@agentuidb/core/query";

function parseMetaRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    fields:
      typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields,
  };
}

function parseSampleDocs(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const result: Record<string, unknown> = {};
    let expandedData: Record<string, unknown> | null = null;

    for (const [key, val] of Object.entries(row)) {
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const parsed = JSON.parse(val);
            if (
              key === "data" &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              expandedData = parsed;
              continue;
            }
            result[key] = parsed;
            continue;
          } catch {
            // not JSON, keep as-is
          }
        }
      }
      result[key] = val;
    }

    return expandedData ? { ...result, ...expandedData } : result;
  });
}

export async function GET(req: Request) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const samplesParam = url.searchParams.get("samples");
    const samplesCount =
      samplesParam !== null ? Math.max(0, parseInt(samplesParam, 10) || 0) : 0;

    const rows = db
      .prepare("SELECT * FROM _collections_meta ORDER BY name ASC")
      .all() as Record<string, unknown>[];

    const collections = rows.map(parseMetaRow);

    if (samplesCount > 0) {
      const withSamples = collections.map((col) => {
        try {
          const docs = db
            .prepare(
              `SELECT * FROM \`${escIdent(String(col.name))}\` ORDER BY created_at DESC LIMIT ?`,
            )
            .all(samplesCount) as Record<string, unknown>[];
          return { ...col, sampleDocs: parseSampleDocs(docs) };
        } catch {
          return { ...col, sampleDocs: [] };
        }
      });
      return NextResponse.json(withSamples);
    }

    return NextResponse.json(collections);
  } catch (err) {
    console.error("[/api/collections] GET", err);
    closeDb();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
