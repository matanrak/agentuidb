import { getDb } from "./db.js";
import type { CollectionMeta, FieldDefinition } from "./types.js";

function parseMetaRow(row: Record<string, unknown>): CollectionMeta {
  return {
    name: row.name as string,
    description: row.description as string,
    fields: typeof row.fields === "string" ? JSON.parse(row.fields as string) : row.fields,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function listCollections(): CollectionMeta[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM _collections_meta ORDER BY name ASC").all();
  return (rows as Record<string, unknown>[]).map(parseMetaRow);
}

export function getCollectionMeta(name: string): CollectionMeta | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM _collections_meta WHERE name = ?").get(name);
  if (!row) return null;
  return parseMetaRow(row as Record<string, unknown>);
}

export function createCollectionMeta(
  name: string,
  description: string,
  fields: FieldDefinition[],
): CollectionMeta {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO _collections_meta (name, description, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(name, description, JSON.stringify(fields), now, now);
  return { name, description, fields, created_at: now, updated_at: now };
}

export function updateCollectionMeta(
  name: string,
  fields: FieldDefinition[],
): CollectionMeta {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE _collections_meta SET fields = ?, updated_at = ? WHERE name = ?",
  ).run(JSON.stringify(fields), now, name);
  return getCollectionMeta(name)!;
}

export function collectionExists(name: string): boolean {
  return getCollectionMeta(name) !== null;
}
