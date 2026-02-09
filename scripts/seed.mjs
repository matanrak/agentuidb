#!/usr/bin/env node

// Sends 20 realistic messages per category through the chat agent
// Usage: node seed.mjs
// Reads .env automatically

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// Load .env
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && !k.startsWith("#")) process.env[k.trim()] = v.join("=").trim();
  }
} catch {}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL ?? "anthropic/claude-sonnet-4";

if (!OPENROUTER_KEY) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }
if (!process.env.AGENTUIDB_URL) { console.error("Set AGENTUIDB_URL"); process.exit(1); }

// --- MCP server ---
const projectRoot = new URL("..", import.meta.url).pathname;
const mcp = spawn("node", ["mcp/dist/index.js"], {
  cwd: projectRoot,
  env: { ...process.env },
  stdio: ["pipe", "pipe", "pipe"],
});

let mcpBuffer = "";
let mcpReqId = 0;
const mcpPending = new Map();

mcp.stdout.on("data", (chunk) => {
  mcpBuffer += chunk.toString();
  const lines = mcpBuffer.split("\n");
  mcpBuffer = lines.pop() ?? "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const msg = JSON.parse(t);
      if (msg.id !== undefined && mcpPending.has(msg.id)) {
        mcpPending.get(msg.id)(msg);
        mcpPending.delete(msg.id);
      }
    } catch {}
  }
});
mcp.stderr.on("data", () => {});

