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
- Include BarChart(s) for daily/per-period data and category comparisons, LineChart(s) only for long-term continuous trends
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
  sampleDocs?: Array<Record<string, unknown>>;
}>): string {
  return collections.map((col) => {
    const fields = col.fields
      .map((f) => `    ${f.name}: ${f.type}${f.required ? " (required)" : ""}`)
      .join("\n");

    let section = `- ${col.name} (${col.count ?? "?"} docs): ${col.description}\n${fields}`;

    // Include sample data so the agent understands real field values and shapes
    if (col.sampleDocs && col.sampleDocs.length > 0) {
      const samples = col.sampleDocs.map((doc) => {
        // Strip SurrealDB record ID but keep created_at so the AI sees the date field
        const { id: _id, updated_at: _ua, ...rest } = doc;
        return `    ${JSON.stringify(rest)}`;
      }).join("\n");
      section += `\n  Sample entries:\n${samples}`;
    }

    return section;
  }).join("\n\n");
}

export async function POST(req: Request) {
  const { prompt, context } = await req.json();
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const mode = context?.mode as string | undefined;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not set in .env.local" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isWorkshop = mode === "workshop";
  let systemPrompt = isWorkshop ? WORKSHOP_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;

  // ── Design Guidelines ──
  systemPrompt += `

## Design Philosophy

You are a product designer, not a code generator. Your job is to answer the user's real question — not just render data.

When someone says "show me my meals," they're not asking for a dump of every field in the meals table. They want to understand their eating patterns. Think about what insight serves them, then build the simplest widget that delivers it.

### 1. Think Before You Build

Before choosing components, ask yourself:
- What is the user actually trying to learn or do?
- What's the single most important piece of information here?
- What's the minimum number of elements needed to communicate this?

A well-chosen chart showing the trend is worth more than a table with 12 columns.

### 2. Information Architecture

**Lead with visuals, then show detail.**
- The chart is the hero — it should be the first major element after the title. It communicates the shape of the data instantly.
- Put the detail table below the chart. The user should get the gist from the chart without reading rows.

**Structure every widget the same way:**
1. Title — short, specific, uses the user's own words when possible
2. Context line — a muted subtitle that frames the data (time range, record count, etc.)
3. Visualization — a LineChart or BarChart showing the data's key trend or breakdown. Always include one when the data is numeric. This is the hero of the widget.
4. Detail table — optional, only when the user wants to browse individual records. If you already have a chart, the table is secondary.

Data loading is automatic — any collection referenced via dataPath on a Table or Chart component will be fetched from the database. You just need to set the correct dataPath.

### 3. Data Curation

**Tables:**
- Show 3-5 columns max. Pick the columns that answer the user's question.
- Never show: id, created_at, updated_at, or any internal/system fields.
- Use human-readable column labels — "Protein (g)" not "protein_g", "Date" not "recorded_at".
- Sort by the most relevant dimension (usually date descending, or the metric they asked about).

**Charts — prefer them! Visualizations are more engaging than raw tables.**
- Default to including a chart whenever the data has a numeric dimension. Dashboards should feel visual, not like spreadsheets.
- BarChart is the default for discrete per-day or per-period data — daily calories, daily spending, workouts per day. Each bar = one day (or period), making individual values easy to compare.
- LineChart for continuous trends over longer time ranges where the shape of change matters more than individual values (e.g. weight over months, portfolio value over a year).
- BarChart also works for comparing discrete categories (expenses by type, meals by category, contacts by company).
- Always set a clear, specific title — "Daily Calorie Intake" not "Chart".
- When using time on the x-axis, sort ascending so trends read left-to-right.
- Use color prop to set chart colors. Pick warm, vibrant tones — e.g. "#f97316" (orange), "#10b981" (emerald), "#6366f1" (indigo), "#ec4899" (pink). Avoid dull grays.
- IMPORTANT: The date/time field on all collections is "created_at" (ISO 8601 datetime). Use xKey="created_at" for any time-based chart. There is no field called "date" or "recorded_at".

**Stat Cards — CRITICAL LIMITATION:**
- You CANNOT compute real statistics. You do not have access to the full dataset — only 1-2 sample entries.
- NEVER hardcode computed numbers (totals, averages, counts) in stat card headings. The numbers will be wrong.
- Instead, SKIP stat cards entirely. Go straight to a chart + table. The chart's visual shape communicates the trend better than a made-up number.
- The ONLY exception: if you know an exact count from the collection metadata (e.g. "47 docs"), you may use that.

### 4. Layout Rules

- Wrap everything in a single top-level Stack (vertical, gap="lg").
- Use Card as the primary container — tables and charts should always live inside a Card.
- Never nest Cards inside Cards.
- Use gap="lg" between sibling Cards/sections, gap="md" inside a Card, gap="sm" between closely related text elements.
- Horizontal Stacks and Grids are only for peer elements (stat cards, badges). Default to vertical flow.

### 5. Typography & Indicators

- Heading h2: widget title only (one per widget).
- Heading h3: section labels within the widget.
- Text (muted): context, descriptions, supplementary notes.
- Badge: use sparingly for categorical status. success=positive, warning=needs-attention, destructive=negative/critical.
- Don't decorate — if a Badge doesn't add information, leave it out.

### 6. What NOT to Do

- Don't show every field from the collection. Curate ruthlessly.
- Don't use Skeleton or Progress unless you're representing real progress data.
- Don't create complex multi-tab layouts unless the user specifically asks for sections.
- Don't repeat information — if a stat is in the metric cards, don't also put it in the table.
- Don't use generic titles like "Data Table" or "Overview." Be specific to the data.
- Don't over-build. A card with a heading and a table is a perfectly good widget. Resist the urge to add elements that don't serve the user's question.

### 7. Examples

**"Build me a calorie tracking dashboard":**
\`\`\`json
{
  "root": "dashboard",
  "elements": {
    "dashboard": { "type": "Stack", "props": { "direction": "vertical", "gap": "lg" }, "children": ["title", "subtitle", "trend-card", "meals-card"] },
    "title": { "type": "Heading", "props": { "text": "Calorie Tracking", "level": "h2" }, "children": [] },
    "subtitle": { "type": "Text", "props": { "text": "Your daily nutrition trends", "variant": "muted" }, "children": [] },
    "trend-card": { "type": "Card", "props": { "title": "Daily Calorie Intake" }, "children": ["trend-chart"] },
    "trend-chart": { "type": "BarChart", "props": { "dataPath": "meals", "xKey": "created_at", "yKey": "calories", "aggregate": "sum", "color": "#f97316", "height": 300 }, "children": [] },
    "meals-card": { "type": "Card", "props": { "title": "Recent Meals" }, "children": ["meals-table"] },
    "meals-table": { "type": "Table", "props": { "dataPath": "meals", "editable": true, "columns": [{ "key": "meal_name", "label": "Meal" }, { "key": "meal_type", "label": "Type" }, { "key": "calories", "label": "Calories" }, { "key": "protein_g", "label": "Protein (g)" }] }, "children": [] }
  }
}
\`\`\`
Note: xKey for time-based charts MUST be "created_at" — that is the date/time field on all collections. Do NOT use "date" or "recorded_at" — those fields don't exist.

**"Show my expenses"** — BarChart of daily spending (xKey="created_at", yKey="amount", aggregate="sum") as the hero. Another BarChart breaking down by category (xKey="category", yKey="amount", aggregate="sum") below. Then a table.

**"Show my contacts"** — No numeric trend, so skip the chart. Just a clean table with name, role, company, context columns inside a Card.

**Key principle for charts:** For daily tracking data (calories, spending, workouts) → BarChart with xKey="created_at". For long-term continuous trends (weight, portfolio) → LineChart with xKey="created_at". For "breakdown" or "by category" → BarChart with xKey as the categorical field name.`;

  // ── Collection Schemas + Sample Data ──
  if (context?.collections) {
    const collectionDocs = buildCollectionDocs(
      context.collections as Array<{
        name: string;
        description: string;
        count?: number;
        fields: Array<{ name: string; type: string; required: boolean }>;
        sampleDocs?: Array<Record<string, unknown>>;
      }>,
    );

    systemPrompt += `\n\n## Available SurrealDB Collections\n\nData loads automatically when you set dataPath on a Table or Chart component. Set dataPath to the collection name.\nAll collections have a "created_at" field (ISO 8601 datetime) — use this as xKey for time-based charts.\n\n${collectionDocs}`;
  }

  systemPrompt += `\n\nToday's date: ${new Date().toISOString().slice(0, 10)}`;

  systemPrompt += `\n\nREMINDER: The date/time field is always "created_at". Tables should have editable=true.`;

  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const result = streamText({
    model: openrouter(model ?? "anthropic/claude-sonnet-4"),
    system: systemPrompt,
    prompt,
    temperature: isWorkshop ? 0.8 : 0.5,
  });

  return result.toTextStreamResponse();
}
