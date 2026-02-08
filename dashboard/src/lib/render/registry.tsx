"use client";

import { getByPath } from "@json-render/core";
import { useData, defineRegistry } from "@json-render/react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
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

import { catalog } from "./catalog";
import { getSurreal } from "@/lib/surreal";

// =============================================================================
// SurrealDB Query Helper
// =============================================================================

async function querySurrealCollection(
  collection: string,
  filters?: Record<string, unknown> | null,
  sort_by?: string | null,
  sort_order?: string | null,
  limit?: number | null,
): Promise<Record<string, unknown>[]> {
  const db = getSurreal();
  if (!db) throw new Error("SurrealDB not connected");

  const vars: Record<string, unknown> = { table: collection };
  const whereClauses: string[] = [];

  if (filters) {
    let i = 0;
    for (const [field, value] of Object.entries(filters)) {
      vars[`p${i}`] = value;
      whereClauses.push(`${field} = $p${i}`);
      i++;
    }
  }

  let query = `SELECT * FROM type::table($table)`;
  if (whereClauses.length > 0) {
    query += ` WHERE ${whereClauses.join(" AND ")}`;
  }
  query += ` ORDER BY ${sort_by ?? "created_at"} ${(sort_order ?? "desc").toUpperCase()}`;
  query += ` LIMIT ${limit ?? 50}`;

  const [results] = await db.query<[Record<string, unknown>[]]>(query, vars);
  return results ?? [];
}

// =============================================================================
// Chart Data Processing
// =============================================================================

function isISODate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function processChartData(
  items: Array<Record<string, unknown>>,
  xKey: string,
  yKey: string,
  aggregate: "sum" | "count" | "avg" | null | undefined,
): { items: Array<Record<string, unknown>>; valueKey: string } {
  if (items.length === 0) return { items: [], valueKey: yKey };

  const firstXValue = items[0]?.[xKey];
  const isDateKey = isISODate(firstXValue);

  if (!aggregate) {
    const formatted = items.map((item) => {
      const xValue = item[xKey];
      return {
        ...item,
        label: isDateKey && typeof xValue === "string" ? formatDateLabel(xValue) : String(xValue ?? ""),
      };
    });
    return { items: formatted, valueKey: yKey };
  }

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const item of items) {
    const xValue = item[xKey];
    const groupKey = isDateKey && typeof xValue === "string"
      ? (xValue.split("T")[0] ?? xValue)
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
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
            {props.text}
          </span>
        );
      }
      if (variant === "warning") {
        return (
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
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
    Button: ({ props, onAction, loading }) => (
      <Button
        variant={props.variant ?? "default"}
        disabled={loading || (props.disabled ?? false)}
        onClick={() => onAction?.({ name: props.action, params: props.actionParams ?? undefined })}
      >
        {loading ? "..." : props.label}
      </Button>
    ),

    // Data display
    Table: ({ props }) => {
      const { data } = useData();
      const items = resolveData(data, props.dataPath);

      const columns: ColumnDef<Record<string, unknown>>[] = props.columns.map((col) => ({
        accessorKey: col.key,
        header: col.label,
        cell: ({ getValue }) => String(getValue() ?? ""),
      }));

      return (
        <DataTable columns={columns} data={items} emptyMessage={props.emptyMessage ?? undefined} />
      );
    },

    // Charts
    BarChart: ({ props }) => {
      const { data } = useData();
      const rawItems = resolveData(data, props.dataPath);
      const { items, valueKey } = processChartData(rawItems, props.xKey, props.yKey, props.aggregate);
      const chartColor = props.color ?? "var(--chart-1)";
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
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey={valueKey} fill={`var(--color-${valueKey})`} radius={4} />
            </RechartsBarChart>
          </ChartContainer>
        </div>
      );
    },

    LineChart: ({ props }) => {
      const { data } = useData();
      const rawItems = resolveData(data, props.dataPath);
      const { items, valueKey } = processChartData(rawItems, props.xKey, props.yKey, props.aggregate);
      const chartColor = props.color ?? "var(--chart-1)";
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
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey={valueKey} stroke={`var(--color-${valueKey})`} strokeWidth={2} dot={false} />
            </RechartsLineChart>
          </ChartContainer>
        </div>
      );
    },
  },

  actions: {
    queryCollection: async (params, setData) => {
      if (!params?.collection || !params?.dataKey) return;
      try {
        const results = await querySurrealCollection(
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
        const results = await querySurrealCollection(
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
