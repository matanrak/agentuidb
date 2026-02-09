/**
 * Data Transform Pipeline
 *
 * Allows AI-generated specs to define derived datasets via transforms.
 * Transforms run after raw data loads from SurrealDB and produce new
 * data keys that components can reference via dataPath.
 */

// =============================================================================
// Types
// =============================================================================

export interface GroupAggregateStep {
  type: "groupAggregate";
  groupBy: string;
  granularity?: "day" | "week" | "month" | "year";
  aggregations: Array<{
    field: string;
    method: "sum" | "count" | "avg" | "min" | "max";
    as: string;
  }>;
}

export interface FilterStep {
  type: "filter";
  key: string;
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "neq";
  value: number | string;
}

export interface SortStep {
  type: "sort";
  key: string;
  order: "asc" | "desc";
}

export interface ComputeStep {
  type: "compute";
  as: string;
  field: string;
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "neq" | "add" | "sub" | "mul" | "div";
  value: number;
}

export type TransformStep = GroupAggregateStep | FilterStep | SortStep | ComputeStep;

export interface TransformDef {
  source: string;
  output: string;
  steps: TransformStep[];
}

// =============================================================================
// Date Helpers
// =============================================================================

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toDateGroupKey(value: unknown, granularity: string): string {
  const date = toDate(value);
  if (!date) return String(value ?? "unknown");
  switch (granularity) {
    case "day":
      return date.toISOString().split("T")[0]!;
    case "week": {
      const d = new Date(date);
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().split("T")[0]!;
    }
    case "month":
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    case "year":
      return String(date.getFullYear());
    default:
      return date.toISOString().split("T")[0]!;
  }
}

function formatGroupLabel(key: string, granularity?: string): string {
  if (!granularity || granularity === "day") {
    const d = new Date(key);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
    }
  }
  if (granularity === "month") {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
  }
  return key;
}

// =============================================================================
// Step Executors
// =============================================================================

function executeGroupAggregate(
  items: Array<Record<string, unknown>>,
  step: GroupAggregateStep,
): Array<Record<string, unknown>> {
  const groups = new Map<string, Array<Record<string, unknown>>>();

  for (const item of items) {
    const raw = item[step.groupBy];
    const key = step.granularity ? toDateGroupKey(raw, step.granularity) : String(raw ?? "unknown");
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const result: Array<Record<string, unknown>> = [];
  for (const key of Array.from(groups.keys()).sort()) {
    const group = groups.get(key)!;
    const row: Record<string, unknown> = {
      _group: key,
      label: formatGroupLabel(key, step.granularity),
    };

    for (const agg of step.aggregations) {
      const values = group.map((item) => {
        const v = item[agg.field];
        return typeof v === "number" ? v : parseFloat(String(v)) || 0;
      });

      switch (agg.method) {
        case "sum":
          row[agg.as] = values.reduce((a, b) => a + b, 0);
          break;
        case "count":
          row[agg.as] = group.length;
          break;
        case "avg":
          row[agg.as] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          break;
        case "min":
          row[agg.as] = values.length > 0 ? Math.min(...values) : 0;
          break;
        case "max":
          row[agg.as] = values.length > 0 ? Math.max(...values) : 0;
          break;
      }
    }
    result.push(row);
  }
  return result;
}

function executeFilter(
  items: Array<Record<string, unknown>>,
  step: FilterStep,
): Array<Record<string, unknown>> {
  return items.filter((row) => {
    const raw = row[step.key];
    const rowVal = typeof raw === "number" ? raw : parseFloat(String(raw));
    const filterVal = typeof step.value === "number" ? step.value : parseFloat(String(step.value));

    if (isNaN(rowVal) || isNaN(filterVal)) {
      const a = String(raw ?? "");
      const b = String(step.value);
      switch (step.operator) {
        case "eq": return a === b;
        case "neq": return a !== b;
        default: return true;
      }
    }

    switch (step.operator) {
      case "gt": return rowVal > filterVal;
      case "lt": return rowVal < filterVal;
      case "gte": return rowVal >= filterVal;
      case "lte": return rowVal <= filterVal;
      case "eq": return rowVal === filterVal;
      case "neq": return rowVal !== filterVal;
    }
  });
}

function executeSort(
  items: Array<Record<string, unknown>>,
  step: SortStep,
): Array<Record<string, unknown>> {
  return [...items].sort((a, b) => {
    const aVal = a[step.key];
    const bVal = b[step.key];
    const aNum = typeof aVal === "number" ? aVal : parseFloat(String(aVal));
    const bNum = typeof bVal === "number" ? bVal : parseFloat(String(bVal));

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return step.order === "asc" ? aNum - bNum : bNum - aNum;
    }
    const aStr = String(aVal ?? "");
    const bStr = String(bVal ?? "");
    return step.order === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
  });
}

