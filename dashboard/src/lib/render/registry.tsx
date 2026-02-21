"use client";

import { getByPath } from "@json-render/core";
import { useStateStore, useActions, defineRegistry } from "@json-render/react";
import {
  Area,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart as RechartsLineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import { useCallback } from "react";
import { catalog } from "./catalog";
import { useEdit } from "./edit-context";

// =============================================================================
// DB Query Helper
// =============================================================================

async function queryDbCollection(
  collection: string,
  filters?: Record<string, unknown> | null,
  sort_by?: string | null,
  sort_order?: string | null,
  limit?: number | null,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/collections/${encodeURIComponent(collection)}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters, sort_by, sort_order, limit: limit ?? 50 }),
  });
  if (!res.ok) throw new Error(`Failed to query collection ${collection}`);
  return res.json();
}

// =============================================================================
// Chart Data Processing
// =============================================================================

function isDateValue(value: unknown): boolean {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}(T|\s)/.test(value);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateLabel(value: unknown): string {
  const date = toDate(value);
  if (!date) return String(value ?? "");
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function toDateGroupKey(value: unknown): string {
  const date = toDate(value);
  if (!date) return String(value ?? "unknown");
  return date.toISOString().split("T")[0] ?? String(value);
}

function processChartData(
  items: Array<Record<string, unknown>>,
  xKey: string,
  yKey: string,
  aggregate: "sum" | "count" | "avg" | null | undefined,
): { items: Array<Record<string, unknown>>; valueKey: string } {
  if (items.length === 0) return { items: [], valueKey: yKey };

  const firstXValue = items[0]?.[xKey];
  const isDateKey = isDateValue(firstXValue);

  if (!aggregate) {
    const formatted = items.map((item) => {
      const xValue = item[xKey];
      return {
        ...item,
        label: isDateKey ? formatDateLabel(xValue) : String(xValue ?? ""),
      };
    });
    return { items: formatted, valueKey: yKey };
  }

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const item of items) {
    const xValue = item[xKey];
    const groupKey = isDateKey
      ? toDateGroupKey(xValue)
      : String(xValue ?? "unknown");
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  const valueKey = aggregate === "count" ? "count" : yKey;
  const aggregated: Array<Record<string, unknown>> = [];

  for (const key of Array.from(groups.keys()).sort()) {
    const group = groups.get(key)!;
    let value: number;

    if (aggregate === "count") {
      value = group.length;
    } else if (aggregate === "sum") {
      value = group.reduce((sum, item) => {
        const v = item[yKey];
        return sum + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
      }, 0);
    } else {
      const sum = group.reduce((s, item) => {
        const v = item[yKey];
        return s + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
      }, 0);
      value = group.length > 0 ? sum / group.length : 0;
    }

    const label = isDateKey
      ? new Date(key).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
      : key;

    aggregated.push({ label, [valueKey]: value });
  }

  return { items: aggregated, valueKey };
}

// =============================================================================
// Data Resolver Helper
// =============================================================================

function resolveData(data: Record<string, unknown>, dataPath: string): Array<Record<string, unknown>> {
  const path = dataPath.replace(/\./g, "/");
  const rawData = getByPath(data, path);
  if (Array.isArray(rawData)) return rawData;
  const obj = rawData as Record<string, unknown> | undefined;
  if (Array.isArray(obj?.data)) return obj!.data as Array<Record<string, unknown>>;
  return [];
}

// =============================================================================
// Table Filter Helper
// =============================================================================

type FilterOp = "gt" | "lt" | "gte" | "lte" | "eq" | "neq";

function applyFilters(
  items: Array<Record<string, unknown>>,
  filters: Array<{ key: string; operator: FilterOp; value: number | string }> | null | undefined,
): Array<Record<string, unknown>> {
  if (!filters || filters.length === 0) return items;
  return items.filter((row) =>
    filters.every((f) => {
      const raw = row[f.key];
      const rowVal = typeof raw === "number" ? raw : parseFloat(String(raw));
      const filterVal = typeof f.value === "number" ? f.value : parseFloat(String(f.value));
      if (isNaN(rowVal) || isNaN(filterVal)) {
        // Fall back to string comparison for non-numeric values
        const a = String(raw ?? "");
        const b = String(f.value);
        switch (f.operator) {
          case "eq": return a === b;
          case "neq": return a !== b;
          default: return true;
        }
      }
      switch (f.operator) {
        case "gt": return rowVal > filterVal;
        case "lt": return rowVal < filterVal;
        case "gte": return rowVal >= filterVal;
        case "lte": return rowVal <= filterVal;
        case "eq": return rowVal === filterVal;
        case "neq": return rowVal !== filterVal;
      }
    }),
  );
}

// =============================================================================
// Color Rules Helper
// =============================================================================

type ColorRule = {
  condition: { field: string; operator: FilterOp; value: number };
  color: string;
};

function resolveBarColor(
  entry: Record<string, unknown>,
  colorRules: ColorRule[] | null | undefined,
  defaultColor: string,
): string {
  if (!colorRules || colorRules.length === 0) return defaultColor;
  for (const rule of colorRules) {
    const raw = entry[rule.condition.field];
    const val = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (isNaN(val)) continue;
    const target = rule.condition.value;
    let match = false;
    switch (rule.condition.operator) {
      case "gt": match = val > target; break;
      case "lt": match = val < target; break;
      case "gte": match = val >= target; break;
      case "lte": match = val <= target; break;
      case "eq": match = val === target; break;
      case "neq": match = val !== target; break;
    }
    if (match) return rule.color;
  }
  return defaultColor;
}

// =============================================================================
// Multi-Key Chart Data Processing (for CompositeChart)
// =============================================================================

function processCompositeData(
  items: Array<Record<string, unknown>>,
  xKey: string,
  yKeys: string[],
  aggregate: "sum" | "count" | "avg" | null | undefined,
): Array<Record<string, unknown>> {
  if (items.length === 0) return [];

  const firstXValue = items[0]?.[xKey];
  const isDateKey = isDateValue(firstXValue);

  if (!aggregate) {
    return items.map((item) => ({
      ...item,
      label: isDateKey ? formatDateLabel(item[xKey]) : String(item[xKey] ?? ""),
    }));
  }

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const item of items) {
    const xValue = item[xKey];
    const groupKey = isDateKey ? toDateGroupKey(xValue) : String(xValue ?? "unknown");
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  const result: Array<Record<string, unknown>> = [];
  for (const key of Array.from(groups.keys()).sort()) {
    const group = groups.get(key)!;
    const label = isDateKey
      ? new Date(key).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
      : key;

    const row: Record<string, unknown> = { label };

    for (const yKey of yKeys) {
      if (aggregate === "count") {
        row[yKey] = group.length;
      } else if (aggregate === "sum") {
        row[yKey] = group.reduce((sum, item) => {
          const v = item[yKey];
          return sum + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
        }, 0);
      } else {
        const sum = group.reduce((s, item) => {
          const v = item[yKey];
          return s + (typeof v === "number" ? v : parseFloat(String(v)) || 0);
        }, 0);
        row[yKey] = group.length > 0 ? sum / group.length : 0;
      }
    }

    result.push(row);
  }
  return result;
}

// =============================================================================
// Registry
// =============================================================================

export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  components: {
    // Layout
    Stack: ({ props, children }) => {
      const gapClass = { sm: "gap-2", md: "gap-4", lg: "gap-6" }[props.gap ?? "md"] ?? "gap-4";
      const justifyClass = {
        start: "justify-start",
        end: "justify-end",
        center: "justify-center",
        between: "justify-between",
        around: "justify-around",
      }[props.justify ?? "start"] ?? "";
      const alignClass = {
        start: "items-start",
        end: "items-end",
        center: "items-center",
        stretch: "items-stretch",
      }[props.align ?? "stretch"] ?? "";
      return (
        <div className={`flex ${props.direction === "horizontal" ? "flex-row flex-wrap" : "flex-col"} ${gapClass} ${justifyClass} ${alignClass}`}>
          {children}
        </div>
      );
    },

    Grid: ({ props, children }) => {
      const gapClass = { sm: "gap-2", md: "gap-4", lg: "gap-6" }[props.gap ?? "md"] ?? "gap-4";
      const colsClass = {
        1: "grid-cols-1",
        2: "grid-cols-2",
        3: "grid-cols-3",
        4: "grid-cols-4",
        5: "grid-cols-5",
        6: "grid-cols-6",
      }[props.columns] ?? `grid-cols-${props.columns}`;
      return (
        <div className={`grid ${colsClass} ${gapClass}`}>
          {children}
        </div>
      );
    },

    Card: ({ props, children }) => (
      <Card className={props.centered ? "text-center" : ""}>
        {(props.title || props.description) && (
          <CardHeader>
            {props.title && <CardTitle>{props.title}</CardTitle>}
            {props.description && <CardDescription>{props.description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent>{children}</CardContent>
      </Card>
    ),

    // Typography
    Heading: ({ props }) => {
      const level = props.level ?? "h2";
      const sizes: Record<string, string> = { h1: "text-3xl", h2: "text-2xl", h3: "text-xl", h4: "text-lg" };
      const className = `font-bold ${sizes[level]}`;
      switch (level) {
        case "h1": return <h1 className={className}>{props.text}</h1>;
        case "h3": return <h3 className={className}>{props.text}</h3>;
        case "h4": return <h4 className={className}>{props.text}</h4>;
        default: return <h2 className={className}>{props.text}</h2>;
      }
    },

    Text: ({ props }) => {
      const text = props.content ?? props.text ?? "";
      const variantClass = {
        body: "",
        caption: "text-xs text-muted-foreground",
        muted: "text-muted-foreground",
      }[props.variant ?? "body"] ?? "";
      const mutedClass = props.muted ? "text-muted-foreground" : "";
      return <p className={`${variantClass} ${mutedClass}`.trim() || undefined}>{text}</p>;
    },

    // Display
    Badge: ({ props }) => {
      const variant = props.variant ?? "default";
      // Map success/warning to custom styles since shadcn Badge doesn't have these natively
      if (variant === "success") {
        return (
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-success/10 text-success border-success/20">
            {props.text}
          </span>
        );
      }
      if (variant === "warning") {
        return (
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-warning/10 text-warning border-warning/20">
            {props.text}
          </span>
        );
      }
      return <Badge variant={variant as "default" | "secondary" | "destructive" | "outline"}>{props.text}</Badge>;
    },

    Alert: ({ props }) => (
      <Alert variant={props.variant ?? "default"}>
        <AlertTitle>{props.title}</AlertTitle>
        {props.description && <AlertDescription>{props.description}</AlertDescription>}
      </Alert>
    ),

    Separator: () => <Separator />,
    Divider: () => <Separator />,

    Progress: ({ props }) => (
      <div className="flex flex-col gap-1">
        <Progress value={props.value} max={props.max ?? 100} />
        {props.label && <p className="text-xs text-muted-foreground">{props.label}</p>}
      </div>
    ),

    Avatar: ({ props }) => (
      <Avatar>
        {props.src && <AvatarImage src={props.src} alt={props.alt ?? ""} />}
        <AvatarFallback>{props.fallback}</AvatarFallback>
      </Avatar>
    ),

    Skeleton: ({ props }) => (
      <Skeleton className={`${props.width ?? "w-full"} ${props.height ?? "h-4"}`} />
    ),

    // Navigation
    Tabs: ({ props, children }) => (
      <Tabs defaultValue={props.defaultValue ?? props.tabs[0]?.value}>
        <TabsList>
          {props.tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
        {children}
      </Tabs>
    ),

    TabContent: ({ props, children }) => (
      <TabsContent value={props.value}>{children}</TabsContent>
    ),

    // Interactive
    Button: ({ props, loading }) => {
      const { execute } = useActions();
      return (
        <Button
          variant={props.variant ?? "default"}
          disabled={loading || (props.disabled ?? false)}
          onClick={() => execute({ action: props.action, params: props.actionParams ?? undefined })}
        >
          {loading ? "..." : props.label}
        </Button>
      );
    },

    // Data display
    Table: ({ props }) => {
      const { state: data } = useStateStore();
      const rawItems = resolveData(data, props.dataPath);
      const items = applyFilters(rawItems, props.filter);
      const editable = props.editable ?? false;
      const edit = useEdit();

      const columns: ColumnDef<Record<string, unknown>>[] = props.columns.map((col) => ({
        accessorKey: col.key,
        header: col.label,
        cell: ({ getValue }) => String(getValue() ?? ""),
      }));

      const handleCellEdit = useCallback(
        (recordId: string, field: string, newValue: string) => {
          const originalRow = items.find((item) => String(item.id) === recordId);
          const originalValue = originalRow?.[field];
          edit.trackEdit(recordId, field, newValue, originalValue);
        },
        [edit, items],
      );

      return (
        <DataTable
          columns={columns}
          data={items}
          emptyMessage={props.emptyMessage ?? undefined}
          editable={editable}
          onCellEdit={editable ? handleCellEdit : undefined}
          onRowDelete={editable ? edit.trackDelete : undefined}
          onRowRestore={editable ? edit.trackRestore : undefined}
          isRowDeleted={editable ? edit.isDeleted : undefined}
          isCellEdited={editable ? edit.isEdited : undefined}
          getEditedValue={editable ? edit.getEditedValue : undefined}
        />
      );
    },

    // Charts
    BarChart: ({ props }) => {
      const { state: data } = useStateStore();
      const rawItems = resolveData(data, props.dataPath);
      const { items, valueKey } = processChartData(rawItems, props.xKey, props.yKey, props.aggregate);
      const chartColor = props.color ?? "var(--chart-1)";
      const refLineColor = props.referenceLineColor ?? "#ef4444";
      const hasRefLine = props.referenceLine != null;

      // Build effective color rules: explicit colorRules take priority, then thresholdColor shorthand
      const effectiveColorRules: ColorRule[] | null = props.colorRules ??
        (props.thresholdColor && hasRefLine
          ? [{ condition: { field: valueKey, operator: "gt" as FilterOp, value: props.referenceLine! }, color: props.thresholdColor }]
          : null);
      const hasConditionalColor = effectiveColorRules && effectiveColorRules.length > 0;

      const chartConfig = { [valueKey]: { label: valueKey, color: chartColor } } satisfies ChartConfig;

      if (items.length === 0) {
        return <div className="text-center py-4 text-muted-foreground">No data available</div>;
      }

      return (
        <div className="w-full">
          {props.title && <p className="text-sm font-medium mb-2">{props.title}</p>}
          <ChartContainer config={chartConfig} className="min-h-[200px] w-full" style={{ height: props.height ?? 300 }}>
            <RechartsBarChart accessibilityLayer data={items}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis hide domain={hasRefLine ? [0, (dataMax: number) => Math.max(dataMax, props.referenceLine! * 1.1)] : undefined} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {hasConditionalColor ? (
                <Bar dataKey={valueKey} radius={4}>
                  {items.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={resolveBarColor(entry, effectiveColorRules, chartColor)}
                    />
                  ))}
                </Bar>
              ) : (
                <Bar dataKey={valueKey} fill={`var(--color-${valueKey})`} radius={4} />
              )}
              {hasRefLine && (
                <ReferenceLine
                  y={props.referenceLine!}
                  stroke={refLineColor}
                  strokeDasharray="6 3"
                  strokeWidth={2}
                  label={props.referenceLineLabel ? {
                    value: props.referenceLineLabel,
                    position: "insideTopRight",
                    fill: refLineColor,
                    fontSize: 12,
                    fontWeight: 600,
                  } : undefined}
                />
              )}
            </RechartsBarChart>
          </ChartContainer>
        </div>
      );
    },

    LineChart: ({ props }) => {
      const { state: data } = useStateStore();
      const rawItems = resolveData(data, props.dataPath);
      const { items, valueKey } = processChartData(rawItems, props.xKey, props.yKey, props.aggregate);
      const chartColor = props.color ?? "var(--chart-1)";
      const refLineColor = props.referenceLineColor ?? "#ef4444";
      const hasThreshold = props.referenceLine != null;
      const chartConfig = { [valueKey]: { label: valueKey, color: chartColor } } satisfies ChartConfig;

      if (items.length === 0) {
        return <div className="text-center py-4 text-muted-foreground">No data available</div>;
      }

      return (
        <div className="w-full">
          {props.title && <p className="text-sm font-medium mb-2">{props.title}</p>}
          <ChartContainer config={chartConfig} className="min-h-[200px] w-full" style={{ height: props.height ?? 300 }}>
            <RechartsLineChart accessibilityLayer data={items}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} />
              {hasThreshold && <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, props.referenceLine! * 1.1)]} />}
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey={valueKey} stroke={`var(--color-${valueKey})`} strokeWidth={2} dot={false} />
              {hasThreshold && (
                <ReferenceLine
                  y={props.referenceLine!}
                  stroke={refLineColor}
                  strokeDasharray="6 3"
                  strokeWidth={2}
                  label={props.referenceLineLabel ? {
                    value: props.referenceLineLabel,
                    position: "insideTopRight",
                    fill: refLineColor,
                    fontSize: 12,
                    fontWeight: 600,
                  } : undefined}
                />
              )}
            </RechartsLineChart>
          </ChartContainer>
        </div>
      );
    },

    CompositeChart: ({ props }) => {
      const { state: data } = useStateStore();
      const rawItems = resolveData(data, props.dataPath);

      // Collect all yKeys from layers that need data
      const yKeys = props.layers
        .filter((l) => l.type !== "referenceLine" && l.yKey)
        .map((l) => l.yKey!);
      const items = processCompositeData(rawItems, props.xKey, yKeys, props.aggregate);

      // Build chart config for all data layers
      const chartConfig: ChartConfig = {};
      for (const layer of props.layers) {
        if (layer.type !== "referenceLine" && layer.yKey) {
          chartConfig[layer.yKey] = { label: layer.yKey, color: layer.color ?? "var(--chart-1)" };
        }
      }

      if (items.length === 0) {
        return <div className="text-center py-4 text-muted-foreground">No data available</div>;
      }

      return (
        <div className="w-full">
          {props.title && <p className="text-sm font-medium mb-2">{props.title}</p>}
          <ChartContainer config={chartConfig} className="min-h-[200px] w-full" style={{ height: props.height ?? 300 }}>
            <ComposedChart accessibilityLayer data={items}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis hide domain={(() => {
                const refLayer = props.layers.find((l) => l.type === "referenceLine" && l.y != null);
                return refLayer ? [0, (dataMax: number) => Math.max(dataMax, (refLayer.y as number) * 1.1)] : undefined;
              })()} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {props.layers.map((layer, i) => {
                const key = `layer-${i}`;
                const color = layer.color ?? "var(--chart-1)";

                switch (layer.type) {
                  case "bar":
                    if (!layer.yKey) return null;
                    if (layer.colorRules && layer.colorRules.length > 0) {
                      return (
                        <Bar key={key} dataKey={layer.yKey} radius={4}>
                          {items.map((entry, j) => (
                            <Cell key={j} fill={resolveBarColor(entry, layer.colorRules as ColorRule[], color)} />
                          ))}
                        </Bar>
                      );
                    }
                    return <Bar key={key} dataKey={layer.yKey} fill={color} radius={4} />;

                  case "line":
                    if (!layer.yKey) return null;
                    return <Line key={key} type="monotone" dataKey={layer.yKey} stroke={color} strokeWidth={2} dot={false} />;

                  case "area":
                    if (!layer.yKey) return null;
                    return <Area key={key} type="monotone" dataKey={layer.yKey} fill={color} stroke={color} fillOpacity={0.2} />;

                  case "referenceLine":
                    if (layer.y == null) return null;
                    return (
                      <ReferenceLine
                        key={key}
                        y={layer.y}
                        stroke={color}
                        strokeDasharray="6 3"
                        strokeWidth={2}
                        label={layer.label ? {
                          value: layer.label,
                          position: "insideTopRight" as const,
                          fill: color,
                          fontSize: 12,
                          fontWeight: 600,
                        } : undefined}
                      />
                    );

                  default:
                    return null;
                }
              })}
            </ComposedChart>
          </ChartContainer>
        </div>
      );
    },
  },

  actions: {
    queryCollection: async (params, setData) => {
      if (!params?.collection || !params?.dataKey) return;
      try {
        const results = await queryDbCollection(
          params.collection as string,
          params.filters as Record<string, unknown> | null,
          params.sort_by as string | null,
          params.sort_order as string | null,
          params.limit as number | null,
        );
        setData((prev) => ({ ...prev, [params.dataKey as string]: results }));
      } catch (err) {
        console.error("queryCollection failed:", err);
      }
    },

    refreshData: async (params, setData) => {
      if (!params?.collection || !params?.dataKey) return;
      try {
        const results = await queryDbCollection(
          params.collection as string,
          null,
          null,
          null,
          params.limit as number | null,
        );
        setData((prev) => ({ ...prev, [params.dataKey as string]: results }));
      } catch (err) {
        console.error("refreshData failed:", err);
      }
    },
  },
});

// =============================================================================
// Fallback Component
// =============================================================================

export function Fallback({ type }: { type: string }) {
  return (
    <div className="p-4 border border-dashed rounded-lg text-muted-foreground text-sm">
      Unknown component: {type}
    </div>
  );
}
