import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { collectionExists, createCollectionMeta } from "../meta.js";
import { validateFieldDefinitions } from "../schema-validator.js";
import type { FieldDefinition } from "../types.js";

const COLLECTION_NAME_RE = /^[a-z][a-z0-9_]*$/;

export function registerCreateCollection(server: McpServer): void {
  server.tool(
    "create_collection",
    "Create a new collection with a typed schema",
    {
      name: z.string().describe("Collection name (lowercase snake_case, plural)"),
      description: z.string().describe("One-sentence description of what this collection stores"),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        enum: z.array(z.string()).optional(),
        default: z.unknown().optional(),
      })).describe("Field definitions for the collection schema"),
    },
    async ({ name, description, fields }) => {
      try {
        if (!COLLECTION_NAME_RE.test(name)) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Invalid collection name. Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores." }) }],
            isError: true,
          };
        }

        if (name.startsWith("_")) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Collection names starting with '_' are reserved." }) }],
            isError: true,
          };
        }

        if (await collectionExists(name)) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Collection '${name}' already exists.` }) }],
            isError: true,
          };
        }

        const typedFields = fields as FieldDefinition[];
        const fieldError = validateFieldDefinitions(typedFields);
        if (fieldError) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: fieldError }) }],
            isError: true,
          };
        }

        await createCollectionMeta(name, description, typedFields);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, name, fields_count: fields.length }) }],
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
