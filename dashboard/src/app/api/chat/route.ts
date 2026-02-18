import { generateText, streamText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import * as handlers from "@agentuidb/core";

export const maxDuration = 60;

const FieldDefSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  enum: z.array(z.string()).optional(),
  default: z.unknown().optional(),
});

/** Extract the text payload from a core handler ToolResult. */
function extractText(result: { content: [{ type: string; text: string }] }): string {
  return result.content[0].text;
}

const DATA_TOOLS_PROMPT = `You have access to a structured data store with tools for managing collections and documents.

When the user mentions factual, structured data (meals, expenses, contacts, workouts, etc.):
1. Use list_collections to see what exists
2. If data fits an existing collection → get_collection_schema → insert_document
3. If no collection fits → create_collection with a generous schema (anticipate future fields) → insert_document
4. One message can contain MULTIPLE storable items (e.g. "coffee with Maria, had a croissant" → contact + meal)

Schema design rules:
- Names: lowercase snake_case plural (meals, contacts, workouts)
- Always include: a human-readable name field, tags (array<string>), notes (string, nullable)
- Use specific types: calories as int, dates as datetime, not strings
- Anticipate growth: if user logs a meal, include fields for protein, carbs, fat, location, companions — even if this entry only fills 2
- Do NOT include created_at in schemas — the server manages it. Override by passing created_at in insert_document data for past events.
- Estimate missing fields: "had a burger" → estimate ~800 cal, ~45g protein, ~40g fat

Rules:
- For past events ("I had sushi yesterday"), set created_at to the correct past date
- For corrections ("actually 400 not 300"), query then update — don't create duplicates
- If the user asks to see or visualize data, respond with a JSON UI spec (see below)
- If the user just logs data without asking to see anything, respond with a brief confirmation`;

const COMPONENT_PROMPT = `You are a data assistant with UI generation capabilities.

## Available UI Components

Layout:
- Stack: { direction?: "horizontal"|"vertical", gap?: "sm"|"md"|"lg", justify?, align? } - Flex container [children]
- Grid: { columns: number, gap?: "sm"|"md"|"lg" } - CSS grid [children]
- Card: { title?: string, description?: string, centered?: boolean } - Card container [children]
- Tabs: { defaultValue?: string, tabs: [{value, label}] } - Tabbed content [children]
- TabContent: { value: string } - Content for a tab [children]

Typography:
- Heading: { text: string, level?: "h1"|"h2"|"h3"|"h4" }
- Text: { text?: string, content?: string, variant?: "body"|"caption"|"muted" }
- Badge: { text: string, variant?: "default"|"secondary"|"destructive"|"outline"|"success"|"warning" }
- Alert: { variant?: "default"|"destructive", title: string, description?: string }

Data:
- Table: { dataPath: string, columns: [{key, label}], editable?: boolean, filter?: [{key, operator, value}] } - Sortable data table
- BarChart: { dataPath: string, xKey: string, yKey: string, aggregate?: "sum"|"count"|"avg", color?: string, height?: number, referenceLine?: number, referenceLineLabel?: string, thresholdColor?: string, colorRules?: [...] }
- LineChart: { dataPath: string, xKey: string, yKey: string, aggregate?, color?, height?, referenceLine?, referenceLineLabel? }
- CompositeChart: { dataPath: string, xKey: string, aggregate?, height?, layers: [{type: "bar"|"line"|"area"|"referenceLine", yKey?, y?, color?, label?, colorRules?}] }

Other:
- Separator, Divider, Progress: { value, max?, label? }, Avatar: { src?, alt?, fallback }, Skeleton, Button: { label, variant?, action, actionParams? }

## UI Spec Format

When generating UI, output a COMPLETE JSON spec object — a single JSON object with "root" and "elements":

\`\`\`json
{
  "root": "dashboard",
  "elements": {
    "dashboard": { "type": "Stack", "props": { "direction": "vertical", "gap": "lg" }, "children": ["title", "card-1"] },
    "title": { "type": "Heading", "props": { "text": "My Dashboard", "level": "h2" }, "children": [] },
    "card-1": { "type": "Card", "props": { "title": "Data" }, "children": ["table-1"] },
    "table-1": { "type": "Table", "props": { "dataPath": "meals", "editable": true, "columns": [{"key": "name", "label": "Name"}] }, "children": [] }
  }
}
\`\`\`

RULES:
1. Output the COMPLETE JSON spec as a single JSON object — NOT line-by-line patches
2. Every element needs: type, props, children (array of child key strings)
3. ONLY use components listed above
4. The root value is a key in the elements map
5. No markdown fences, no explanation — just the raw JSON when responding with a spec`;

