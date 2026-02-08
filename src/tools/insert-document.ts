import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { getCollectionMeta } from "../meta.js";
import { validateDocument } from "../schema-validator.js";

export function registerInsertDocument(server: McpServer): void {
  server.tool(
    "insert_document",
    "Insert a new document into a collection, validating against its schema",
    {
      collection: z.string().describe("Name of the collection to insert into"),
      data: z.record(z.unknown()).describe("The document data to insert"),
    },
    async ({ collection, data }) => {
      try {
        const meta = await getCollectionMeta(collection);
        if (!meta) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Collection '${collection}' does not exist` }) }],
            isError: true,
          };
        }

        // Remove created_at from data — server always sets it
        const { created_at: _, ...userData } = data;

        const validation = validateDocument(meta.fields, userData, "insert");
        if (!validation.success) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Validation failed", details: validation.errors }) }],
            isError: true,
          };
        }

        const db = await getDb();
        const docWithTimestamp = { ...validation.data, created_at: new Date().toISOString() };
        const [record] = await db.create(collection, docWithTimestamp);
        const id = String(record.id);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, id }) }],
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
