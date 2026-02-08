import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCollectionMeta, updateCollectionMeta } from "../meta.js";
import { validateFieldDefinitions } from "../schema-validator.js";
import type { FieldDefinition } from "../types.js";

export function registerUpdateCollectionSchema(server: McpServer): void {
  server.tool(
    "update_collection_schema",
    "Add new fields to an existing collection schema. Cannot remove or rename existing fields.",
    {
      collection: z.string().describe("Name of the collection"),
      new_fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        enum: z.array(z.string()).optional(),
        default: z.unknown().optional(),
      })).describe("New field definitions to add"),
    },
    async ({ collection, new_fields }) => {
      try {
        const meta = await getCollectionMeta(collection);
        if (!meta) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Collection '${collection}' does not exist` }) }],
            isError: true,
          };
        }

        const typedNewFields = new_fields as FieldDefinition[];

        // New fields cannot be required (existing docs would be invalid)
        for (const field of typedNewFields) {
          if (field.required) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: `New field '${field.name}' cannot be required. Existing documents would be invalid.` }) }],
              isError: true,
            };
          }
        }

        // Check for duplicate names with existing fields
        const existingNames = new Set(meta.fields.map((f) => f.name));
        for (const field of typedNewFields) {
          if (existingNames.has(field.name)) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: `Field '${field.name}' already exists in collection '${collection}'` }) }],
              isError: true,
            };
          }
        }

        const fieldError = validateFieldDefinitions(typedNewFields);
        if (fieldError) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: fieldError }) }],
            isError: true,
          };
        }

        const mergedFields = [...meta.fields, ...typedNewFields];
        await updateCollectionMeta(collection, mergedFields);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, total_fields: mergedFields.length }) }],
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
