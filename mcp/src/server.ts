import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListCollections } from "./tools/list-collections.js";
import { registerGetCollectionSchema } from "./tools/get-collection-schema.js";
import { registerCreateCollection } from "./tools/create-collection.js";
import { registerInsertDocument } from "./tools/insert-document.js";
import { registerQueryCollection } from "./tools/query-collection.js";
import { registerUpdateDocument } from "./tools/update-document.js";
import { registerDeleteDocument } from "./tools/delete-document.js";
import { registerUpdateCollectionSchema } from "./tools/update-collection-schema.js";

export function createServer(): McpServer {
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

  return server;
}
