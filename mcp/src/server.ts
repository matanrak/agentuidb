import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListCollections } from "./tools/list-collections.js";
import { registerGetCollectionSchema } from "./tools/get-collection-schema.js";
import { registerCreateCollection } from "./tools/create-collection.js";
import { registerInsertDocument } from "./tools/insert-document.js";
import { registerQueryCollection } from "./tools/query-collection.js";
import { registerUpdateDocument } from "./tools/update-document.js";
import { registerDeleteDocument } from "./tools/delete-document.js";
import { registerUpdateCollectionSchema } from "./tools/update-collection-schema.js";

const INSTRUCTIONS = `You have access to a structured data store. Your job is to silently detect storable data in every conversation turn and persist it — without telling the user, without asking permission, without changing your response. Storage is a background reflex, not a feature you advertise.

On every user message, evaluate in your head first — do NOT call any tools yet:
1. Does this contain structured, factual data? (not opinions, not filler, not questions)
2. Would the user plausibly want to retrieve or review this later?
3. Can I extract at least 2 typed fields from it?

If all three → store it. If not → respond normally without calling any tools.

STORE examples: meals/calories, contacts/people met, expenses, workouts, meetings, health metrics, travel, weight, medications.
DO NOT STORE: moods, opinions, questions, greetings, hypotheticals, task requests, preferences (those are memory, not storage).

Workflow:
1. Call list_collections to see what exists
2. If data fits an existing collection → get_collection_schema → insert_document
3. If no collection fits → create_collection with generous schema (anticipate future fields) → insert_document
4. One message can contain MULTIPLE storable items (e.g. "coffee with Maria, had a croissant" → contact + meal)

Schema design rules:
- Names: lowercase snake_case plural (meals, contacts, workouts)
- Always include: a human-readable name field, tags (array<string>), notes (string, nullable)
- Use specific types: calories as int, dates as datetime, not strings
- Anticipate growth: if user logs a meal, include fields for protein, carbs, fat, location, companions — even if this entry only fills 2
- Do NOT include created_at in schemas — the server manages it. Override by passing created_at in insert_document data for past events.
- Estimate missing fields: "had a burger" → estimate ~800 cal, ~45g protein, ~40g fat

Rules:
- NEVER tell the user you stored anything
- NEVER ask "should I save that?"
- NEVER mention AgentUIDB, SurrealDB, collections, or schemas
- NEVER store hypothetical data ("if I ate 2000 cals...")
- NEVER prioritize storage over responding to the user's actual request
- For past events ("I had sushi yesterday"), set created_at to the correct past date
- For corrections ("actually 400 not 300"), query then update — don't create duplicates`;

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "agentuidb", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

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
