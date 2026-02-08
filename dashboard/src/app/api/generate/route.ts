import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { catalog } from "@/lib/render/catalog";

export const maxDuration = 30;

const BASE_SYSTEM_PROMPT = catalog.prompt();

export async function POST(req: Request) {
  const { prompt, context } = await req.json();
  const apiKey = context?.apiKey as string | undefined;
  const model = context?.model as string | undefined;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OpenRouter API key not configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Build full system prompt with collection schemas
  let systemPrompt = BASE_SYSTEM_PROMPT;

  if (context?.collections) {
    const collectionDocs = (context.collections as Array<{
      name: string;
      description: string;
      count?: number;
      fields: Array<{ name: string; type: string; required: boolean }>;
    }>).map((col) => {
      const fields = col.fields
        .map((f) => `    ${f.name}: ${f.type}${f.required ? " (required)" : ""}`)
        .join("\n");
      return `- ${col.name} (${col.count ?? "?"} docs): ${col.description}\n${fields}`;
    }).join("\n\n");

    systemPrompt += `\n\n## Available SurrealDB Collections\n\nUse the queryCollection action to load data from these collections. Set dataKey to the collection name, then reference it with dataPath in Table/Chart components.\n\n${collectionDocs}`;
  }

  systemPrompt += `\n\nToday's date: ${new Date().toISOString().slice(0, 10)}`;

  systemPrompt += `\n\nIMPORTANT: Always include initialActions in the spec to load data before rendering. Example:
{
  "initialActions": [
    { "action": "queryCollection", "params": { "collection": "meals", "dataKey": "meals", "limit": 50 } }
  ]
}`;

  // Create OpenRouter-compatible provider using AI SDK
  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const result = streamText({
    model: openrouter(model ?? "anthropic/claude-sonnet-4"),
    system: systemPrompt,
    prompt,
    temperature: 0.7,
  });

  return result.toTextStreamResponse();
}
