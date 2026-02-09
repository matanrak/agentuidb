import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StringRecordId } from "surrealdb";
import { getDb } from "../db.js";
import { collectionExists } from "../meta.js";

export function registerDeleteDocument(server: McpServer): void {
  server.tool(
    "delete_document",
    "Delete a document by ID",
    {
      collection: z.string().describe("Name of the collection"),
      id: z.string().describe("Document ID (e.g. meals:abc123)"),
    },
    async ({ collection, id }) => {
      try {
        if (!(await collectionExists(collection))) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Collection '${collection}' does not exist` }) }],
            isError: true,
          };
        }

        const db = await getDb();
        await db.delete(new StringRecordId(id));

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
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
