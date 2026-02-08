---
name: agentuidb
description: >
  Structured data storage for agent-collected information. Silently detects storable data
  in conversations (meals, contacts, meetings, expenses, health metrics, etc.) and persists
  it to typed collections in SurrealDB. Never interrupts the user — storage is a side-effect,
  not a feature.
metadata:
  openclaw:
    emoji: "🗄️"
    requires:
      bins: ["surreal"]
      env: ["AGENTUIDB_URL"]
    install:
      - id: brew
        kind: brew
        formula: surrealdb
        bins: ["surreal"]
        label: "Install SurrealDB (brew)"
    homepage: "https://github.com/agentuidb/agentuidb"
---

# AgentUIDB — Structured Data Storage

You have access to a structured data store via MCP tools. Your job is to **silently detect storable data** in every conversation turn and persist it — without telling the user, without asking permission, without changing your response.

Storage is a background reflex, not a feature you advertise.

## The Decision — Every Message

On every user message, evaluate:

1. **Does this contain structured, factual data?** (not opinions, not conversation filler, not questions)
2. **Would the user plausibly want to retrieve or review this later?**
3. **Can I extract at least 2 typed fields from it?**

If all three → store it. If not → move on. Do not mention storage to the user.

### STORE — examples

- "Had a 600 cal salad for lunch" → `meals` collection
- "Met Sarah Chen from Acme, she runs their ML team" → `contacts` collection  
- "Weighed in at 82.3kg this morning" → `health_metrics` collection
- "Spent $45 on Uber today" → `expenses` collection
- "Had a great meeting with the Figma team about API pricing" → `meetings` collection
- "Ran 5k in 24:30" → `workouts` collection
- "My flight to NYC is March 3, United 447, departs 6am" → `travel` collection

### DO NOT STORE — examples

- "I'm feeling tired today" → mood, not structured data (unless a `mood` collection exists)
- "What's the weather?" → question, no data
- "Can you help me write an email?" → task, no data
- "I think React is better than Vue" → opinion
- "Thanks!" → conversation filler
- "Remember that I prefer dark mode" → this is **memory**, not structured data. Leave it to the memory system.

### The memory vs storage boundary

- **Memory** = preferences, habits, context, identity ("user prefers oat milk", "user works at Acme")
- **Storage** = discrete data points with typed fields ("400 cal lunch at 12:30", "met John at conference")

If it's about *who the user is*, it's memory. If it's *something that happened or was measured*, it's storage.

## Collection Index

Before making any storage decision, always call `list_collections` to see what exists. This returns collection names + descriptions only (lightweight). Use this to decide whether data fits an existing collection or needs a new one.

**Prefer existing collections.** Only create new ones when the data genuinely doesn't fit anywhere.

## Storing to an Existing Collection

1. Call `get_collection_schema` with the collection name
2. Map the user's data to the schema fields (use `null` for fields you can't extract)
3. Always populate `created_at` with the current timestamp
4. Call `insert_document` with the mapped data
5. Continue responding to the user as if nothing happened

### Field extraction rules

- Be generous with inference. "Had lunch with Dave" → `meal_companion: "Dave"` if the field exists
- Use ISO 8601 for all dates/times. If user says "this morning", infer today's date
- Use lowercase normalized strings for categories/tags
- Numbers should be numbers, not strings. "600 cal" → `calories: 600`
- If a field exists in the schema but you can't extract it from the message, set it to `null` — don't skip it, don't guess

## Creating a New Collection

When data doesn't fit any existing collection, create one. This is a two-step process:

### Step 1: Design the schema

Think about what this collection will hold **over time**, not just this one entry. Be generous with fields.

**Schema design principles:**

- **Always include** `created_at` (datetime) — every collection is implicitly time-aware
- **Always include** a human-readable identifier field (title/name/description)  
- **Anticipate growth.** If user logs a meal, include fields for: `meal_name`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `meal_type` (breakfast/lunch/dinner/snack), `location`, `companions`, `notes`, `photo_url`. Even if today's entry only fills 2 of these.
- **Use specific types.** `calories: int`, not `calories: string`. `date: datetime`, not `date: string`.
- **Include optional reference fields.** A meal might link to a contact. A meeting might link to a contact. Use `related_contact: string` (nullable) for soft references.
- **Add a `tags` field** (array of strings) to every collection. Users will want to filter/group later.
- **Add a `notes` field** (string, nullable) to every collection. Catch-all for context.

### Step 2: Create it

Call `create_collection` with:
- `name`: lowercase, snake_case, plural (e.g., `meals`, `contacts`, `workouts`)
- `description`: one sentence explaining what this stores, written for a human browsing a dashboard
- `fields`: the full schema as an array of field definitions

Then immediately call `insert_document` with the first entry.

## MCP Tools Reference

### `list_collections`

Returns all collection names and descriptions. Lightweight. Use this to check what exists before storing.

**Parameters:** none

**Returns:**
```json
[
  { "name": "meals", "description": "Daily food intake and calorie tracking", "count": 47 },
  { "name": "contacts", "description": "People met through work and life", "count": 12 }
]
```

### `get_collection_schema`

Returns the full schema for a collection.

**Parameters:**
- `collection` (string, required): collection name

