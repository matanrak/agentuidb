import { StringRecordId } from "surrealdb";
import { getDb } from "./db.js";
import {
  listCollections as metaListCollections,
  getCollectionMeta,
  createCollectionMeta,
  updateCollectionMeta,
  collectionExists,
} from "./meta.js";
import { validateDocument, validateFieldDefinitions } from "./schema-validator.js";
import { escIdent, buildCollectionQuery } from "./surql.js";
import type { FieldDefinition } from "./types.js";

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type ToolResult = {
  content: [{ type: "text"; text: string }];
  isError?: true;
};

function ok(data: unknown): ToolResult {
  return {
    content: [{
      type: "text" as const,
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    }],
  };
}

function fail(msg: string): ToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
    isError: true,
  };
}

function failValidation(errors: string[]): ToolResult {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ error: "Validation failed", details: errors }),
    }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Collection name validation
// ---------------------------------------------------------------------------

const COLLECTION_NAME_RE = /^[a-z][a-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function listCollections(): Promise<ToolResult> {
  try {
    const collections = await metaListCollections();
    const db = await getDb();
    const result = await Promise.all(
      collections.map(async (col) => {
        let count = 0;
        try {
          const [countResult] = await db.query<[{ count: number }[]]>(
            `SELECT count() FROM \`${escIdent(col.name)}\` GROUP ALL`,
          );
          count = countResult?.[0]?.count ?? 0;
        } catch {}
        return { name: col.name, description: col.description, count };
      }),
    );
    return ok(result);
  } catch (error) {
    return fail(String(error));
  }
}

export async function getCollectionSchema(params: {
  collection: string;
}): Promise<ToolResult> {
  try {
    const meta = await getCollectionMeta(params.collection);
    if (!meta) return fail(`Collection '${params.collection}' does not exist`);

    const db = await getDb();
    let count = 0;
    try {
      const [countResult] = await db.query<[{ count: number }[]]>(
        `SELECT count() FROM \`${escIdent(params.collection)}\` GROUP ALL`,
      );
      count = countResult?.[0]?.count ?? 0;
    } catch {}

    return ok({
      name: meta.name,
      description: meta.description,
      fields: meta.fields,
      count,
      created_at: meta.created_at,
    });
  } catch (error) {
    return fail(String(error));
  }
}

export async function createCollection(params: {
  name: string;
  description: string;
  fields: FieldDefinition[];
}): Promise<ToolResult> {
  try {
    if (!COLLECTION_NAME_RE.test(params.name)) {
      return fail(
        "Invalid collection name. Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.",
      );
    }
    if (params.name.startsWith("_")) {
      return fail("Collection names starting with '_' are reserved.");
    }
    if (await collectionExists(params.name)) {
      return fail(`Collection '${params.name}' already exists.`);
    }

    const fieldError = validateFieldDefinitions(params.fields);
    if (fieldError) return fail(fieldError);

    await createCollectionMeta(params.name, params.description, params.fields);
    return ok({ success: true, name: params.name, fields_count: params.fields.length });
  } catch (error) {
    return fail(String(error));
  }
}

export async function insertDocument(params: {
  collection: string;
  data: Record<string, unknown>;
}): Promise<ToolResult> {
  try {
    const meta = await getCollectionMeta(params.collection);
    if (!meta) return fail(`Collection '${params.collection}' does not exist`);

    const providedCreatedAt =
      typeof params.data.created_at === "string" &&
      !isNaN(Date.parse(params.data.created_at))
        ? params.data.created_at
        : null;
    const { created_at: _, ...userData } = params.data;

    const validation = validateDocument(meta.fields, userData, "insert");
    if (!validation.success) return failValidation(validation.errors);

    const db = await getDb();
    const docWithTimestamp = {
      ...validation.data,
      created_at: providedCreatedAt || new Date().toISOString(),
    };
    const [record] = await db.create(params.collection, docWithTimestamp);
    const id = String(record.id);

    return ok({ success: true, id });
  } catch (error) {
    return fail(String(error));
  }
}

export async function queryCollection(params: {
  collection: string;
  filters?: Record<string, unknown>;
  sort_by?: string;
  sort_order?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    if (!(await collectionExists(params.collection))) {
      return fail(`Collection '${params.collection}' does not exist`);
    }

    const { query, vars } = buildCollectionQuery(params);

    const db = await getDb();
    const [results] = await db.query<[Record<string, unknown>[]]>(query, vars);

    return ok(results);
  } catch (error) {
    return fail(String(error));
  }
}

export async function updateDocument(params: {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}): Promise<ToolResult> {
  try {
    const meta = await getCollectionMeta(params.collection);
    if (!meta) return fail(`Collection '${params.collection}' does not exist`);

    const validation = validateDocument(meta.fields, params.data, "update");
    if (!validation.success) return failValidation(validation.errors);

    const db = await getDb();
    const record = await db.merge(
      new StringRecordId(params.id),
      validation.data,
    );
    if (!record) return fail(`Document '${params.id}' not found`);

    return ok({ success: true, id: params.id });
  } catch (error) {
    return fail(String(error));
  }
}

export async function deleteDocument(params: {
  collection: string;
  id: string;
}): Promise<ToolResult> {
  try {
    if (!(await collectionExists(params.collection))) {
      return fail(`Collection '${params.collection}' does not exist`);
    }

    const db = await getDb();
    await db.delete(new StringRecordId(params.id));

    return ok({ success: true });
  } catch (error) {
    return fail(String(error));
  }
}

export async function updateCollectionSchema(params: {
  collection: string;
  new_fields: FieldDefinition[];
}): Promise<ToolResult> {
  try {
    const meta = await getCollectionMeta(params.collection);
    if (!meta) return fail(`Collection '${params.collection}' does not exist`);

    for (const field of params.new_fields) {
      if (field.required) {
        return fail(
          `New field '${field.name}' cannot be required. Existing documents would be invalid.`,
        );
      }
    }

    const existingNames = new Set(meta.fields.map((f) => f.name));
    for (const field of params.new_fields) {
      if (existingNames.has(field.name)) {
        return fail(
          `Field '${field.name}' already exists in collection '${params.collection}'`,
        );
      }
    }

    const fieldError = validateFieldDefinitions(params.new_fields);
    if (fieldError) return fail(fieldError);

    const mergedFields = [...meta.fields, ...params.new_fields];
    await updateCollectionMeta(params.collection, mergedFields);

    return ok({ success: true, total_fields: mergedFields.length });
  } catch (error) {
    return fail(String(error));
  }
}
