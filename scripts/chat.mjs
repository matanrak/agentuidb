// Interactive chat with an AI that has access to AgentUIDB tools via MCP
// Usage: OPENROUTER_API_KEY=sk-... AGENTUIDB_URL=http://127.0.0.1:8000 node chat.mjs

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL ?? "anthropic/claude-sonnet-4";

if (!OPENROUTER_KEY) {
  console.error("Set OPENROUTER_API_KEY env var");
  process.exit(1);
}
if (!process.env.AGENTUIDB_URL) {
  console.error("Set AGENTUIDB_URL env var (e.g. http://127.0.0.1:8000)");
  process.exit(1);
}

// --- MCP server child process ---

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

async function mcpCallTool(name, args) {
  const resp = await mcpSend("tools/call", { name, arguments: args });
  if (resp.error) return JSON.stringify({ error: resp.error });
  const text = resp.result?.content?.[0]?.text ?? "{}";
  return text;
}

// Discover tools from MCP server (tools/list → OpenAI format)
async function discoverTools() {
  const resp = await mcpSend("tools/list", {});
  return (resp.result?.tools ?? []).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
  }));
}

// --- Read SKILL.md for system prompt ---

import { readFileSync } from "node:fs";
let skillPrompt = "";
try {
  skillPrompt = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
  // Strip YAML frontmatter
  skillPrompt = skillPrompt.replace(/^---[\s\S]*?---\n*/, "");
} catch {
  skillPrompt = "You have access to structured data storage tools. Use them silently to store data from the user's messages.";
}

const systemPrompt = skillPrompt + "\n\nToday's date: " + new Date().toISOString().slice(0, 10);

// --- Chat loop ---

let tools = [];
const messages = [{ role: "system", content: systemPrompt }];

async function chat(userMsg) {
  messages.push({ role: "user", content: userMsg });

  const MAX_TOOL_ROUNDS = 5;
  let toolRounds = 0;

  while (true) {
    // After too many tool rounds, force the model to respond with text
    const useTools = toolRounds < MAX_TOOL_ROUNDS ? tools : undefined;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, messages, ...(useTools && { tools: useTools }) }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`\nAPI error (${resp.status}): ${err}`);
      return;
    }

    const json = await resp.json();
    const choice = json.choices?.[0];
    if (!choice) {
      console.error("\nNo response from model");
      return;
    }

    const msg = choice.message;
    messages.push(msg);

    // If model wants to call tools
    if (msg.tool_calls?.length) {
      toolRounds++;
      for (const call of msg.tool_calls) {
        const name = call.function.name;
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        const argsShort = JSON.stringify(args);
        const truncated = argsShort.length > 120 ? argsShort.slice(0, 120) + "..." : argsShort;
        process.stdout.write(`  \x1b[2m[\x1b[36m${name}\x1b[0m\x1b[2m]\x1b[0m ${truncated}\n`);
        const result = await mcpCallTool(name, args);
        const parsed = JSON.parse(result);
        if (parsed.error) {
          process.stdout.write(`    \x1b[31m=> error: ${parsed.error}\x1b[0m\n`);
        } else if (parsed.success !== undefined) {
          const extra = parsed.id ? ` id=${parsed.id}` : parsed.total_fields ? ` fields=${parsed.total_fields}` : "";
          process.stdout.write(`    \x1b[32m=> ok${extra}\x1b[0m\n`);
        } else if (Array.isArray(parsed)) {
          process.stdout.write(`    \x1b[32m=> ${parsed.length} result(s)\x1b[0m\n`);
        } else {
          const short = result.length > 100 ? result.slice(0, 100) + "..." : result;
          process.stdout.write(`    \x1b[2m=> ${short}\x1b[0m\n`);
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      if (toolRounds >= MAX_TOOL_ROUNDS) {
        process.stdout.write(`  \x1b[33m(hit ${MAX_TOOL_ROUNDS} tool rounds, forcing text response)\x1b[0m\n`);
      }
      continue;
    }

    // Model responded with text
    if (msg.content) {
      console.log(`\n${msg.content}\n`);
    } else {
      console.log(`\n\x1b[2m(empty response from model)\x1b[0m\n`);
    }
    return;
  }
}

// --- Init and REPL ---

async function main() {
  await mcpSend("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "chat", version: "1.0.0" },
  });
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");

  tools = await discoverTools();

  // Pre-load existing collections into the system prompt
  const collectionsJson = await mcpCallTool("list_collections", {});
  const collections = JSON.parse(collectionsJson);
  if (collections.length) {
    const schemas = [];
    for (const col of collections) {
      const schemaJson = await mcpCallTool("get_collection_schema", { collection: col.name });
      schemas.push(JSON.parse(schemaJson));
    }
    const collectionContext = schemas.map((s) => {
      const fields = s.fields.map((f) => `    ${f.name}: ${f.type}${f.required ? " (required)" : ""}`).join("\n");
      return `- ${s.name} (${s.count} docs): ${s.description}\n${fields}`;
    }).join("\n\n");
    messages[0].content += `\n\n## Existing Collections\n\nThese collections already exist. Use them directly with insert_document — do NOT call list_collections or get_collection_schema unless the user asks about a collection you don't recognize.\n\n${collectionContext}`;
    console.log(`Loaded ${collections.length} collection(s) into context.`);
  }

  console.log(`AgentUIDB Chat (model: ${MODEL})`);
  console.log("The AI will silently store structured data from your messages.");
  console.log('Type "quit" to exit, "dump" to see what\'s stored.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.question("> ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed === "quit") {
      mcp.kill();
      process.exit(0);
    }
    if (trimmed === "dump") {
      const resp = await mcpCallTool("list_collections", {});
      const collections = JSON.parse(resp);
      if (!collections.length) {
        console.log("\n(no collections yet)\n");
      } else {
        for (const col of collections) {
          console.log(`\n--- ${col.name} (${col.count} docs) ---`);
          const docs = await mcpCallTool("query_collection", { collection: col.name, limit: 50 });
          const parsed = JSON.parse(docs);
          for (const doc of parsed) {
            const { id, ...rest } = doc;
            console.log(`  ${id}: ${JSON.stringify(rest)}`);
          }
        }
        console.log();
      }
      return prompt();
    }
    await chat(trimmed);
    prompt();
  });
  prompt();
}

main().catch((err) => {
  console.error(err);
  mcp.kill();
  process.exit(1);
});
