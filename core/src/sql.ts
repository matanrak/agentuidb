/** Escape a name for use inside backtick-delimited SQL identifiers. */
export const escIdent = (name: string) => name.replace(/`/g, "``");

/**
 * Validate a field name for safe use in json_extract paths.
 * Allows alphanumeric, underscores, and dots (for nested access).
 * Rejects anything that could break out of a json_extract path string.
 */
const SAFE_FIELD_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

function assertSafeFieldName(name: string): void {
  if (!SAFE_FIELD_RE.test(name)) {
    throw new Error(`Invalid field name: '${name}'`);
  }
}

/** Build a parameterized SELECT query for a collection (SQLite + json_extract). */
export function buildCollectionQuery(params: {
  collection: string;
  filters?: Record<string, unknown> | null;
  sort_by?: string | null;
  sort_order?: string | null;
  limit?: number | null;
}): { query: string; vars: Record<string, unknown> } {
  const vars: Record<string, unknown> = {};
  const whereClauses: string[] = [];

  if (params.filters) {
    let i = 0;
    for (const [field, value] of Object.entries(params.filters)) {
      if (!field) continue;
      assertSafeFieldName(field);
      vars[`p${i}`] = value;
      whereClauses.push(`json_extract(data, '$.${field}') = $p${i}`);
      i++;
    }
  }

  const sortField = params.sort_by ?? "created_at";
  const sortDir = (params.sort_order ?? "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";
  const safeLimit = Math.max(1, Math.min(100, Math.floor(params.limit ?? 20)));

  if (sortField !== "created_at" && sortField !== "id") {
    assertSafeFieldName(sortField);
  }
  const sortExpr = sortField === "created_at" || sortField === "id"
    ? sortField
    : `json_extract(data, '$.${sortField}')`;

  let query = `SELECT id, data, created_at FROM \`${escIdent(params.collection)}\``;
  if (whereClauses.length > 0) {
    query += ` WHERE ${whereClauses.join(" AND ")}`;
  }
  query += ` ORDER BY ${sortExpr} ${sortDir} LIMIT ${safeLimit}`;

  return { query, vars };
}
