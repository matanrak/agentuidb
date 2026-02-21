import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getDb } from "@agentuidb/core/db";
import { escIdent } from "@agentuidb/core/query";
import { catalog } from "@/lib/render/catalog";
import { DEFAULT_MODEL } from "../constants";

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

interface CollectionInfo {
  name: string;
  description: string;
  count: number;
  fields: Array<{ name: string; type: string; required: boolean }>;
  sampleDocs: Record<string, unknown>[];
}

function loadCollections(sampleCount = 3): CollectionInfo[] {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM _collections_meta ORDER BY name ASC")
      .all() as Record<string, unknown>[];

    return rows.map((row) => {
      const fields =
        typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields;
      let count = 0;
      let sampleDocs: Record<string, unknown>[] = [];
      const name = String(row.name);

      try {
        const countRow = db
          .prepare(`SELECT COUNT(*) as count FROM \`${escIdent(name)}\``)
          .get() as { count: number } | undefined;
        count = countRow?.count ?? 0;
      } catch { /* table may not exist */ }

      if (sampleCount > 0) {
        try {
          const docs = db
            .prepare(
              `SELECT * FROM \`${escIdent(name)}\` ORDER BY created_at DESC LIMIT ?`,
            )
            .all(sampleCount) as Record<string, unknown>[];
          sampleDocs = docs.map((doc) => {
            const result: Record<string, unknown> = {};
            let expandedData: Record<string, unknown> | null = null;
            for (const [key, val] of Object.entries(doc)) {
              if (typeof val === "string") {
                const trimmed = val.trim();
                if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                  try {
                    const parsed = JSON.parse(val);
                    if (key === "data" && typeof parsed === "object" && !Array.isArray(parsed)) {
                      expandedData = parsed;
                      continue;
                    }
                    result[key] = parsed;
                    continue;
                  } catch { /* not JSON */ }
                }
              }
              result[key] = val;
            }
            return expandedData ? { ...result, ...expandedData } : result;
          });
        } catch { /* ignore */ }
      }

      return { name, description: String(row.description ?? ""), count, fields, sampleDocs };
    });
  } catch {
    return [];
  }
}

