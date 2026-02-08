import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StringRecordId } from "surrealdb";
import { getDb } from "../db.js";
import { getCollectionMeta } from "../meta.js";
import { validateDocument } from "../schema-validator.js";

export function registerUpdateDocument(server: McpServer): void {
  server.tool(
    "update_document",
    "Update an existing document by ID with partial data",
    {
      collection: z.string().describe("Name of the collection"),
      id: z.string().describe("Document ID (e.g. meals:abc123)"),
      data: z.record(z.unknown()).describe("Fields to update (partial update)"),
    },
    async ({ collection, id, data }) => {
      try {
        const meta = await getCollectionMeta(collection);
        if (!meta) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Collection '${collection}' does not exist` }) }],
            isError: true,
          };
        }

        const validation = validateDocument(meta.fields, data, "update");
        if (!validation.success) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Validation failed", details: validation.errors }) }],
            isError: true,
          };
        }

        const db = await getDb();
        const record = await db.merge(
          new StringRecordId(id),
          validation.data
        );

        if (!record) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Document '${id}' not found` }) }],
            isError: true,
          };
        }

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
