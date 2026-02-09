# AgentUIDB

Talk to an AI. It remembers everything — structured, queryable, automatic.

# How It Works

## Background Storage

You talk naturally. The agent extracts structured data and stores it automatically.

> **You say:** "Had sushi for dinner — salmon roll and tuna nigiri"

```json
// → meals
{
  "meal_name": "Sushi",
  "calories": 450,
  "meal_type": "dinner",
  "tags": ["japanese"]
}
```

> **You say:** "Met Rachel Kim at the product meetup, she's a PM at Figma"

```json
// → contacts
{
  "name": "Rachel Kim",
  "role": "PM",
  "company": "Figma",
  "context": "product meetup"
}
```

> **You say:** "Spent $85 on groceries at Trader Joe's"

```json
// → expenses
{
  "amount": 85,
  "category": "groceries",
  "vendor": "Trader Joe's"
}
```

## Dashboard

TBD

# Quick Start

```bash
npm install
npm run build
npm run db:demo          # starts SurrealDB + loads sample data
```

Then in a second terminal:

```bash
cd dashboard && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

# Setup

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [SurrealDB](https://surrealdb.com/) CLI (`brew install surrealdb/tap/surreal`)

## Install

```bash
npm install
npm run build
```

Create a `.env` file in the project root (optional — you can also export these directly):

```
AGENTUIDB_URL=http://127.0.0.1:8000
OPENROUTER_API_KEY=sk-or-...
```

## Running the Database

Start a local SurrealDB instance (data persists to `.surreal/`):

```bash
npm run db
```

This starts SurrealDB on `http://127.0.0.1:8000` with user `root` / password `root`.

## Seed Data

Two ways to populate the database with sample data — either load a static snapshot or generate fresh data through the AI agent.

### Loading Seed Data

To load a pre-built snapshot of sample data directly into the DB (requires `npm run db` running in another terminal):

```bash
npm run db:load
```

This imports `scripts/seed-data.surql` — useful for quickly populating the database without calling the AI.

### Generating Seed Data via AI

To generate fresh seed data by sending realistic messages through the chat agent (requires `OPENROUTER_API_KEY`):

```bash
npm run seed
```

## Chat Mode

Interactive CLI chat where the AI silently stores structured data from your messages:

```bash
OPENROUTER_API_KEY=sk-or-... AGENTUIDB_URL=http://127.0.0.1:8000 npm run chat
```

Or if you have a `.env` file, the chat script reads it automatically — but env vars for `AGENTUIDB_URL` and `OPENROUTER_API_KEY` must still be set (either exported or in `.env`).

Commands inside the chat REPL:
- Type a message and the AI will respond while silently extracting and storing data
- `dump` — print all stored collections and documents
- `quit` — exit

## Terminal Dashboard

A live-refreshing terminal UI that shows all collections and recent documents:

```bash
npm run watch
```

Refreshes every 2 seconds. Reads `.env` automatically. Requires the database to be running.

## Web Dashboard

A Next.js app with an agentic chat interface and data visualizations:

```bash
cd dashboard
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

## Running Tests

Integration tests that exercise all MCP tools via JSON-RPC over stdio (requires the database to be running):

```bash
npm run build
npm run test
```

## MCP Server

The server communicates over stdio using the [Model Context Protocol](https://modelcontextprotocol.io/). To use it as a tool server in an MCP-compatible client, point it at the built entry point:

```bash
node dist/index.js
```

Set `AGENTUIDB_URL` to tell it where SurrealDB is running.
