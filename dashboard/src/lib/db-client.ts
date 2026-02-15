/**
 * Client-side proxy for DB operations.
 * All queries are routed through /api/db (server-side SQLite).
 */

async function rpc(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "DB request failed");
  }
  const { result } = await res.json();
  return result;
}

/** Run a SQL query. Returns the raw result array (one entry per statement). */
export async function dbQuery<T = unknown[]>(
  sql: string,
  vars?: Record<string, unknown>,
): Promise<T> {
  return (await rpc({ action: "query", sql, vars })) as T;
}

/** Merge (partial update) a record by its string ID. */
export async function dbMerge(
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return await rpc({ action: "merge", id, data });
}

/** Delete a record by its string ID. */
export async function dbDelete(id: string): Promise<void> {
  await rpc({ action: "delete", id });
}

/** Ping the server-side DB connection. */
export async function dbPing(): Promise<boolean> {
  try {
    await rpc({ action: "ping" });
    return true;
  } catch {
    return false;
  }
}
