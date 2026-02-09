import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { getCollectionMeta } from "../meta.js";

/** Escape a name for use inside backtick-delimited SurrealDB identifiers. */
const escIdent = (name: string) => name.replace(/`/g, "``");

export function registerGetCollectionSchema(server: McpServer): void {
  server.tool(
    "get_collection_schema",
    "Get the full schema for a collection including field definitions and document count",
    {
      collection: z.string().describe("Name of the collection"),
    },
    async ({ collection }) => {
      try {
        const meta = await getCollectionMeta(collection);
        if (!meta) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Collection '${collection}' does not exist` }) }],
            isError: true,
          };
        }

        const db = await getDb();
        let count = 0;
        try {
          // Collection name is already validated by getCollectionMeta() above.
          const [countResult] = await db.query<[{ count: number }[]]>(
            `SELECT count() FROM \`${escIdent(collection)}\` GROUP ALL`
          );
          count = countResult?.[0]?.count ?? 0;
        } catch {
          // Table might not have any records yet
        }

        const result = {
          name: meta.name,
          description: meta.description,
          fields: meta.fields,
          count,
          created_at: meta.created_at,
        };

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
