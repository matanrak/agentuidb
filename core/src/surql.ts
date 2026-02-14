/** Escape a name for use inside backtick-delimited SurrealDB identifiers. */
export const escIdent = (name: string) => name.replace(/`/g, "``");

/** Build a parameterized SELECT query for a collection. */
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
      vars[`p${i}`] = value;
      whereClauses.push(`\`${escIdent(field)}\` = $p${i}`);
      i++;
    }
  }

  const sortField = params.sort_by ?? "created_at";
  const sortDir = (params.sort_order ?? "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";
  const safeLimit = Math.max(1, Math.min(100, Math.floor(params.limit ?? 20)));

  let query = `SELECT * FROM \`${escIdent(params.collection)}\``;
  if (whereClauses.length > 0) {
    query += ` WHERE ${whereClauses.join(" AND ")}`;
  }
  query += ` ORDER BY \`${escIdent(sortField)}\` ${sortDir} LIMIT ${safeLimit}`;

  return { query, vars };
}
