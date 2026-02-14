import { z, type ZodTypeAny } from "zod";
import type { FieldDefinition, FieldType } from "./types.js";

function zodTypeForField(field: FieldDefinition): ZodTypeAny {
  let base: ZodTypeAny;

  switch (field.type) {
    case "string":
      base = field.enum ? z.enum(field.enum as [string, ...string[]]) : z.string();
      break;
    case "int":
      base = z.number().int();
      break;
    case "float":
      base = z.number();
      break;
    case "bool":
      base = z.boolean();
      break;
    case "datetime":
      // Accept ISO 8601 with or without timezone offset
      base = z.string().regex(
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
        "Expected ISO 8601 datetime (e.g. 2026-02-08T12:00:00Z or 2026-02-08)"
      );
      break;
    case "array<string>":
      base = z.array(z.string());
      break;
    case "array<int>":
      base = z.array(z.number().int());
      break;
    case "array<float>":
      base = z.array(z.number());
      break;
    case "object":
      base = z.record(z.unknown());
      break;
    default:
      base = z.unknown();
  }

  return base;
}

export function validateDocument(
  fields: FieldDefinition[],
  data: Record<string, unknown>,
  mode: "insert" | "update"
): { success: true; data: Record<string, unknown> } | { success: false; errors: string[] } {
  const shape: Record<string, ZodTypeAny> = {};

  for (const field of fields) {
    let fieldSchema = zodTypeForField(field);

    if (mode === "update" || !field.required) {
      fieldSchema = fieldSchema.nullable().optional();
    }

    shape[field.name] = fieldSchema;
  }

  const schema =
    mode === "update"
      ? z.object(shape).partial().strict()
      : z.object(shape).strict();

  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  }

  return {
    success: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    ),
  };
}

const VALID_FIELD_TYPES: FieldType[] = [
  "string", "int", "float", "bool", "datetime",
  "array<string>", "array<int>", "array<float>", "object",
];

export function validateFieldDefinitions(
  fields: FieldDefinition[]
): string | null {
  if (fields.length === 0) {
    return "At least one field is required";
  }

  const names = new Set<string>();
  for (const field of fields) {
    if (names.has(field.name)) {
      return `Duplicate field name: '${field.name}'`;
    }
    names.add(field.name);

    if (!VALID_FIELD_TYPES.includes(field.type)) {
      return `Invalid type '${field.type}' for field '${field.name}'. Valid types: ${VALID_FIELD_TYPES.join(", ")}`;
    }

    if (field.name === "id") {
      return "Field name 'id' is reserved (auto-generated)";
    }
  }

  return null;
}
