// Quick integration test: exercises all 8 MCP tools via JSON-RPC over stdio
import { spawn } from "node:child_process";

const projectRoot = new URL("..", import.meta.url).pathname;
const proc = spawn("node", ["mcp/dist/index.js"], {
  cwd: projectRoot,
  env: { ...process.env, AGENTUIDB_URL: "http://127.0.0.1:8000" },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let requestId = 0;
const pending = new Map();

proc.stdout.on("data", (chunk) => {
  buffer += chunk.toString();

  // Try newline-delimited JSON parsing
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      // not JSON, skip
    }
  }
});

proc.stderr.on("data", (chunk) => {
  process.stderr.write("[server stderr] " + chunk);
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++requestId;
    pending.set(id, resolve);
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    proc.stdin.write(body + "\n");
  });
}

async function callTool(name, args = {}) {
  const resp = await send("tools/call", { name, arguments: args });
  if (resp.error) {
    console.error(`  ERROR: ${JSON.stringify(resp.error)}`);
    return { parsed: null, isError: true };
  }
  const text = resp.result?.content?.[0]?.text;
  const parsed = text ? JSON.parse(text) : null;
  const isError = resp.result?.isError ?? false;
  return { parsed, isError };
}

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

async function run() {
  // Initialize
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  // Send initialized notification (no response expected)
  const notifBody = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  proc.stdin.write(notifBody + "\n");

  console.log("=== Testing AgentUIDB MCP Server ===\n");

  // 1. list_collections (should be empty)
  console.log("1. list_collections (empty)");
  let result = await callTool("list_collections");
  check("empty array", Array.isArray(result.parsed) && result.parsed.length === 0);

  // 2. create_collection
  console.log("\n2. create_collection (meals)");
  result = await callTool("create_collection", {
    name: "meals",
    description: "Daily food intake and calorie tracking",
    fields: [
      { name: "meal_name", type: "string", required: true },
      { name: "calories", type: "int", required: false },
      { name: "protein_g", type: "float", required: false },
      { name: "meal_type", type: "string", required: false, enum: ["breakfast", "lunch", "dinner", "snack"] },
      { name: "companions", type: "array<string>", required: false },
      { name: "notes", type: "string", required: false },
      { name: "tags", type: "array<string>", required: false },
      { name: "created_at", type: "datetime", required: true },
    ],
  });
  check("success", result.parsed?.success === true);
  check("fields_count=8", result.parsed?.fields_count === 8);

  // 3. create_collection (duplicate)
  console.log("\n3. create_collection (duplicate — should fail)");
  result = await callTool("create_collection", {
    name: "meals",
    description: "duplicate",
    fields: [{ name: "x", type: "string", required: false }],
  });
  check("isError", result.isError === true);

  // 4. get_collection_schema
  console.log("\n4. get_collection_schema (meals)");
  result = await callTool("get_collection_schema", { collection: "meals" });
  check("name=meals", result.parsed?.name === "meals");
  check("8 fields", result.parsed?.fields?.length === 8);
  check("count=0", result.parsed?.count === 0);

  // 5. insert_document
  console.log("\n5. insert_document (salad)");
  result = await callTool("insert_document", {
    collection: "meals",
    data: {
      meal_name: "Caesar Salad",
      calories: 600,
      meal_type: "lunch",
      tags: ["healthy"],
      created_at: "2026-02-08T12:30:00Z",
    },
  });
  check("success", result.parsed?.success === true);
  const saladId = result.parsed?.id;
  check("has id", !!saladId);

  // 6. insert_document (auto created_at)
  console.log("\n6. insert_document (croissant, auto created_at)");
  result = await callTool("insert_document", {
    collection: "meals",
    data: {
      meal_name: "Croissant",
      calories: 300,
      meal_type: "snack",
    },
  });
  check("success", result.parsed?.success === true);

  // 7. insert_document (validation fail)
  console.log("\n7. insert_document (validation fail — calories as string)");
  result = await callTool("insert_document", {
    collection: "meals",
    data: {
      meal_name: "Bad Entry",
      calories: "not a number",
      created_at: "2026-02-08T12:30:00Z",
    },
  });
  check("isError", result.isError === true);

  // 8. query_collection (all)
  console.log("\n8. query_collection (all meals)");
  result = await callTool("query_collection", { collection: "meals" });
  check("2 documents", result.parsed?.length === 2);

  // 9. query_collection (with filter)
  console.log("\n9. query_collection (filter: meal_type = lunch)");
  result = await callTool("query_collection", {
    collection: "meals",
    filters: { meal_type: "lunch" },
  });
  check("1 match", result.parsed?.length === 1);

  // 10. update_document
  console.log("\n10. update_document (update salad calories)");
  result = await callTool("update_document", {
    collection: "meals",
    id: saladId,
    data: { calories: 650 },
  });
  check("success", result.parsed?.success === true);

  // 11. list_collections (should show count = 2)
  console.log("\n11. list_collections (should show count=2)");
  result = await callTool("list_collections");
  const mealsCol = result.parsed?.find((c) => c.name === "meals");
  check("count=2", mealsCol?.count === 2);

  // 12. update_collection_schema
  console.log("\n12. update_collection_schema (add location field)");
  result = await callTool("update_collection_schema", {
    collection: "meals",
    new_fields: [{ name: "location", type: "string", required: false }],
  });
  check("success", result.parsed?.success === true);
  check("total_fields=9", result.parsed?.total_fields === 9);

  // 13. insert with new field
  console.log("\n13. insert_document (with new location field)");
  result = await callTool("insert_document", {
    collection: "meals",
    data: {
      meal_name: "Sushi",
      calories: 450,
      meal_type: "dinner",
      location: "Nobu",
      created_at: "2026-02-08T19:00:00Z",
    },
  });
  check("success", result.parsed?.success === true);
  const sushiId = result.parsed?.id;

  // 14. delete_document
  console.log("\n14. delete_document (sushi)");
  result = await callTool("delete_document", {
    collection: "meals",
    id: sushiId,
  });
  check("success", result.parsed?.success === true);

  // 15. query to confirm deletion
  console.log("\n15. query_collection (confirm deletion, should be 2)");
  result = await callTool("query_collection", { collection: "meals" });
  check("2 documents", result.parsed?.length === 2);

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  proc.kill();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  proc.kill();
  process.exit(1);
});

setTimeout(() => {
  console.error("Test timed out");
  proc.kill();
  process.exit(1);
}, 30000);
