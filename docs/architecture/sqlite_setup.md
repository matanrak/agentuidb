# SQLite Storage Architecture

AgentUIDB uses SQLite with JSON columns as a document store. Each collection is a table with 3 columns — all document fields live inside a single `data` JSON blob.

## Schema

```sql
-- System table: collection metadata
CREATE TABLE _collections_meta (
  name        TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  fields      TEXT NOT NULL,  -- JSON array of FieldDefinition[]
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Per-collection table (created dynamically by create_collection)
CREATE TABLE meals (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,  -- entire document as JSON
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

Every collection table has the same 3-column shape. No migrations ever.

## Row example

```
id:          "a3f7c9b01e2d4a8b"
data:        {"meal_name":"Bibimbap","calories":550,"protein_g":28.5,"meal_type":"lunch","companions":["Jiwon","Minsoo"],"tags":["korean","rice"]}
created_at:  "2026-02-14T09:30:00.000Z"
```

Handlers expand rows on read: `{ id, ...JSON.parse(data), created_at }` — callers see flat documents.

## Querying

`json_extract()` makes JSON columns fully queryable:

```sql
-- Basic filter
SELECT id, data, created_at FROM meals
WHERE json_extract(data, '$.meal_type') = 'lunch'
ORDER BY created_at DESC LIMIT 20;

-- Aggregation
SELECT json_extract(data, '$.meal_type') AS meal_type,
       COUNT(*) AS count,
       AVG(json_extract(data, '$.calories')) AS avg_cal
FROM meals GROUP BY meal_type;

-- Array search (e.g. find meals with a specific companion)
SELECT id, data, created_at FROM meals
WHERE EXISTS (
  SELECT 1 FROM json_each(json_extract(data, '$.companions'))
  WHERE value = 'Jiwon'
);

-- Tag counting
SELECT j.value AS tag, COUNT(*) AS times_used
FROM meals, json_each(json_extract(meals.data, '$.tags')) AS j
GROUP BY j.value ORDER BY times_used DESC;
```

## Performance: generated columns

If a field gets queried frequently, add a virtual column + index with no migration:

```sql
ALTER TABLE meals
ADD COLUMN meal_type TEXT
GENERATED ALWAYS AS (json_extract(data, '$.meal_type')) VIRTUAL;

CREATE INDEX idx_meals_meal_type ON meals(meal_type);
```

The `data` column stays the source of truth. Add these as performance needs arise, not upfront.

## Why this works

- `update_collection_schema` adds fields? Just JSON — new fields appear in `data` automatically
- No migration files, no version tracking
- Zod validates on insert/update, same as before
- `create_collection` = `CREATE TABLE` + write metadata
- `better-sqlite3` installs in 2 seconds on any platform, no native binary drama
- Open the `.sqlite` file with any SQLite browser to inspect data
