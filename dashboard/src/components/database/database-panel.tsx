"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Hash,
  Type,
  ToggleLeft,
  Calendar,
  List,
  Braces,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Database,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCollections,
  type FieldDefinition,
} from "@/hooks/use-collections";
import { cn } from "@/lib/utils";

const RECORD_LIMIT = 100;

// ─── Field type visual config ────────────────────────────────────────

const FIELD_TYPE_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string; icon: React.ElementType }
> = {
  string: {
    bg: "bg-sky-500/10",
    text: "text-sky-600 dark:text-sky-400",
    dot: "bg-sky-400",
    icon: Type,
  },
  int: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-400",
    icon: Hash,
  },
  float: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-400",
    icon: Hash,
  },
  bool: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-400",
    icon: ToggleLeft,
  },
  datetime: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    dot: "bg-violet-400",
    icon: Calendar,
  },
  "array<string>": {
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    dot: "bg-cyan-400",
    icon: List,
  },
  "array<int>": {
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    dot: "bg-cyan-400",
    icon: List,
  },
  "array<float>": {
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    dot: "bg-cyan-400",
    icon: List,
  },
  object: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-400",
    icon: Braces,
  },
};

function getFieldConfig(type: string) {
  return FIELD_TYPE_CONFIG[type] ?? FIELD_TYPE_CONFIG.string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return value.length === 0 ? "[ ]" : value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(value: unknown): string {
  if (!value) return "\u2014";
  try {
    const d = new Date(String(value));
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

function parseFields(
  fields: FieldDefinition[] | string | undefined,
): FieldDefinition[] {
  if (!fields) return [];
  if (typeof fields === "string") {
    try {
      return JSON.parse(fields);
    } catch {
      return [];
    }
  }
  return fields;
}

// ─── Sort indicator ──────────────────────────────────────────────────

function SortIndicator({
  field,
  current,
}: {
  field: string;
  current: { field: string; dir: "asc" | "desc" } | null;
}) {
  if (current?.field !== field)
    return <ArrowUpDown className="size-3 opacity-20" />;
  return current.dir === "asc" ? (
    <ArrowUp className="size-3" />
  ) : (
    <ArrowDown className="size-3" />
  );
}

// ─── Database Panel ──────────────────────────────────────────────────

export function DatabasePanel() {
  const { collections, loading: collectionsLoading } = useCollections();
  const [selected, setSelected] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [search, setSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [sort, setSort] = useState<{
    field: string;
    dir: "asc" | "desc";
  } | null>(null);

  const meta = useMemo(
    () => collections.find((c) => c.name === selected),
    [collections, selected],
  );
  const fields = useMemo(() => parseFields(meta?.fields), [meta]);

  // Auto-select first collection
  useEffect(() => {
    if (!selected && collections.length > 0) setSelected(collections[0].name);
  }, [collections, selected]);

  // Derive record counts from collection metadata (returned by /api/collections)
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const col of collections) {
      map[col.name] = (col as unknown as { count?: number }).count ?? 0;
    }
    return map;
  }, [collections]);

  // Fetch records for selected collection
  useEffect(() => {
    if (!selected) {
      setRecords([]);
      return;
    }
    setLoadingRecords(true);
    setSearch("");
    setSort(null);
    fetch(`/api/collections/${encodeURIComponent(selected)}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sort_by: "created_at",
        sort_order: "desc",
        limit: RECORD_LIMIT,
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((rows) => setRecords(rows ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoadingRecords(false));
  }, [selected]);

  // Filtered & sorted records
  const displayRecords = useMemo(() => {
    let result = records;
    if (search) {
      const term = search.toLowerCase();
      result = result.filter((r) =>
        Object.values(r).some((v) =>
          formatValue(v).toLowerCase().includes(term),
        ),
      );
    }
    if (sort) {
      const { field, dir } = sort;
      result = [...result].sort((a, b) => {
        const av = a[field],
          bv = b[field];
        if (typeof av === "number" && typeof bv === "number")
          return dir === "asc" ? av - bv : bv - av;
        return dir === "asc"
          ? String(av ?? "").localeCompare(String(bv ?? ""))
          : String(bv ?? "").localeCompare(String(av ?? ""));
      });
    }
    return result;
  }, [records, search, sort]);

  const filteredCollections = useMemo(() => {
    if (!sidebarFilter) return collections;
    const term = sidebarFilter.toLowerCase();
    return collections.filter((c) => c.name.toLowerCase().includes(term));
  }, [collections, sidebarFilter]);

  const toggleSort = (field: string) => {
    setSort((prev) => {
      if (prev?.field !== field) return { field, dir: "asc" };
      if (prev.dir === "asc") return { field, dir: "desc" };
      return null;
    });
  };

  const totalCount = selected ? (counts[selected] ?? 0) : 0;

  return (
    <div className="h-full flex">
      {/* ──── Sidebar ──── */}
      <aside className="w-72 shrink-0 border-r border-border/60 flex flex-col bg-sidebar">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="size-4 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Collections
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {collections.length}
            </span>
          </div>
          {collections.length > 3 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter..."
                value={sidebarFilter}
                onChange={(e) => setSidebarFilter(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 pb-2">
            {collectionsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-3 py-3">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))
            ) : filteredCollections.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                {collections.length === 0 ? "No collections yet" : "No matches"}
              </p>
            ) : (
              filteredCollections.map((col) => {
                const colFields = parseFields(col.fields);
                const isActive = col.name === selected;
                return (
                  <button
                    key={col.name}
                    onClick={() => setSelected(col.name)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg transition-all mb-0.5",
                      isActive
                        ? "bg-primary/8 border-l-2 border-primary"
                        : "border-l-2 border-transparent hover:bg-accent/50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-sm truncate",
                          isActive
                            ? "font-semibold"
                            : "font-medium text-foreground/80",
                        )}
                      >
                        {col.name}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground ml-2 shrink-0">
                        {counts[col.name] ?? "\u2014"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="flex items-center gap-0.5">
                        {colFields.slice(0, 8).map((f) => (
                          <div
                            key={f.name}
                            className={cn(
                              "size-1.5 rounded-full opacity-50",
                              getFieldConfig(f.type).dot,
                            )}
                            title={`${f.name}: ${f.type}`}
                          />
                        ))}
                        {colFields.length > 8 && (
                          <span className="text-[10px] text-muted-foreground ml-0.5">
                            +{colFields.length - 8}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {colFields.length} field
                        {colFields.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* ──── Main content ──── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected || !meta ? (
          <div className="flex-1 flex items-center justify-center empty-state-glow">
            <div className="text-center">
              <Database className="size-12 text-muted-foreground/25 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {collections.length === 0
                  ? "No collections yet \u2014 use the Chat to create one"
                  : "Select a collection to browse"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header + schema */}
            <div className="px-6 pt-5 pb-3 border-b border-border/40">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {meta.name}
                  </h2>
                  {meta.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
                      {meta.description}
                    </p>
                  )}
                </div>
                <span className="text-xs tabular-nums text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md shrink-0">
                  {totalCount.toLocaleString()} record
                  {totalCount !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Field schema pills */}
              {fields.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {fields.map((f) => {
                    const cfg = getFieldConfig(f.type);
                    const Icon = cfg.icon;
                    return (
                      <span
                        key={f.name}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium",
                          cfg.bg,
                          cfg.text,
                        )}
                      >
                        <Icon className="size-3" />
                        {f.name}
                        <span className="opacity-50 font-normal">{f.type}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Search bar */}
            <div className="px-6 py-2 border-b border-border/30 flex items-center gap-3">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              {totalCount > RECORD_LIMIT && (
                <span className="text-[10px] text-muted-foreground">
                  Showing {RECORD_LIMIT.toLocaleString()} of{" "}
                  {totalCount.toLocaleString()}
                </span>
              )}
              {search && displayRecords.length !== records.length && (
                <span className="text-[10px] text-muted-foreground">
                  {displayRecords.length} match
                  {displayRecords.length !== 1 ? "es" : ""}
                </span>
              )}
            </div>

            {/* Data table */}
            <div className="flex-1 overflow-auto">
              {loadingRecords ? (
                <div className="p-6 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full rounded" />
                  ))}
                </div>
              ) : displayRecords.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                  {records.length === 0
                    ? "No records"
                    : "No matching records"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead
                        className="cursor-pointer select-none whitespace-nowrap text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/70"
                        onClick={() => toggleSort("id")}
                      >
                        <div className="flex items-center gap-1">
                          id
                          <SortIndicator field="id" current={sort} />
                        </div>
                      </TableHead>
                      {fields.map((f) => (
                        <TableHead
                          key={f.name}
                          className="cursor-pointer select-none whitespace-nowrap text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/70"
                          onClick={() => toggleSort(f.name)}
                        >
                          <div className="flex items-center gap-1">
                            {f.name}
                            <SortIndicator field={f.name} current={sort} />
                          </div>
                        </TableHead>
                      ))}
                      <TableHead
                        className="cursor-pointer select-none whitespace-nowrap text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/70"
                        onClick={() => toggleSort("created_at")}
                      >
                        <div className="flex items-center gap-1">
                          created
                          <SortIndicator field="created_at" current={sort} />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRecords.map((row, i) => (
                      <TableRow
                        key={String(row.id ?? i)}
                        className={cn(
                          i % 2 === 0 ? "bg-transparent" : "bg-muted/20",
                        )}
                      >
                        <TableCell
                          className="font-mono text-[11px] text-muted-foreground whitespace-nowrap max-w-[140px] truncate"
                          title={String(row.id ?? "")}
                        >
                          {String(row.id ?? "")}
                        </TableCell>
                        {fields.map((f) => (
                          <TableCell
                            key={f.name}
                            className={cn(
                              "text-sm max-w-[280px] truncate",
                              (f.type === "int" || f.type === "float") &&
                                "tabular-nums text-right font-mono",
                              f.type === "bool" && "text-center",
                            )}
                          >
                            {formatValue(row[f.name])}
                          </TableCell>
                        ))}
                        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap font-mono">
                          {formatDate(row.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
