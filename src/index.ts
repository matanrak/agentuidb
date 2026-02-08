#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeDb } from "./db.js";
import { registerListCollections } from "./tools/list-collections.js";
import { registerGetCollectionSchema } from "./tools/get-collection-schema.js";
import { registerCreateCollection } from "./tools/create-collection.js";
import { registerInsertDocument } from "./tools/insert-document.js";
import { registerQueryCollection } from "./tools/query-collection.js";
import { registerUpdateDocument } from "./tools/update-document.js";
import { registerDeleteDocument } from "./tools/delete-document.js";
import { registerUpdateCollectionSchema } from "./tools/update-collection-schema.js";

const server = new McpServer({
  name: "agentuidb",
  version: "1.0.0",
});

registerListCollections(server);
registerGetCollectionSchema(server);
registerCreateCollection(server);
registerInsertDocument(server);
registerQueryCollection(server);
registerUpdateDocument(server);
registerDeleteDocument(server);
registerUpdateCollectionSchema(server);

const transport = new StdioServerTransport();
await server.connect(transport);

const shutdown = async () => {
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
