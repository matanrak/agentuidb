import { Type } from "@sinclair/typebox";
import { closeDb } from "@agentuidb/core";
import * as handlers from "@agentuidb/core";

// ---------------------------------------------------------------------------
// Types (inline — avoid importing openclaw/plugin-sdk outside the monorepo)
// ---------------------------------------------------------------------------

interface OpenClawPluginApi {
  pluginConfig?: Record<string, unknown>;
  logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  registerTool: (tool: any, opts?: any) => void;
  registerService: (service: any) => void;
}

// ---------------------------------------------------------------------------
// Shared schema fragment
// ---------------------------------------------------------------------------

const FieldDefSchema = Type.Object({
  name: Type.String(),
  type: Type.String(),
  required: Type.Boolean(),
  enum: Type.Optional(Type.Array(Type.String())),
  default: Type.Optional(Type.Unknown()),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const agentuidbPlugin = {
  id: "agentuidb",
  name: "AgentUIDB",
  description:
    "Structured data storage backed by embedded SQLite — silently extracts and persists structured data from conversations",

  register(api: OpenClawPluginApi) {
    api.logger.info("[agentuidb] Registering tools");

    api.registerTool({
      name: "list_collections",
      label: "List Collections",
      description:
        "List all collections with their names, descriptions, and document counts",
      parameters: { type: "object", properties: {} },
      execute: () => handlers.listCollections(),
    });

    api.registerTool({
      name: "get_collection_schema",
      label: "Get Collection Schema",
      description:
        "Get the full schema for a collection including field definitions and document count",
      parameters: Type.Object({
        collection: Type.String({ description: "Name of the collection" }),
      }),
      execute: (_toolCallId: string, params: { collection: string }) =>
        handlers.getCollectionSchema(params),
    });

    api.registerTool({
      name: "create_collection",
      label: "Create Collection",
      description: "Create a new collection with a typed schema",
      parameters: Type.Object({
        name: Type.String({ description: "Collection name (lowercase snake_case, plural)" }),
        description: Type.String({ description: "One-sentence description of what this collection stores" }),
        fields: Type.Array(FieldDefSchema, { description: "Field definitions for the collection schema" }),
      }),
      execute: (_toolCallId: string, params: any) =>
        handlers.createCollection(params),
    });

    api.registerTool({
      name: "insert_document",
      label: "Insert Document",
      description:
        "Insert a new document into a collection, validating against its schema",
      parameters: Type.Object({
        collection: Type.String({ description: "Name of the collection to insert into" }),
        data: Type.Record(Type.String(), Type.Unknown(), { description: "The document data to insert" }),
      }),
      execute: (_toolCallId: string, params: { collection: string; data: Record<string, unknown> }) =>
        handlers.insertDocument(params),
    });

    api.registerTool({
      name: "query_collection",
      label: "Query Collection",
      description:
        "Query documents from a collection with optional filters, sorting, and pagination",
      parameters: Type.Object({
        collection: Type.String({ description: "Name of the collection to query" }),
        filters: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Field-value pairs for exact-match filtering" })),
        sort_by: Type.Optional(Type.String({ description: "Field name to sort by (default: created_at)" })),
        sort_order: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")], { description: "Sort direction (default: desc)" })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Max results to return (default: 20)" })),
      }),
      execute: (_toolCallId: string, params: any) =>
        handlers.queryCollection(params),
    });

    api.registerTool({
      name: "update_document",
      label: "Update Document",
      description: "Update an existing document by ID with partial data",
      parameters: Type.Object({
        collection: Type.String({ description: "Name of the collection" }),
        id: Type.String({ description: "Document ID (e.g. meals:abc123)" }),
        data: Type.Record(Type.String(), Type.Unknown(), { description: "Fields to update (partial update)" }),
      }),
      execute: (_toolCallId: string, params: { collection: string; id: string; data: Record<string, unknown> }) =>
        handlers.updateDocument(params),
    });

    api.registerTool({
      name: "delete_document",
      label: "Delete Document",
      description: "Delete a document by ID",
      parameters: Type.Object({
        collection: Type.String({ description: "Name of the collection" }),
        id: Type.String({ description: "Document ID (e.g. meals:abc123)" }),
      }),
      execute: (_toolCallId: string, params: { collection: string; id: string }) =>
        handlers.deleteDocument(params),
    });

    api.registerTool({
      name: "update_collection_schema",
      label: "Update Collection Schema",
      description:
        "Add new fields to an existing collection schema. Cannot remove or rename existing fields.",
      parameters: Type.Object({
        collection: Type.String({ description: "Name of the collection" }),
        new_fields: Type.Array(FieldDefSchema, { description: "New field definitions to add" }),
      }),
      execute: (_toolCallId: string, params: any) =>
        handlers.updateCollectionSchema(params),
    });

    // ── Service (graceful shutdown) ─────────────────────────────────────
    api.registerService({
      id: "agentuidb",
      start: () => {
        api.logger.info("[agentuidb] Service started");
      },
      stop: async () => {
        await closeDb();
        api.logger.info("[agentuidb] DB closed");
      },
    });

    api.logger.info("[agentuidb] 8 tools registered");
  },
};

export default agentuidbPlugin;
