import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { collectionExists } from "../meta.js";

export function registerQueryCollection(server: McpServer): void {
  server.tool(
    "query_collection",
    "Query documents from a collection with optional filters, sorting, and pagination",
    {
      collection: z.string().describe("Name of the collection to query"),
      filters: z.record(z.unknown()).optional().describe("Field-value pairs for exact-match filtering"),
      sort_by: z.string().optional().describe("Field name to sort by (default: created_at)"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: desc)"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default: 20)"),
    },
    async ({ collection, filters, sort_by, sort_order, limit }) => {
      try {
        if (!(await collectionExists(collection))) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Collection '${collection}' does not exist` }) }],
            isError: true,
          };
        }

        const sortField = sort_by ?? "created_at";
        const sortDir = (sort_order ?? "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";
        const maxResults = limit ?? 20;

        const vars: Record<string, unknown> = {};
        const whereClauses: string[] = [];

        if (filters) {
          let i = 0;
          for (const [field, value] of Object.entries(filters)) {
            const safeField = field.replace(/[^a-zA-Z0-9_]/g, "");
            if (!safeField) continue;
            const paramName = `p${i}`;
            vars[paramName] = value;
            whereClauses.push(`\`${safeField}\` = $${paramName}`);
            i++;
          }
        }

        // Backtick-escaped table name avoids type::table() which fails if the WS connection loses root auth
        const safeName = collection.replace(/[^a-zA-Z0-9_]/g, "");
        if (!safeName) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Invalid collection name" }) }],
            isError: true,
          };
        }
        const safeSortField = sortField.replace(/[^a-zA-Z0-9_]/g, "") || "created_at";
        let query = `SELECT * FROM \`${safeName}\``;

        if (whereClauses.length > 0) {
          query += ` WHERE ${whereClauses.join(" AND ")}`;
        }

        query += ` ORDER BY \`${safeSortField}\` ${sortDir} LIMIT ${maxResults}`;

        const db = await getDb();
        const [results] = await db.query<[Record<string, unknown>[]]>(query, vars);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
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
