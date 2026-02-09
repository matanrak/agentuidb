import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "../db.js";
import { listCollections } from "../meta.js";

/** Escape a name for use inside backtick-delimited SurrealDB identifiers. */
const escIdent = (name: string) => name.replace(/`/g, "``");

export function registerListCollections(server: McpServer): void {
  server.tool(
    "list_collections",
    "List all collections with their names, descriptions, and document counts",
    {},
    async () => {
      try {
        const collections = await listCollections();
        const db = await getDb();

        const result = await Promise.all(
          collections.map(async (col) => {
            let count = 0;
            try {
              // Collection names come from _collections_meta; escape backticks for safe embedding.
              const [countResult] = await db.query<[{ count: number }[]]>(
                `SELECT count() FROM \`${escIdent(col.name)}\` GROUP ALL`
              );
              count = countResult?.[0]?.count ?? 0;
            } catch {
              // Table might not have any records yet
            }
            return { name: col.name, description: col.description, count };
          })
        );

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(error) }) }],
          isError: true,
        };
      }
    }
  );
}
