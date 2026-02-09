import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../db.js";
import { collectionExists } from "../meta.js";

/** Escape a name for use inside backtick-delimited SurrealDB identifiers. */
const escIdent = (name: string) => name.replace(/`/g, "``");

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
            if (!field) continue;
            const paramName = `p${i}`;
            vars[paramName] = value;
            whereClauses.push(`\`${escIdent(field)}\` = $${paramName}`);
            i++;
          }
        }

        // Collection name is already validated by collectionExists() above.
        // Escape backticks to safely embed in backtick-delimited identifier.
        const safeLimit = Math.max(1, Math.min(100, Math.floor(maxResults)));
        let query = `SELECT * FROM \`${escIdent(collection)}\``;

        if (whereClauses.length > 0) {
          query += ` WHERE ${whereClauses.join(" AND ")}`;
        }

        query += ` ORDER BY \`${escIdent(sortField)}\` ${sortDir} LIMIT ${safeLimit}`;

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
