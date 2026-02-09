import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { catalog } from "@/lib/render/catalog";

export const maxDuration = 60;

const BASE_SYSTEM_PROMPT = catalog.prompt();

const WORKSHOP_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are a senior data analyst. The user wants you to create a rich, insightful dashboard from their data.

Your job:
1. Look at ALL available collections and understand what data exists
2. Create a comprehensive dashboard that tells a story about the user's data
3. Surface interesting patterns, trends, totals, and cross-collection insights

Dashboard structure guidelines:
- Start with a bold, specific Heading that captures the theme (NOT generic like "Dashboard Overview")
- Use a Grid of stat Cards at the top showing key metrics (totals, averages, counts)
- Include BarChart(s) for category comparisons and LineChart(s) for time-based trends
- Add a Table for recent activity or detailed data
- If there are 3+ collections, use Tabs to organize sections by theme
- Use aggregate ("sum", "count", "avg") in charts to make data meaningful
- Be creative — find the most interesting angles in the data

CRITICAL:
- You MUST include initialActions that load data from EVERY collection you reference
- Every dataPath in a component must match a dataKey from initialActions
- Load generous amounts of data (limit: 100) to have enough for aggregations`;

function buildCollectionDocs(collections: Array<{
  name: string;
  description: string;
  count?: number;
  fields: Array<{ name: string; type: string; required: boolean }>;
}>): string {
  return collections.map((col) => {
    const fields = col.fields
      .map((f) => `    ${f.name}: ${f.type}${f.required ? " (required)" : ""}`)
      .join("\n");
    return `- ${col.name} (${col.count ?? "?"} docs): ${col.description}\n${fields}`;
  }).join("\n\n");
}

export async function POST(req: Request) {
  const { prompt, context } = await req.json();
  const apiKey = context?.apiKey as string | undefined;
  const model = context?.model as string | undefined;
  const mode = context?.mode as string | undefined;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OpenRouter API key not configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isWorkshop = mode === "workshop";
  let systemPrompt = isWorkshop ? WORKSHOP_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;

  if (context?.collections) {
    const collectionDocs = buildCollectionDocs(
      context.collections as Array<{
        name: string;
        description: string;
        count?: number;
        fields: Array<{ name: string; type: string; required: boolean }>;
      }>,
    );

    systemPrompt += `\n\n## Available SurrealDB Collections\n\nUse the queryCollection action to load data from these collections. Set dataKey to the collection name, then reference it with dataPath in Table/Chart components.\n\n${collectionDocs}`;
  }

  systemPrompt += `\n\nToday's date: ${new Date().toISOString().slice(0, 10)}`;

  systemPrompt += `\n\nIMPORTANT: Always include initialActions in the spec to load data before rendering. Example:
{
  "initialActions": [
    { "action": "queryCollection", "params": { "collection": "meals", "dataKey": "meals", "limit": 50 } }
  ]
}

When creating Table components that display collection data, always set editable=true so users can inline-edit cell values and delete rows.`;

  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const result = streamText({
    model: openrouter(model ?? "anthropic/claude-sonnet-4"),
    system: systemPrompt,
    prompt,
    temperature: isWorkshop ? 0.8 : 0.7,
  });

  return result.toTextStreamResponse();
}