function buildCollectionDocs(collections: CollectionInfo[]): string {
  return collections.map((col) => {
    const fields = col.fields
      .map((f: { name: string; type: string; required: boolean }) =>
        `    ${f.name}: ${f.type}${f.required ? " (required)" : ""}`)
      .join("\n");

    let section = `- ${col.name} (${col.count} docs): ${col.description}\n${fields}`;

    if (col.sampleDocs.length > 0) {
      const samples = col.sampleDocs.map((doc) => {
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
    console.error("[/api/generate] OPENROUTER_API_KEY is not set");
    return new Response(JSON.stringify({ error: "AI provider not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isWorkshop = mode === "workshop";
  let systemPrompt = isWorkshop ? WORKSHOP_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;

  // ── Design Guidelines ──
  systemPrompt += `

## #1 RULE — ALL DATA MUST BE LIVE

You are building data-connected widgets. EVERY data value the user sees MUST come from a live database query via \`dataPath\` on a Table or Chart component.

NEVER hardcode data into element props. This means:
- NO hardcoded counts ("41 documents") in Text or Badge
- NO hardcoded field lists or column names as text
- NO hardcoded statistics, averages, or totals
- NO hardcoded values copied from the collection metadata or sample data

The collection metadata and sample docs you receive are for understanding the SCHEMA — never copy values from them into your output.

If something can't be shown via a Table or Chart with dataPath, DON'T show it. A widget with zero hardcoded data and one live Table is better than a beautiful widget full of stale text.

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

**Reminder:** Static text is ONLY for titles and labels ("Your Meals", "Daily Calories"). All data values must come from dataPath.

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

- NEVER hardcode data values in Text, Badge, or Heading props. If the value comes from the database, it must be shown via a Table or Chart with dataPath — not as static text.
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

**Key principle for charts:** For daily tracking data (calories, spending, workouts) → BarChart with xKey="created_at". For long-term continuous trends (weight, portfolio) → LineChart with xKey="created_at". For "breakdown" or "by category" → BarChart with xKey as the categorical field name.

### 8. Data Transforms

To create derived datasets, add a special \`_transforms\` element in the elements map. This element is never rendered (don't add it to any children array). Components then reference the derived data via dataPath.

**CRITICAL: Transforms go inside elements, NOT at the top level.**

\`\`\`json
{
  "root": "dashboard",
  "elements": {
    "_transforms": {
      "type": "_Transforms",
      "props": {
        "transforms": [
          {
            "source": "meals",
            "output": "daily_totals",
            "steps": [
              {
                "type": "groupAggregate",
                "groupBy": "created_at",
                "granularity": "day",
                "aggregations": [
                  { "field": "calories", "method": "sum", "as": "total_calories" },
                  { "field": "protein_g", "method": "avg", "as": "avg_protein" }
                ]
              }
            ]
          },
          {
            "source": "daily_totals",
            "output": "over_limit_days",
            "steps": [
              { "type": "filter", "key": "total_calories", "operator": "gt", "value": 2000 },
              { "type": "sort", "key": "total_calories", "order": "desc" }
            ]
          }
        ]
      },
      "children": []
    },
    "dashboard": { "type": "Stack", "props": { "direction": "vertical", "gap": "lg" }, "children": ["chart-card", "table-card"] },
    "chart-card": { "type": "Card", "props": { "title": "Daily Calories" }, "children": ["chart"] },
    "chart": { "type": "BarChart", "props": { "dataPath": "daily_totals", "xKey": "label", "yKey": "total_calories", "color": "#f97316", "height": 300, "referenceLine": 2000, "thresholdColor": "#ef4444" }, "children": [] },
    "table-card": { "type": "Card", "props": { "title": "Over-Limit Days" }, "children": ["table"] },
    "table": { "type": "Table", "props": { "dataPath": "over_limit_days", "columns": [{ "key": "label", "label": "Date" }, { "key": "total_calories", "label": "Calories" }] }, "children": [] }
  }
}
\`\`\`

**IMPORTANT:** Do NOT add "_transforms" to any element's children array — it is a data-only element that must not be rendered.

**Available step types:**
- \`groupAggregate\`: Group rows by a field and compute aggregations (sum/count/avg/min/max). Use \`granularity\` ("day"/"week"/"month"/"year") for date fields. Produces rows with a \`label\` field (formatted date) and \`_group\` field (raw group key), plus your named aggregation fields.
- \`filter\`: Keep rows matching a condition. Operators: "gt", "lt", "gte", "lte", "eq", "neq".
- \`sort\`: Sort rows by a field. Order: "asc" or "desc".
- \`compute\`: Add a computed field. E.g. \`{ "type": "compute", "field": "total_calories", "operator": "gt", "value": 2000, "as": "over_limit" }\` adds a boolean \`over_limit\` field. Arithmetic operators (add/sub/mul/div) produce numbers.

Transforms chain: each step's output feeds the next. One transform's output can be another's source. Components use \`dataPath: "over_limit_days"\` to reference the derived dataset.

**When to use transforms:**
- User asks about aggregated data (e.g., "which days...", "total per week", "average by category")
- User wants filtered/derived views (e.g., "only days over 2000 calories")
- You need the same data aggregated differently for a table vs a chart
- A Table needs to show computed/aggregated data (transforms do the aggregation, Table just displays it)

**Important:** When using transforms, the source collection must still be referenced by at least one component's dataPath OR by the transform itself. The system auto-loads collections referenced in transforms.

**When using transforms with BarChart:** If the transform already aggregates the data (e.g. groupAggregate sums calories per day), do NOT also set \`aggregate\` on the BarChart — the data is already aggregated. Use \`xKey: "label"\` (the formatted date from the transform) and \`yKey\` pointing to your aggregation field name.

### 9. Thresholds, Limits & Conditional Colors

**Simple threshold (BarChart shorthand):**
- \`referenceLine\`: number — draws a dashed horizontal line at this value
- \`referenceLineLabel\`: string — label for the line
- \`thresholdColor\`: string — bars exceeding the referenceLine turn this color

**Advanced conditional colors (BarChart):**
- \`colorRules\`: array of rules, each with a condition and color. First matching rule wins.
- Example: \`colorRules: [{ condition: { field: "calories", operator: "gt", value: 2000 }, color: "#ef4444" }, { condition: { field: "calories", operator: "gt", value: 1500 }, color: "#f59e0b" }]\`
- This creates a traffic-light effect: >2000 = red, >1500 = amber, rest = default color.

**Table filter prop:**
- \`filter\`: array of conditions to show only matching rows.
- Each condition: \`{ key: "fieldName", operator: "gt"|"lt"|"gte"|"lte"|"eq"|"neq", value: number|string }\`

**Proactive reference lines:** When building a BarChart for health, fitness, or budget data, ALWAYS consider adding a \`referenceLine\` at a well-known guideline value — even if the user didn't explicitly ask for one. A reference line adds instant context and makes the chart far more useful. Use your domain knowledge to pick the right value and label. Examples:
- **Daily protein intake** → \`referenceLine: 50, referenceLineLabel: "50g recommended"\` (the FDA daily value for adults)
- **Daily spending / budget** → If the user tracks expenses and mentions a budget (e.g., $100/day), add \`referenceLine: 100, referenceLineLabel: "$100 budget"\`. If no budget is mentioned, skip it — don't guess financial limits.
- **Daily water intake** → \`referenceLine: 2000, referenceLineLabel: "2L goal"\` (commonly recommended ~8 cups / 2 liters per day, tracked in mL)

The goal: if a standard guideline exists for the metric being charted, include a reference line so the user can instantly see how they're doing relative to the benchmark.

### 10. CompositeChart

Use \`CompositeChart\` to overlay multiple data series on one chart. Perfect for comparing metrics or adding reference lines alongside data.

\`\`\`json
{
  "type": "CompositeChart",
  "props": {
    "dataPath": "meals",
    "xKey": "created_at",
    "aggregate": "sum",
    "height": 300,
    "layers": [
      { "type": "bar", "yKey": "calories", "color": "#f97316", "colorRules": [{ "condition": { "field": "calories", "operator": "gt", "value": 2000 }, "color": "#ef4444" }] },
      { "type": "line", "yKey": "protein_g", "color": "#10b981" },
      { "type": "referenceLine", "y": 2000, "color": "#ef4444", "label": "2000 cal limit" }
    ]
  }
}
\`\`\`

Layer types: "bar", "line", "area", "referenceLine". All data layers share the same dataPath and aggregate. Use when you need multiple metrics on one axis.

**Example — "Show days I went over 2000 calories":**
Use transforms to create \`daily_totals\` (groupAggregate meals by day, sum calories) and \`over_limit_days\` (filter where total > 2000). Show a BarChart on \`daily_totals\` with referenceLine=2000 and thresholdColor="#ef4444". Show a Table on \`over_limit_days\` with columns for date and total calories.`;

  // ── Collection Schemas + Sample Data (loaded server-side) ──
  const collections = loadCollections(3);
  if (collections.length > 0) {
    const collectionDocs = buildCollectionDocs(collections);
    const validNames = collections.map((c) => `"${c.name}"`).join(", ");
    systemPrompt += `\n\n## Available Collections

CRITICAL: The ONLY valid dataPath values are:
1. An exact collection name from this list: ${validNames}
2. The "output" name of a transform you defined in a _transforms element

Any other dataPath value will fail silently and show no data. Do NOT invent collection names. Do NOT guess. If a collection doesn't exist for what the user wants, tell them.

All collections have a "created_at" field (ISO 8601 datetime) — use this as xKey for time-based charts.

${collectionDocs}`;
  } else {
    systemPrompt += `\n\nNo collections exist in the database yet. Tell the user they need to create some data first.`;
  }

  systemPrompt += `\n\nToday's date: ${new Date().toISOString().slice(0, 10)}`;

  systemPrompt += `\n\nREMINDER: The date/time field is always "created_at". Tables should have editable=true.\n\nFINAL CHECK before outputting your spec: scan every element. If ANY element has a data value hardcoded in its props (a number, a count, field names, statistics, or anything copied from the collection metadata above), REMOVE it. Replace it with a Table or Chart that uses dataPath, or delete the element entirely. Zero tolerance for hardcoded data.`;

  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const result = streamText({
    model: openrouter(model ?? DEFAULT_MODEL),
    system: systemPrompt,
    prompt,
    temperature: isWorkshop ? 0.8 : 0.5,
  });

  return result.toTextStreamResponse();
}
