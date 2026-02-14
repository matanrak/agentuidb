#!/usr/bin/env node

/**
 * AgentUIDB setup script.
 * Wires the MCP server into Claude Code's config (~/.claude.json or similar).
 * Run once after: npm install -g agentuidb
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATHS = [
  resolve(homedir(), ".claude.json"),
  resolve(homedir(), ".claude", "config.json"),
];

const MCP_ENTRY = {
  command: "npx",
  args: ["agentuidb"],
  env: {},
};

function findConfig() {
  for (const p of CONFIG_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function run() {
  const configPath = findConfig();

  if (!configPath) {
    console.log("Could not find Claude Code config file.");
    console.log("Add this MCP server entry manually:");
    console.log(JSON.stringify({ agentuidb: MCP_ENTRY }, null, 2));
    process.exit(0);
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  if (config.mcpServers.agentuidb) {
    console.log("AgentUIDB MCP server already configured.");
    process.exit(0);
  }

  config.mcpServers.agentuidb = MCP_ENTRY;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Added AgentUIDB MCP server to ${configPath}`);

  // Ensure data directory exists
  const dataDir = resolve(homedir(), ".agentuidb");
  mkdirSync(dataDir, { recursive: true });
  console.log(`Data directory: ${dataDir}`);
  console.log("Setup complete. Start a new conversation to begin.");
}

run();
