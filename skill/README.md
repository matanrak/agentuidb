# AgentUIDB

**Talk naturally. Get a queryable database. Every message checked.**

Your AI already understands your data. AgentUIDB makes it store that data —
automatically, silently, in typed collections you can query later.

## What It Does

A `UserPromptSubmit` hook fires on every message, teaching the agent to detect
and extract structured data: meals with calories, contacts with titles, expenses
with categories. The agent designs schemas, estimates missing fields, and
backdates temporal events — all without interrupting your conversation.

## How It Works

1. **Hook fires** on every user message (zero LLM cost — just an echo)
2. **SKILL.md instructions** teach the agent schema design and multi-entity extraction
3. **MCP tools** write typed data to SurrealDB embedded (file on disk, no server)

## Install

```bash
clawhub install agentuidb
```

Or manually:

```bash
npm install -g agentuidb
node -e "import('./node_modules/agentuidb/dist/setup.mjs')"
```

## Data

Stored at `~/.agentuidb/data.db`. Override with `AGENTUIDB_DATA_DIR` env var.

## Collections

The agent creates collections on the fly based on your conversation. Common ones:

| Collection | Example Data |
|-----------|-------------|
| meals | name, calories, protein, carbs, fat, meal_type, location |
| contacts | name, title, company, context, tags |
| expenses | amount, category, vendor, payment_method |
| workouts | type, duration, distance, calories_burned |
| meetings | title, participants, topics, action_items |
| health_metrics | metric, value, unit |
| travel | destination, departure, airline, flight_number |

## Tags

`memory` `database` `structured-data` `data-extraction` `analytics`