function buildSystemPrompt(
  collections?: Array<{
    name: string;
    description: string;
    count?: number;
    fields: Array<{ name: string; type: string; required: boolean }>;
    sampleDocs?: Array<Record<string, unknown>>;
  }>,
): string {
  let systemPrompt = `${COMPONENT_PROMPT}

${DATA_TOOLS_PROMPT}`;

  systemPrompt += `

## Response Format

You can respond in two ways:
1. **Text only** — for confirmations, questions, or when no visualization is needed. Just reply with plain text.
2. **JSON UI spec** — when the user asks to see, show, chart, or visualize data. Output ONLY the JSON spec with no surrounding text or markdown fences.

If you need to both store data AND show a visualization, do the tool calls first, then respond with the JSON spec.

## Design Philosophy

You are a product designer, not a code generator. Your job is to answer the user's real question — not just render data.

### Information Architecture

**Lead with visuals, then show detail.**
- The chart is the hero — it should be the first major element after the title.
- Put the detail table below the chart.

**Structure every widget the same way:**
1. Title — short, specific, uses the user's own words when possible
2. Context line — a muted subtitle that frames the data
3. Visualization — a BarChart or LineChart. Always include one when the data is numeric.
4. Detail table — optional, only when the user wants to browse individual records.

Data loading is automatic — any collection referenced via dataPath on a Table or Chart component will be fetched from the database.

### Data Curation

**Tables:** 3-5 columns max. Never show id, created_at, updated_at. Use human-readable labels. editable=true.
**Charts:** BarChart for daily/per-period data. LineChart for long-term trends. xKey="created_at" for time-based. Warm colors.
**Stat Cards:** NEVER hardcode computed numbers. Skip stat cards and go straight to chart + table.

### Layout Rules
- Wrap everything in a single top-level Stack (vertical, gap="lg").
- Use Card as the primary container.
- Never nest Cards inside Cards.`;

  if (collections && collections.length > 0) {
    const collectionDocs = collections
      .map((col) => {
        const fields = col.fields
          .map((f) => `    ${f.name}: ${f.type}${f.required ? " (required)" : ""}`)
          .join("\n");
        let section = `- ${col.name} (${col.count ?? "?"} docs): ${col.description}\n${fields}`;
        if (col.sampleDocs && col.sampleDocs.length > 0) {
          const samples = col.sampleDocs
            .map((doc) => {
              const { id: _id, updated_at: _ua, ...rest } = doc;
              return `    ${JSON.stringify(rest)}`;
            })
            .join("\n");
          section += `\n  Sample entries:\n${samples}`;
        }
        return section;
      })
      .join("\n\n");

    systemPrompt += `\n\n## Available Collections\n\nData loads automatically when you set dataPath on a Table or Chart.\nAll collections have a "created_at" field (ISO 8601 datetime) — use this as xKey for time-based charts.\n\n${collectionDocs}`;
  }

  systemPrompt += `\n\nToday's date: ${new Date().toISOString().slice(0, 10)}`;
  systemPrompt += `\n\nREMINDER: The date/time field is always "created_at". Tables should have editable=true.`;

  return systemPrompt;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function defineTool(description: string, inputSchema: z.ZodType, execute: (params: any) => Promise<string>) {
  return { description, inputSchema, execute } as any;
}

const dataTools: any = {
  list_collections: defineTool(
    "List all collections with their names, descriptions, and document counts",
    z.object({}),
    async () => extractText(await handlers.listCollections()),
  ),
  get_collection_schema: defineTool(
    "Get the full schema for a collection including field definitions and document count",
    z.object({ collection: z.string().describe("Name of the collection") }),
    async (params) => extractText(await handlers.getCollectionSchema(params)),
  ),
  create_collection: defineTool(
    "Create a new collection with a typed schema",
    z.object({
      name: z.string().describe("Collection name (lowercase snake_case, plural)"),
      description: z.string().describe("One-sentence description"),
      fields: z.array(FieldDefSchema).describe("Field definitions for the collection schema"),
    }),
    async (params) => extractText(await handlers.createCollection(params)),
  ),
  insert_document: defineTool(
    "Insert a new document into a collection, validating against its schema",
    z.object({
      collection: z.string().describe("Name of the collection to insert into"),
      data: z.record(z.string(), z.unknown()).describe("The document data to insert"),
    }),
    async (params) => extractText(await handlers.insertDocument(params)),
  ),
  query_collection: defineTool(
    "Query documents from a collection with optional filters, sorting, and pagination",
    z.object({
      collection: z.string().describe("Name of the collection to query"),
      filters: z.record(z.string(), z.unknown()).optional().describe("Field-value pairs for exact-match filtering"),
      sort_by: z.string().optional().describe("Field name to sort by (default: created_at)"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: desc)"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default: 20)"),
    }),
    async (params) => extractText(await handlers.queryCollection(params)),
  ),
  update_document: defineTool(
    "Update an existing document by ID with partial data",
    z.object({
      collection: z.string().describe("Name of the collection"),
      id: z.string().describe("Document ID"),
      data: z.record(z.string(), z.unknown()).describe("Fields to update (partial update)"),
    }),
    async (params) => extractText(await handlers.updateDocument(params)),
  ),
  delete_document: defineTool(
    "Delete a document by ID",
    z.object({
      collection: z.string().describe("Name of the collection"),
      id: z.string().describe("Document ID"),
    }),
    async (params) => extractText(await handlers.deleteDocument(params)),
  ),
  update_collection_schema: defineTool(
    "Add new fields to an existing collection schema",
    z.object({
      collection: z.string().describe("Name of the collection"),
      new_fields: z.array(FieldDefSchema).describe("New field definitions to add"),
    }),
    async (params) => extractText(await handlers.updateCollectionSchema(params)),
  ),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── SSE helpers ──

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const { messages, context } = await req.json();
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey) {
    console.error("[/api/chat] OPENROUTER_API_KEY is not set");
    return new Response(JSON.stringify({ error: "AI provider not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const systemPrompt = buildSystemPrompt(context?.collections);

  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Phase 1: Tool loop with generateText (non-streaming)
        const toolResult = await generateText({
          model: openrouter.chat(model ?? "anthropic/claude-sonnet-4"),
          system: systemPrompt,
          messages,
          tools: dataTools,
          stopWhen: stepCountIs(5),
          temperature: 0.5,
        });

        // Send tool call events from all steps
        const steps = await toolResult.steps;
        for (const step of steps) {
          for (const tc of step.toolCalls) {
            controller.enqueue(
              encoder.encode(
                sseEvent("tool_call", {
                  name: tc.toolName,
                  args: (tc as Record<string, unknown>).input ?? {},
                }),
              ),
            );
          }
          for (const tr of step.toolResults) {
            controller.enqueue(
              encoder.encode(
                sseEvent("tool_result", {
                  name: tr.toolName,
                  result: (tr as Record<string, unknown>).output ?? "",
                }),
              ),
            );
          }
        }

        // Check if the last step already has text content
        const finalText = await toolResult.text;
        if (finalText) {
          // Already have text from generateText — send it directly
          controller.enqueue(encoder.encode(sseEvent("text", { content: finalText })));
          controller.enqueue(encoder.encode(sseEvent("done", {})));
          controller.close();
          return;
        }

        // Phase 2: If no text was generated (all steps were tool calls),
        // do a final streaming call for the text response
        const finalMessages = [...messages];
        for (const step of steps) {
          if (step.text) {
            finalMessages.push({ role: "assistant", content: step.text });
          }
          // Add tool call/result messages so the model has context
          for (let i = 0; i < step.toolCalls.length; i++) {
            const tc = step.toolCalls[i];
            const tr = step.toolResults[i];
            finalMessages.push({
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: tc.toolCallId,
                  type: "function",
                  function: {
                    name: tc.toolName,
                    arguments: JSON.stringify((tc as Record<string, unknown>).input ?? {}),
                  },
                },
              ],
            });
            finalMessages.push({
              role: "tool",
              tool_call_id: tc.toolCallId,
              content: (tr as Record<string, unknown>)?.output ?? "",
            });
          }
        }

        const streamResult = streamText({
          model: openrouter.chat(model ?? "anthropic/claude-sonnet-4"),
          system: systemPrompt,
          messages: finalMessages,
          temperature: 0.5,
        });

        for await (const chunk of streamResult.textStream) {
          controller.enqueue(encoder.encode(sseEvent("text_delta", { content: chunk })));
        }

        controller.enqueue(encoder.encode(sseEvent("done", {})));
        controller.close();
      } catch (err) {
        console.error("[/api/chat]", err);
        controller.enqueue(
          encoder.encode(
            sseEvent("error", { message: "Internal server error" }),
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
