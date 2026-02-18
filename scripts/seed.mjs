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
const MODEL = process.env.MODEL ?? "minimax/minimax-m2.5";

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

async function mcpCallTool(name, args, overrideDate) {
  // Inject created_at override for insert_document during seeding
  if (name === "insert_document" && overrideDate && args.data) {
    const h = 8 + Math.floor(Math.random() * 12); // 8am–8pm
    const m = Math.floor(Math.random() * 60);
    args.data.created_at = `${overrideDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
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

// --- Seed data: 3 core use cases ---
const messages_by_category = {
  meals: [
    // --- Day-by-day realistic logging, 2-3 meals per day ---
    // Week 1
    "Two eggs scrambled with toast and black coffee this morning",
    "Chicken caesar salad from Sweetgreen for lunch, added avocado",
    "Made salmon with roasted asparagus and quinoa for dinner",
    "Grabbed a breakfast burrito — eggs, beans, cheese, salsa",
    "Big bowl of pho from the Vietnamese spot on 3rd for lunch",
    "Ordered Thai for dinner — pad see ew with chicken and a Thai iced tea",
    "Oatmeal with banana, walnuts, and a drizzle of honey",
    "Turkey and swiss on rye with mustard for lunch, pickle on the side",
    "Cooked a steak at home — NY strip, medium rare, garlic mashed potatoes and sauteed spinach",
    "Skipped breakfast, just had a large cold brew with oat milk",
    "Had a massive burrito bowl at Chipotle — double chicken, black beans, rice, guac",
    "Went to the Italian place with Sarah for dinner — mushroom risotto, she got the bolognese",
    "Made avocado toast on sourdough with everything seasoning and a fried egg",
    "Grabbed two slices of pepperoni pizza from Joe's for lunch",
    "Simple dinner — roasted chicken breast with sweet potatoes and green beans",
    "Greek yogurt parfait with granola, blueberries, and a little honey for breakfast",
    "Poke bowl for lunch — salmon, tuna, rice, avocado, edamame, spicy mayo",
    "Had ramen at the new place downtown — tonkotsu with extra egg",
    "Protein shake after the gym — chocolate whey, banana, almond milk",
    // Week 2
    "Grabbed a croissant and a latte from the French bakery on 5th",
    "Had a falafel wrap from the halal cart for lunch, tahini and hot sauce",
    "Made chicken stir-fry with broccoli, bell peppers, soy sauce, over rice",
    "Smoothie this morning — spinach, banana, protein powder, almond butter, oat milk",
    "Leftover stir-fry from last night for lunch, added some extra soy sauce",
    "Grilled chicken tacos for dinner — pico de gallo and guacamole, three of them",
    "Two slices of leftover pizza for breakfast, no shame",
    "Soup and half sandwich combo from Panera — tomato soup and turkey sandwich",
    "Had Indian takeout for dinner — chicken tikka masala, garlic naan, basmati rice",
    "Bagel with lox, cream cheese, capers, and red onion from Russ & Daughters",
    "Sushi lunch special — 8 pieces of nigiri and a miso soup",
    "Made a big pot of chili for dinner — ground turkey, kidney beans, tomatoes, corn",
    "Overnight oats with chia seeds, maple syrup, and mixed berries",
    "Big Cobb salad for lunch — grilled chicken, bacon, egg, blue cheese",
    "Cooked shrimp scampi with linguine and a side salad",
    "Had an apple with peanut butter as a snack around 3pm",
    "Pancakes with butter and maple syrup for breakfast, two strips of bacon",
    "Had a lobster roll at the seafood place by the pier for lunch",
    "Made a veggie curry with chickpeas, coconut milk, spinach, over jasmine rice",
    // Week 3
    "Just a banana and a handful of almonds on the way out this morning",
    "Made a tuna salad sandwich at home for lunch, had it with some chips",
    "Sushi dinner at Nobu with the team — omakase, probably 1200 calories all in",
    "Greek yogurt with honey and walnuts for breakfast",
    "Grabbed a quick Sweetgreen — kale caesar with chicken",
    "Burger and fries at Five Guys — little bacon cheeseburger with everything",
    "Eggs benedict and a cold brew for breakfast at the brunch spot",
    "Had a falafel plate for lunch — hummus, tabbouleh, pita, pickled turnips",
    "Pasta carbonara from scratch — pancetta, egg, pecorino, black pepper",
    "Protein bar and a banana on the way to a meeting",
    "Poke bowl again for lunch, went with spicy tuna this time",
    "Went out for Korean BBQ with David and Nina — tons of meat, banchan, soju",
    "Scrambled eggs with cheddar, hot sauce, and a side of fruit",
    "Leftover chili for lunch, topped with sour cream and cheddar",
    "Made salmon again tonight — this time with a miso glaze and bok choy",
    "Grabbed an acai bowl with granola as an afternoon snack",
    "Smoothie bowl — frozen berries, protein powder, granola, coconut flakes",
    "Chicken shawarma plate from the Mediterranean spot for lunch",
    "Homemade pizza night — margherita with fresh mozzarella and basil",
    // Week 4
    "Avocado toast again, added cherry tomatoes and a soft boiled egg",
    "Had a big Greek salad for lunch with grilled shrimp",
    "Ordered Chinese — kung pao chicken, fried rice, egg drop soup",
    "Oatmeal with almond butter and sliced strawberries",
    "BLT on sourdough for lunch with a cup of minestrone",
    "Made lemon herb chicken thighs with roasted broccoli and sweet potatoes",
    "Skipped breakfast, just coffee — wasn't hungry",
    "Grabbed a quick banh mi from the Vietnamese deli for lunch",
    "Chicken parmesan with spaghetti for dinner — went heavy tonight",
    "Chia pudding with mango and coconut for breakfast",
    "Had a grain bowl — quinoa, roasted veggies, tahini dressing, chickpeas",
    "Fish tacos for dinner — three of them with slaw and lime crema",
    "Handful of trail mix and a sparkling water mid-afternoon",
    "French toast with berries and maple syrup for a lazy weekend breakfast",
    "Ceviche and chips at the Mexican spot for lunch",
    "Made a big stir-fry — shrimp, snap peas, mushrooms, garlic, ginger, over noodles",
    // Week 5
    "Eggs and bacon with sourdough toast, orange juice",
    "Turkey club sandwich for lunch — extra avocado",
    "Grilled ribeye with a baked potato and caesar salad",
    "Granola bar and a coffee on the go this morning",
    "Ramen for lunch at the spot near the office — spicy miso with pork belly",
    "Made tacos al pastor at home — marinated pork, pineapple, onion, cilantro",
    "Breakfast sandwich from the deli — egg, cheese, bacon on a roll",
    "Had a Mediterranean wrap for lunch — hummus, feta, olives, lettuce, tomato",
    "Pad thai for dinner from the Thai place — shrimp, extra peanuts",
    "Yogurt and granola with a drizzle of honey",
    "Burrito for lunch — al pastor, rice, beans, guac, extra salsa",
    "Made chicken piccata with capers and a lemon butter sauce, angel hair pasta",
    "Two hard boiled eggs and an apple for breakfast",
    "Tuna poke bowl for lunch with extra edamame",
    "Lamb chops with mint chimichurri and roasted potatoes for dinner",
    // Week 6
    "Cold brew and a blueberry muffin from the coffee shop",
    "Chopped salad for lunch — chicken, avocado, corn, black beans, ranch",
    "Date night — shared a seafood tower and had the branzino, she had the lobster",
    "Avocado smoothie with banana and almond milk",
    "Leftover lamb with a side salad for lunch",
    "Made mushroom risotto from scratch — arborio rice, parmesan, white wine",
    "Protein shake and a banana post-workout",
    "Chicken katsu curry from the Japanese spot for lunch",
    "Roasted whole chicken with root vegetables — carrots, parsnips, potatoes",
    "Almond croissant and a flat white this morning",
    "Pulled pork sandwich for lunch from the BBQ place, coleslaw on the side",
    "Baked cod with lemon, capers, cherry tomatoes, and orzo",
  ],
  contacts: [
    // First meetings
    "Met Rachel Kim at the product meetup, she's a PM at Figma — seemed sharp, wants to chat about our API",
    "Ran into Tom Bradley from college at a bar, he's now a data scientist at Netflix",
    "Had coffee with Priya Sharma, she runs engineering at Vanta — potential customer",
    "Met David Chen at TechCrunch Disrupt, he's CTO of Replit. Really smart guy, exchanged numbers",
    "Was introduced to Sofia Martinez at dinner, she's head of design at Linear",
    "Chatted with James O'Brien at the Greylock event, he's a partner at Sequoia",
    "Met Lisa Park from Notion at the API conference, she's a senior PM on their platform team",
    "Got connected with Marcus Johnson through Alex — he does ML research at DeepMind",
    "Ran into Emily Watson at the climate tech summit, she left Google and started a carbon capture company called Verdant",
    "Met Chris Taylor at the Vercel hackathon, senior engineer, super into edge computing",
    "Had lunch with Anna Liu — she's VP of Product at Anthropic. Met through James",
    "Was introduced to Ben Foster at the SaaStr event, he runs enterprise sales at Datadog",
    "Met Kenji Tanaka at the AI meetup in the Mission, researcher at OpenAI working on tool use",
    "Chatted with Maria Santos at the YC demo day, she's CTO at a data infra startup called DataFlow",
    "Met Alex Rivera at the Cursor office hours, founding engineer there",
    "Ran into Sarah Connor at a rooftop thing in SoMa — she's head of growth at Supabase now",
    "Met Dmitri Volkov at the Stripe conference, principal engineer on their billing team",
    "Had coffee with Nina Patel, she's a design lead at Apple on the Vision Pro team",
    "Met Jordan Lee at the dev tools meetup, he's building something new at Warp",
    "Was introduced to Claire Dubois at dinner, she runs partnerships at Mistral — she's based in Paris",
    "Met Tony Russo at my gym, turns out he's CFO at a Series B fintech called Ramp",
    "Grabbed drinks with Lena Cho, she's a product designer freelancing for startups — does amazing work",
    "Had coffee with Omar Hassan, he runs a small VC fund focused on developer tools",
    "Met Jess Kim at the founder dinner, she's CEO of a health tech startup called Calibrate",
    "Ran into Mike Chen from the old team at a conference, he's now VP Eng at Notion",
    // Follow-ups and updates
    "Had a follow-up call with Priya Sharma about Vanta using our product — she's going to loop in her team for a demo",
    "Caught up with David Chen over Zoom, he's interested in a potential integration with Replit",
    "Had lunch again with Anna Liu, she mentioned Anthropic is hiring PMs — referred Jake",
    "Quick call with James O'Brien about our fundraise — he wants to see our Q1 numbers",
    "Followed up with Claire Dubois, she's visiting SF next month and wants to meet in person",
    "Bumped into Rachel Kim again at a design event, she moved from Figma to a startup called Campsite",
    "Got a text from Emily Watson, Verdant just closed their seed round — $4.5M from Lowercarbon",
    "Had dinner with Maria Santos and her cofounder, they're pivoting DataFlow toward real-time analytics",
    "Coffee with Ben Foster, he's leaving Datadog — thinking about starting something in sales enablement",
    "Kenji Tanaka shared a paper with me on structured tool use, really relevant to what we're building",
    "Quick sync with Tony Russo about accounting software recs, he suggested Mercury + Brex combo",
    "Lena Cho sent over her portfolio, forwarded it to Sofia at Linear — they might work together",
    "Mike Chen pinged me about a senior eng role at Notion, I passed it to Chris Taylor",
    "Had a call with Omar Hassan's fund — they passed on investing but want to stay in touch",
    "Jess Kim asked for an intro to James O'Brien at Sequoia — made the warm intro",
  ],
  expenses: [
    // Recurring / subscriptions
    "Rent hit — $2,850 for the apartment",
    "Gym membership auto-charged, $89",
    "Netflix renewed at $15.49",
    "Spotify premium $12.99",
    "iCloud storage $2.99",
    "Phone bill $95 — T-Mobile",
    "Internet bill $75 — Comcast",
    "ChatGPT Plus subscription $20",
    "Notion team plan renewed, $96 for the year",
    "Car insurance payment $185",
    // Groceries
    "Groceries at Trader Joe's — $78",
    "Whole Foods run, $124 — stocked up for the week",
    "Quick grocery stop at the corner bodega, $22",
    "Costco haul — $215, bulk stuff plus some wine",
    "Trader Joe's again, $65 — mostly snacks and frozen stuff",
    "Farmers market on Saturday, $45 — got fresh veggies, bread, and eggs",
    "Whole Foods delivery, $88",
    "Grocery run $92 — prepping for the dinner party",
    // Dining & coffee
    "Dinner with Sarah at the Italian place, $142 including wine",
    "Coffee and a pastry at Blue Bottle, $11.50",
    "Took the team out for lunch, $186 for 4 people",
    "Drinks after work at the cocktail bar, $48",
    "Grabbed a quick Sweetgreen, $16.50",
    "Date night at the sushi restaurant, $165",
    "Morning latte at the usual spot, $6.50",
    "Ordered Thai delivery, $34 with tip",
    "Brunch with friends, $52 — eggs benedict and a mimosa",
    "Pizza night — ordered two pies from the place on 7th, $38",
    "Coffee meeting with Omar, grabbed the tab, $18",
    // Transport
    "Uber to the airport, $52",
    "Lyft to dinner, $18",
    "Monthly subway pass, $127",
    "Gas for the car, $58",
    "Parking garage downtown, $32",
    "Uber home from the bar, $24",
    "Car wash, $25",
    // Shopping
    "New running shoes on Nike.com, $145",
    "Amazon order — USB-C hub and a phone case, $67",
    "Bought a new jacket at Zara, $89",
    "Book from the independent bookstore, $28",
    "Picked up a birthday gift for mom at Nordstrom, $75",
    "New AirPods Pro, $249 — old ones finally died",
    "Bought a cookbook on Amazon, $24",
    "Replacement charger cable, $19",
    // Health & personal
    "Dentist copay, $45",
    "Pharmacy — allergy meds, $18",
    "Haircut, $50 including tip",
    "Dry cleaning pickup, $35",
    "Therapy session copay, $30",
    // Entertainment & misc
    "Movie tickets for two, $34",
    "Concert tickets — two for the show at the Fillmore, $120",
    "Bought wine for the dinner party, $42",
    "New headphones from Best Buy, $79",
    "Picked up flowers for the apartment, $15",
    "Donated to Wikipedia, $25",
    "Weekend trip Airbnb deposit, $180",
    "Museum membership renewal, $90",
  ],
};

// --- Send messages through the agent ---

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[1;36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

async function sendToAgent(userMsg, conversationMessages, overrideDate) {
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
        const result = await mcpCallTool(name, args, overrideDate);
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

  console.log(`\n${cyan("AgentUIDB Seed")} — sending ${total} messages across ${categories.length} categories (concurrent)\n`);

  // Run all categories concurrently — each has its own conversation
  async function runCategory(category) {
    const msgs = messages_by_category[category];
    const dates = generateDates(msgs.length, 45);
    console.log(`${cyan(category)} (${msgs.length} messages, ${dates[0]} → ${dates[dates.length - 1]})`);

    let catErrors = 0;

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const overrideDate = dates[i];
      done++;
      const short = msg.length > 70 ? msg.slice(0, 70) + "..." : msg;
      process.stdout.write(`  ${dim(`[${done}/${total}]`)} ${cyan(category.padEnd(15))} ${dim(overrideDate)} ${short} `);

      // Fresh conversation per message — keeps token usage constant
      const systemContent = await buildSystemPrompt();
      const conversationMessages = [{ role: "system", content: systemContent }];
      const result = await sendToAgent(`${msg} on ${overrideDate}`, conversationMessages, overrideDate);

      if (result.error) {
        process.stdout.write(`${red("ERR")} ${dim(result.error)}\n`);
        catErrors++;
      } else {
        const hasInsert = result.toolsCalled.some((t) => t.name === "insert_document" && t.success);
        const toolSummary = result.toolsCalled
          .map((t) => t.success ? green(t.name) : red(t.name))
          .join(", ");
        process.stdout.write(`${toolSummary || dim("(no tools)")}`);
        if (!hasInsert && result.response) {
          const respShort = result.response.length > 80 ? result.response.slice(0, 80) + "..." : result.response;
          process.stdout.write(` ${yellow(respShort)}`);
        }
        process.stdout.write("\n");
      }

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log(`  ${cyan(category)} done!`);
    return catErrors;
  }

  const results = await Promise.all(categories.map(runCategory));
  errors = results.reduce((sum, e) => sum + e, 0);

  console.log(`\n${cyan("Done!")} ${done - errors} succeeded, ${errors} errors\n`);
  mcp.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  mcp.kill();
  process.exit(1);
});