function mcpSend(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++mcpReqId;
    mcpPending.set(id, resolve);
    mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

let currentOverrideDate = null;

async function mcpCallTool(name, args) {
  // Inject created_at override for insert_document during seeding
  if (name === "insert_document" && currentOverrideDate && args.data) {
    const h = 8 + Math.floor(Math.random() * 12); // 8am–8pm
    const m = Math.floor(Math.random() * 60);
    args.data.created_at = `${currentOverrideDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  }
  const resp = await mcpSend("tools/call", { name, arguments: args });
  if (resp.error) return JSON.stringify({ error: resp.error });
  return resp.result?.content?.[0]?.text ?? "{}";
}

function generateDates(count, daysBack = 45) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor((daysBack * (count - 1 - i)) / (count - 1));
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function discoverTools() {
  const resp = await mcpSend("tools/list", {});
  return (resp.result?.tools ?? []).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
  }));
}

let tools = [];

// --- Read SKILL.md ---
let skillPrompt = "";
try {
  skillPrompt = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
  skillPrompt = skillPrompt.replace(/^---[\s\S]*?---\n*/, "");
} catch {
  skillPrompt = "You have access to structured data storage tools. Use them silently to store data from the user's messages.";
}

// --- Seed data ---
const messages_by_category = {
  meals: [
    "Had a chicken caesar salad for lunch",
    "Grabbed a breakfast burrito this morning — eggs, beans, cheese, salsa",
    "Just had two slices of pepperoni pizza",
    "Made a smoothie with banana, peanut butter, oat milk, and protein powder",
    "Had sushi for dinner — salmon roll and tuna nigiri",
    "Ate a bowl of oatmeal with blueberries and honey for breakfast",
    "Just had a huge pad thai from the Thai place",
    "Had a grilled chicken sandwich with fries for lunch",
    "Made pasta with pesto and grilled vegetables for dinner",
    "Had a protein bar and a banana as a snack",
    "Grabbed a croissant and cappuccino for breakfast",
    "Had a poke bowl with tuna, rice, avocado, and edamame",
    "Made a steak with roasted potatoes and asparagus",
    "Had a Greek yogurt with granola and berries",
    "Ate a turkey club sandwich for lunch",
    "Had fish tacos for dinner — three of them with slaw and lime",
    "Made a big green salad with grilled shrimp and avocado dressing",
    "Had chicken tikka masala with naan for dinner",
    "Grabbed a bagel with cream cheese and smoked salmon",
    "Had a veggie burger with sweet potato fries",
  ],
  contacts: [
    "Met Rachel Kim at the product meetup, she's a PM at Figma",
    "Ran into Tom Bradley from college, he's now a data scientist at Netflix",
    "Had coffee with Priya Sharma, she runs engineering at a startup called Vanta",
    "Met David Chen at the conference, he's CTO of Replit",
    "Was introduced to Sofia Martinez, she's head of design at Linear",
    "Chatted with James O'Brien, he's a partner at Sequoia",
    "Met Lisa Park from Notion, she's a senior PM on the API team",
    "Got connected with Marcus Johnson, he does ML research at DeepMind",
    "Ran into Emily Watson, she left Google and is now founder of a climate tech startup",
    "Met Chris Taylor at the hackathon, he's a senior engineer at Vercel",
    "Had lunch with Anna Liu, she's VP of Product at Anthropic",
    "Was introduced to Ben Foster, he runs sales at Datadog",
    "Met Kenji Tanaka at the AI meetup, he's a researcher at OpenAI",
    "Chatted with Maria Santos, she's CTO at DataFlow",
    "Met Alex Rivera, he's a founding engineer at Cursor",
    "Ran into Sarah Connor, she's now head of growth at Supabase",
    "Met Dmitri Volkov at the conference, he's a principal engineer at Stripe",
    "Had coffee with Nina Patel, she's a design lead at Apple",
    "Met Jordan Lee, he's building a dev tools startup called Warp",
    "Was introduced to Claire Dubois, she's head of partnerships at Mistral",
  ],
  expenses: [
    "Spent $85 on groceries at Trader Joe's",
    "Uber to the airport was $52",
    "Bought a new keyboard for $150 on Amazon",
    "Coffee and pastry at Blue Bottle was $12",
    "Monthly gym membership charged $45",
    "Dinner with friends at the Italian place was $78",
    "Gas for the car was $55",
    "Bought two books on Amazon for $35",
    "Haircut was $40 plus a $10 tip",
    "Netflix subscription renewed at $15",
    "Bought a new pair of running shoes for $130",
    "Parking downtown was $18",
    "Dry cleaning pickup was $28",
    "Spotify premium renewed at $12",
    "Grabbed lunch takeout for $16",
    "Uber to the restaurant was $22",
    "Movie tickets for two were $32",
    "Bought a birthday gift for mom, $65 at Nordstrom",
    "Phone bill was $85 this month",
    "Picked up wine for the dinner party, $42",
  ],
  workouts: [
    "Ran 5k this morning in 23:45",
    "Did a 45-minute strength training session — chest and triceps",
    "Went for a 30-minute swim, did about 1200 meters",
    "Rode my bike for 20 miles, took about 1 hour 15 minutes",
    "Did a HIIT class at the gym, 40 minutes, burned maybe 500 cal",
    "Morning yoga session for 60 minutes",
    "Ran 10k in 48:30, new personal best",
    "Did legs day at the gym — squats, lunges, leg press. 50 minutes",
    "Went rock climbing for 2 hours at the indoor gym",
    "Did a 20-minute core workout at home — planks, crunches, leg raises",
    "Played pickup basketball for an hour",
    "Ran 3 miles easy pace, about 27 minutes",
    "Did back and biceps at the gym, 45 minutes",
    "Went for a long hike, about 8 miles in 3 hours",
    "Did a 30-minute rowing machine session, 6000 meters",
    "Morning run, 7k in 33 minutes",
    "Played tennis for an hour, won 2 sets",
    "Did a full body CrossFit WOD, 35 minutes",
    "Went surfing for 2 hours at the beach",
    "Did shoulder and arms day, 40 minutes at the gym",
  ],
  health_metrics: [
    "Weighed in at 81.2kg this morning",
    "Blood pressure was 118/76 this morning",
    "Resting heart rate is 58 bpm",
    "Got 7.5 hours of sleep last night",
    "Weight is 80.8kg today",
    "Blood pressure reading: 122/80",
    "Resting heart rate down to 56 bpm",
    "Slept 8 hours, sleep score was 87",
    "Weight: 81.0kg",
    "Blood sugar was 95 mg/dL fasting",
    "Got 6.5 hours of sleep, not great",
    "Weight dropped to 80.5kg",
    "Blood pressure: 120/78",
    "Resting heart rate: 57 bpm",
    "Slept 7 hours, deep sleep was 1.5 hours",
    "Weight: 80.3kg, trending down",
    "Blood oxygen was 98%",
    "Got 8.5 hours of sleep, feel great",
    "Weight: 80.1kg",
    "Heart rate variability was 45ms",
  ],
  travel: [
    "My flight to London is March 15, BA 287, departs JFK at 10pm",
    "Booked a hotel in Paris, Hotel Le Marais, March 20-23, $180/night",
    "Train from London to Paris on March 18, Eurostar at 2pm",
    "Flight back from Paris on March 24, AF 682, departs CDG at 11am",
    "Rental car booked in LA for April 5-8, Hertz, pickup at LAX",
    "Flight to San Francisco April 10, UA 337, departs at 7am from JFK",
    "Booked Airbnb in SF, Mission District, April 10-14, $200/night",
    "Flight to Tokyo May 1, JAL 5, departs JFK at 1pm",
    "Hotel in Tokyo, Park Hyatt, May 1-5, booked through Amex",
    "Bullet train from Tokyo to Kyoto on May 3, reserved seats at 9am",
    "Flight home from Tokyo May 6, ANA 9, departs Narita at 5pm",
    "Road trip to Portland planned for June 1-4, driving up the coast",
    "Booked cabin in Lake Tahoe for July 4th weekend, $250/night",
    "Flight to Austin for SXSW, March 8, SW 1422, departs at 6am",
    "Hotel in Austin, The Line, March 8-12, $220/night",
    "Flight to Denver April 20, UA 567, departs at noon",
    "Airbnb in Denver, LoHi neighborhood, April 20-22",
    "Train from NYC to DC on February 28, Amtrak Acela at 3pm",
    "Flight to Miami for spring break, March 28, AA 1105, 8am departure",
    "Booked resort in Cancun for June 15-20, all-inclusive, $300/night",
  ],
  meetings: [
    "Had a 1-on-1 with Sarah about the Q2 roadmap, she wants to prioritize the mobile app",
    "Team standup — blocked on the API migration, waiting on DevOps",
    "Met with the Figma team about API pricing, they're open to a partnership deal",
    "Sprint retrospective — team wants shorter sprint cycles, moving to 1-week sprints",
    "Had a design review for the new onboarding flow with the UX team",
    "Board meeting update — ARR is at $4.2M, targeting $6M by EOY",
    "Customer call with Acme Corp — they want SSO and audit logs before signing",
    "1-on-1 with Jake about his promotion path, targeting senior by Q3",
    "Product planning meeting — decided to kill the analytics dashboard feature",
    "Met with legal about the new privacy policy updates for EU compliance",
    "Sales pipeline review — 3 enterprise deals in late stage, worth $500k total",
    "Architecture review for the microservices migration with the platform team",
    "Had a brainstorm session for the AI features roadmap with PM and engineering",
    "Customer success sync — churn rate dropped to 3.2% this month",
    "Interview debrief for the senior backend role — strong yes on candidate 2",
    "Weekly sync with the marketing team about the product launch in April",
    "Met with AWS account manager about reserved instance pricing",
    "All-hands meeting — CEO announced the Series B, $25M at $200M valuation",
    "Had a skip-level with my director about team morale and hiring plans",
    "Demo day prep meeting — presenting the AI feature to investors next Tuesday",
  ],
};

// --- Send messages through the agent ---

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[1;36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

async function sendToAgent(userMsg, conversationMessages) {
  conversationMessages.push({ role: "user", content: userMsg });

  let toolRounds = 0;
  const MAX_TOOL_ROUNDS = 5;
  const allToolsCalled = [];

  while (true) {
    const useTools = toolRounds < MAX_TOOL_ROUNDS ? tools : undefined;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, messages: conversationMessages, ...(useTools && { tools: useTools }) }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { error: `API ${resp.status}: ${err}`, toolsCalled: allToolsCalled };
    }

    const json = await resp.json();
    const msg = json.choices?.[0]?.message;
    if (!msg) return { error: "No response", toolsCalled: allToolsCalled };

    conversationMessages.push(msg);

    if (msg.tool_calls?.length) {
      toolRounds++;
      for (const call of msg.tool_calls) {
        const name = call.function.name;
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        const result = await mcpCallTool(name, args);
        allToolsCalled.push({ name, success: !JSON.parse(result).error });
        conversationMessages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      if (toolRounds >= MAX_TOOL_ROUNDS) {
        return { response: "(hit tool limit)", toolsCalled: allToolsCalled };
      }
      continue;
    }

    return { response: msg.content ?? "(empty)", toolsCalled: allToolsCalled };
  }
}

async function main() {
  // Init MCP
  await mcpSend("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "seed", version: "1.0.0" },
  });
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

  tools = await discoverTools();

  const baseSystemContent = skillPrompt + "\n\nToday's date: " + new Date().toISOString().slice(0, 10);

  // Build system prompt with current collection schemas
  async function buildSystemPrompt() {
    let systemContent = baseSystemContent;
    const collectionsJson = await mcpCallTool("list_collections", {});
    const collections = JSON.parse(collectionsJson);
    if (collections.length) {
      const schemas = [];
      for (const col of collections) {
        const schemaJson = await mcpCallTool("get_collection_schema", { collection: col.name });
        schemas.push(JSON.parse(schemaJson));
      }
      const ctx = schemas.map((s) => {
        const fields = s.fields.map((f) => `    ${f.name}: ${f.type}${f.required ? " (required)" : ""}`).join("\n");
        return `- ${s.name} (${s.count} docs): ${s.description}\n${fields}`;
      }).join("\n\n");
      systemContent += `\n\n## Existing Collections\n\nThese collections already exist. Use them directly with insert_document — do NOT call list_collections or get_collection_schema unless the user asks about a collection you don't recognize.\n\n${ctx}`;
    }
    return systemContent;
  }

  const categories = Object.keys(messages_by_category);
  const total = categories.reduce((sum, cat) => sum + messages_by_category[cat].length, 0);
  let done = 0;
  let errors = 0;

  console.log(`\n${cyan("AgentUIDB Seed")} — sending ${total} messages across ${categories.length} categories\n`);

  for (const category of categories) {
    const msgs = messages_by_category[category];
    const dates = generateDates(msgs.length, 45);
    console.log(`${cyan(category)} (${msgs.length} messages, ${dates[0]} → ${dates[dates.length - 1]})`);

    // Fresh conversation per category — re-load schemas so the model knows about
    // collections created in previous categories without dragging a huge context
    const systemContent = await buildSystemPrompt();
    const conversationMessages = [{ role: "system", content: systemContent }];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      currentOverrideDate = dates[i];
      done++;
      const short = msg.length > 70 ? msg.slice(0, 70) + "..." : msg;
      process.stdout.write(`  ${dim(`[${done}/${total}]`)} ${dim(dates[i])} ${short} `);

      const result = await sendToAgent(`${msg} on ${dates[i]}`, conversationMessages);

      if (result.error) {
        process.stdout.write(`${red("ERR")} ${dim(result.error)}\n`);
        errors++;
      } else {
        const hasInsert = result.toolsCalled.some((t) => t.name === "insert_document" && t.success);
        const toolSummary = result.toolsCalled
          .map((t) => t.success ? green(t.name) : red(t.name))
          .join(", ");
        process.stdout.write(`${toolSummary || dim("(no tools)")}`);
        if (!hasInsert && result.response) {
          // Show model response when it didn't insert — helps debug
          const respShort = result.response.length > 80 ? result.response.slice(0, 80) + "..." : result.response;
          process.stdout.write(` ${yellow(respShort)}`);
        }
        process.stdout.write("\n");
      }

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log();
  }

  console.log(`${cyan("Done!")} ${done - errors} succeeded, ${errors} errors\n`);
  mcp.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  mcp.kill();
  process.exit(1);
});