function executeCompute(
  items: Array<Record<string, unknown>>,
  step: ComputeStep,
): Array<Record<string, unknown>> {
  return items.map((row) => {
    const raw = row[step.field];
    const val = typeof raw === "number" ? raw : parseFloat(String(raw)) || 0;
    let result: unknown;

    switch (step.operator) {
      case "gt": result = val > step.value; break;
      case "lt": result = val < step.value; break;
      case "gte": result = val >= step.value; break;
      case "lte": result = val <= step.value; break;
      case "eq": result = val === step.value; break;
      case "neq": result = val !== step.value; break;
      case "add": result = val + step.value; break;
      case "sub": result = val - step.value; break;
      case "mul": result = val * step.value; break;
      case "div": result = step.value !== 0 ? val / step.value : 0; break;
    }

    return { ...row, [step.as]: result };
  });
}

// =============================================================================
// Main Pipeline
// =============================================================================

function executeStep(
  items: Array<Record<string, unknown>>,
  step: TransformStep,
): Array<Record<string, unknown>> {
  switch (step.type) {
    case "groupAggregate": return executeGroupAggregate(items, step);
    case "filter": return executeFilter(items, step);
    case "sort": return executeSort(items, step);
    case "compute": return executeCompute(items, step);
    default: return items;
  }
}

export function applyTransforms(
  data: Record<string, unknown>,
  transforms: TransformDef[],
): Record<string, unknown> {
  const result = { ...data };

  for (const transform of transforms) {
    const sourceData = result[transform.source];
    if (!Array.isArray(sourceData)) continue;

    let items = sourceData as Array<Record<string, unknown>>;
    for (const step of transform.steps) {
      items = executeStep(items, step);
    }
    result[transform.output] = items;
  }

  return result;
}

/**
 * Extract transform definitions from a spec.
 *
 * Transforms are stored as a special `_transforms` element in the spec's
 * elements map. This is necessary because @json-render's useUIStream
 * only supports patches to /root and /elements/* — top-level fields
 * like /transforms get silently dropped.
 *
 * The _transforms element is never rendered because it's not included
 * in any visible element's children array.
 */
export function extractTransforms(spec: unknown): TransformDef[] {
  const s = spec as { elements?: Record<string, unknown> };
  const transformsEl = s?.elements?.["_transforms"] as { props?: { transforms?: unknown } } | undefined;
  if (transformsEl?.props?.transforms && Array.isArray(transformsEl.props.transforms)) {
    return transformsEl.props.transforms as TransformDef[];
  }
  return [];
}

/**
 * Extract real collection names referenced by transforms.
 * Only returns source names that aren't themselves transform outputs,
 * so only real SurrealDB collections get queried.
 */
export function extractTransformCollections(transforms: TransformDef[]): string[] {
  const outputs = new Set(transforms.map((t) => t.output));
  const collections = new Set<string>();
  for (const t of transforms) {
    const source = t.source.split(".")[0]!;
    // Only add if this source isn't produced by another transform
    if (!outputs.has(source)) {
      collections.add(source);
    }
  }
  return Array.from(collections);
}
