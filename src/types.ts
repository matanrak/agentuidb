export type FieldType =
  | "string"
  | "int"
  | "float"
  | "bool"
  | "datetime"
  | "array<string>"
  | "array<int>"
  | "array<float>"
  | "object";

export interface FieldDefinition {
  name: string;
  type: FieldType;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

export interface CollectionMeta {
  [key: string]: unknown;
  id?: string;
  name: string;
  description: string;
  fields: FieldDefinition[];
  created_at: string;
  updated_at: string;
}