**Returns:**
```json
{
  "name": "meals",
  "description": "Daily food intake and calorie tracking",
  "fields": [
    { "name": "meal_name", "type": "string", "required": true },
    { "name": "calories", "type": "int", "required": false },
    { "name": "protein_g", "type": "float", "required": false },
    { "name": "carbs_g", "type": "float", "required": false },
    { "name": "fat_g", "type": "float", "required": false },
    { "name": "meal_type", "type": "string", "required": false, "enum": ["breakfast", "lunch", "dinner", "snack"] },
    { "name": "location", "type": "string", "required": false },
    { "name": "companions", "type": "array<string>", "required": false },
    { "name": "notes", "type": "string", "required": false },
    { "name": "tags", "type": "array<string>", "required": false },
    { "name": "created_at", "type": "datetime", "required": true }
  ],
  "count": 47,
  "created_at": "2026-01-15T10:30:00Z"
}
```

### `create_collection`

Creates a new collection with a typed schema.

**Parameters:**
- `name` (string, required): lowercase snake_case plural name
- `description` (string, required): one-sentence human-readable description
- `fields` (array, required): field definitions, each with:
  - `name` (string): field name in snake_case
  - `type` (string): one of `string`, `int`, `float`, `bool`, `datetime`, `array<string>`, `array<int>`, `array<float>`, `object`
  - `required` (bool): whether this field must be present on insert
  - `enum` (array, optional): allowed values for string fields
  - `default` (any, optional): default value if not provided

**Returns:** `{ "success": true, "name": "meals", "fields_count": 11 }`

### `insert_document`

Inserts a single document into a collection. Validates against schema.

**Parameters:**
- `collection` (string, required): collection name
- `data` (object, required): key-value pairs matching the collection schema

**Returns:** `{ "success": true, "id": "meals:abc123" }`

### `query_collection`

Reads documents from a collection with optional filters.

**Parameters:**
- `collection` (string, required): collection name
- `filters` (object, optional): field-value pairs to filter by (exact match)
- `sort_by` (string, optional): field name to sort by (default: `created_at`)
- `sort_order` (string, optional): `asc` or `desc` (default: `desc`)
- `limit` (int, optional): max results (default: 20)

**Returns:** array of documents

### `update_document`

Updates an existing document by ID.

**Parameters:**
- `collection` (string, required): collection name
- `id` (string, required): document ID (e.g., `meals:abc123`)
- `data` (object, required): fields to update (partial update, omitted fields unchanged)

**Returns:** `{ "success": true, "id": "meals:abc123" }`

### `delete_document`

Deletes a document by ID. Use sparingly — only when user explicitly asks.

**Parameters:**
- `collection` (string, required): collection name
- `id` (string, required): document ID

**Returns:** `{ "success": true }`

### `update_collection_schema`

Adds new fields to an existing collection schema. Cannot remove or rename existing fields.

**Parameters:**
- `collection` (string, required): collection name
- `new_fields` (array, required): new field definitions to add

**Returns:** `{ "success": true, "total_fields": 13 }`

## Example Full Flow

**User message:** "Just had coffee with Maria Santos, she's the CTO at DataFlow. We talked about their new vector DB product. Oh and I had a croissant, probably like 300 cals."

**Agent reasoning (internal):**

1. Call `list_collections` → sees `contacts` and `meals` exist
2. This message contains TWO storable items:
   - A contact: Maria Santos, CTO, DataFlow
   - A meal: croissant, 300 cal
3. Call `get_collection_schema("contacts")` → get schema
4. Call `insert_document("contacts", { "name": "Maria Santos", "title": "CTO", "company": "DataFlow", "context": "Discussed their new vector DB product", "met_at": "coffee meeting", "tags": ["tech", "databases"], "created_at": "2026-02-08T14:30:00Z" })`
5. Call `get_collection_schema("meals")` → get schema
6. Call `insert_document("meals", { "meal_name": "Croissant", "calories": 300, "meal_type": "snack", "companions": ["Maria Santos"], "location": null, "tags": ["coffee"], "created_at": "2026-02-08T14:30:00Z" })`
7. Respond to user naturally about their conversation with Maria — **never mention that data was stored**

## Edge Cases

- **Corrections:** "Actually that was 400 cals not 300" → call `query_collection` to find the recent entry, then `update_document`. Don't create a duplicate.
- **Bulk data:** "Here are my weights for the week: Mon 82, Tue 81.5..." → insert each as a separate document with the correct date.
- **Ambiguous timing:** "I had sushi yesterday" → use yesterday's date for `created_at`, not now.
- **Duplicate detection:** Before inserting, consider if a very similar entry was just created in this session. Don't double-store.
- **Schema evolution:** User mentions a field that doesn't exist in the schema (e.g., "that sushi was from Nobu" but `meals` has no `restaurant` field) → call `update_collection_schema` to add the field, then insert.

## What You Never Do

- ❌ Never tell the user "I've stored that in your meals collection"
- ❌ Never ask "would you like me to save that?"
- ❌ Never mention AgentUIDB, SurrealDB, collections, or schemas
- ❌ Never store data that's clearly hypothetical ("if I ate 2000 cals...")
- ❌ Never store data from web searches or external sources — only user-provided data
- ❌ Never prioritize storage over responding to the user's actual request
