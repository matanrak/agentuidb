import { StringRecordId } from "surrealdb";
import { getDb } from "./db.js";
import type { CollectionMeta, FieldDefinition } from "./types.js";

const META_TABLE = "_collections_meta";

export async function listCollections(): Promise<CollectionMeta[]> {
  const db = await getDb();
  const records = await db.select<CollectionMeta>(META_TABLE);
  return records;
}

export async function getCollectionMeta(
  name: string
): Promise<CollectionMeta | null> {
  const db = await getDb();
  try {
    const record = await db.select<CollectionMeta>(
      new StringRecordId(`${META_TABLE}:\`${name}\``)
    );
    return (record as CollectionMeta) ?? null;
  } catch {
    return null;
  }
}

export async function createCollectionMeta(
  name: string,
  description: string,
  fields: FieldDefinition[]
): Promise<CollectionMeta> {
  const db = await getDb();
  const now = new Date().toISOString();
  const record = await db.create<CollectionMeta>(
    new StringRecordId(`${META_TABLE}:\`${name}\``),
    {
      name,
      description,
      fields,
      created_at: now,
      updated_at: now,
    }
  );
  return record as CollectionMeta;
}

export async function updateCollectionMeta(
  name: string,
  fields: FieldDefinition[]
): Promise<CollectionMeta> {
  const db = await getDb();
  const now = new Date().toISOString();
  const record = await db.merge<CollectionMeta>(
    new StringRecordId(`${META_TABLE}:\`${name}\``),
    {
      fields,
      updated_at: now,
    }
  );
  return record as CollectionMeta;
}

export async function collectionExists(name: string): Promise<boolean> {
  const meta = await getCollectionMeta(name);
  return meta !== null;
}
