"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Row,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2, Undo2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Editable Cell
// -----------------------------------------------------------------------------

function EditableCell({
  value,
  isEdited,
  isDeleted,
  onCommit,
}: {
  value: string;
  isEdited: boolean;
  isDeleted: boolean;
  onCommit: (newValue: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (isDeleted) {
    return <span className="line-through text-muted-foreground">{value}</span>;
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onCommit(draft);
            setEditing(false);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-7 px-1 py-0 text-sm w-full min-w-[60px]"
      />
    );
  }

  return (
    <span
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn(
        "cursor-pointer rounded px-1 py-0.5 hover:bg-muted transition-colors",
        isEdited && "bg-yellow-100 dark:bg-yellow-950/40",
      )}
    >
      {value}
    </span>
  );
}

// -----------------------------------------------------------------------------
// DataTable
// -----------------------------------------------------------------------------

interface DataTableProps {
  columns: ColumnDef<Record<string, unknown>>[];
  data: Record<string, unknown>[];
  emptyMessage?: string;
  editable?: boolean;
  onCellEdit?: (recordId: string, field: string, value: string) => void;
  onRowDelete?: (recordId: string) => void;
  onRowRestore?: (recordId: string) => void;
  isRowDeleted?: (recordId: string) => boolean;
  isCellEdited?: (recordId: string, field: string) => boolean;
  getEditedValue?: (recordId: string, field: string) => unknown | undefined;
}

export function DataTable({
  columns: columnsProp,
  data,
  emptyMessage,
  editable,
  onCellEdit,
  onRowDelete,
  onRowRestore,
  isRowDeleted,
  isCellEdited,
  getEditedValue,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(() => {
    if (!editable) return columnsProp;

    const editableColumns: ColumnDef<Record<string, unknown>>[] = columnsProp.map((col) => {
      const accessorKey = (col as { accessorKey?: string }).accessorKey;
      if (!accessorKey || accessorKey === "id") return col;

      return {
        ...col,
        cell: ({ row, getValue }: { row: Row<Record<string, unknown>>; getValue: () => unknown }) => {
          const recordId = String(row.original.id ?? "");
          if (!recordId) return String(getValue() ?? "");

          const field = accessorKey;
          const deleted = isRowDeleted?.(recordId) ?? false;
          const edited = isCellEdited?.(recordId, field) ?? false;
          const displayValue = edited
            ? String(getEditedValue?.(recordId, field) ?? "")
            : String(getValue() ?? "");

          return (
            <EditableCell
              value={displayValue}
              isEdited={edited}
              isDeleted={deleted}
              onCommit={(newVal) => onCellEdit?.(recordId, field, newVal)}
            />
          );
        },
      };
    });

    editableColumns.push({
      id: "_actions",
      header: "",
      cell: ({ row }: { row: Row<Record<string, unknown>> }) => {
        const recordId = String(row.original.id ?? "");
        if (!recordId) return null;
        const deleted = isRowDeleted?.(recordId) ?? false;
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              deleted
                ? onRowRestore?.(recordId)
                : onRowDelete?.(recordId)
            }
            title={deleted ? "Restore row" : "Delete row"}
          >
            {deleted ? (
              <Undo2 className="h-3.5 w-3.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            )}
          </Button>
        );
      },
      enableSorting: false,
    } as ColumnDef<Record<string, unknown>>);

    return editableColumns;
  }, [columnsProp, editable, onCellEdit, onRowDelete, onRowRestore, isRowDeleted, isCellEdited, getEditedValue]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.getCanSort() ? "cursor-pointer select-none" : ""}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      header.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => {
              const recordId = String(row.original.id ?? "");
              const deleted = editable && recordId ? (isRowDeleted?.(recordId) ?? false) : false;
              return (
                <TableRow
                  key={row.id}
                  className={cn(deleted && "opacity-50")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage ?? "No data"}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
