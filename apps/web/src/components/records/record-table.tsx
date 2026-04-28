"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import type { AttributeType } from "@farbencrm/shared";
import { AttributeCell } from "./attribute-cell";
import { AttributeEditor } from "./attribute-editor";
import { cn } from "@/lib/utils";
import { Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────

interface AttributeDef {
  id: string;
  slug: string;
  title: string;
  type: AttributeType;
  isMultiselect: boolean;
  options?: { id: string; title: string; color: string }[];
  statuses?: { id: string; title: string; color: string; isActive: boolean }[];
}

interface RecordRow {
  id: string;
  values: Record<string, unknown>;
}

interface RecordTableProps {
  attributes: AttributeDef[];
  records: RecordRow[];
  onUpdateRecord: (recordId: string, slug: string, value: unknown) => void;
  onCreateRecord: () => void;
  objectSlug: string;
  /** When false, cells are read-only (click does nothing). Defaults to false. */
  editMode?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────

export function RecordTable({
  attributes,
  records,
  onUpdateRecord,
  onCreateRecord,
  objectSlug,
  editMode = false,
}: RecordTableProps) {
  const router = useRouter();
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);

  // When edit mode is turned off while a cell is open, close the editor.
  if (!editMode && editingCell) {
    // Defer to next tick so we don't update state during render
    Promise.resolve().then(() => setEditingCell(null));
  }

  const columns = useMemo<ColumnDef<RecordRow>[]>(() => {
    // Open button column
    const openCol: ColumnDef<RecordRow> = {
      id: "_open",
      header: "",
      size: 40,
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/objects/${objectSlug}/${row.original.id}`)}
          className="flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      ),
    };

    const attrCols: ColumnDef<RecordRow>[] = attributes.map((attr) => ({
      id: attr.slug,
      header: attr.title,
      size: attr.type === "personal_name" ? 200 : attr.type === "text" ? 180 : 150,
      cell: ({ row }: { row: { original: RecordRow; id: string } }) => {
        const val = row.original.values[attr.slug];
        const isEditing =
          editMode &&
          editingCell?.rowId === row.original.id &&
          editingCell?.colId === attr.slug;

        if (isEditing) {
          return (
            <div className="relative">
              <AttributeEditor
                type={attr.type}
                value={val}
                options={attr.options}
                statuses={attr.statuses}
                onSave={(newVal) => {
                  onUpdateRecord(row.original.id, attr.slug, newVal);
                  setEditingCell(null);
                }}
                onCancel={() => setEditingCell(null)}
              />
            </div>
          );
        }

        return (
          <div
            className={cn(
              "truncate px-1",
              editMode ? "cursor-pointer rounded hover:bg-accent/40" : "cursor-default"
            )}
            onClick={
              editMode
                ? () => setEditingCell({ rowId: row.original.id, colId: attr.slug })
                : undefined
            }
            title={editMode ? "Click to edit" : undefined}
          >
            <AttributeCell
              type={attr.type}
              value={val}
              options={attr.options}
              statuses={attr.statuses}
            />
          </div>
        );
      },
    }));

    return [openCol, ...attrCols];
  }, [attributes, editingCell, onUpdateRecord, objectSlug, router, editMode]);

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  // First attribute is the record's display name; the next few become subtitle.
  const titleAttr = attributes[0];
  const subAttrs = attributes.slice(1, 5);

  return (
    <div className="flex flex-col h-full">
      {/* Mobile: card list (hidden on md+) */}
      <div className="md:hidden flex-1 overflow-auto">
        {records.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
            No records yet. Tap “New record” below to create one.
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {records.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/objects/${objectSlug}/${record.id}`)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors"
                >
                  <div className="text-sm font-medium truncate">
                    {titleAttr ? (
                      <AttributeCell
                        type={titleAttr.type}
                        value={record.values[titleAttr.slug]}
                        options={titleAttr.options}
                        statuses={titleAttr.statuses}
                      />
                    ) : (
                      "Untitled"
                    )}
                  </div>
                  {subAttrs.length > 0 && (
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                      {subAttrs.map((attr) => {
                        const val = record.values[attr.slug];
                        if (val === undefined || val === null || val === "") return null;
                        return (
                          <div key={attr.slug} className="min-w-0 flex gap-1">
                            <dt className="text-muted-foreground/70 shrink-0">
                              {attr.title}:
                            </dt>
                            <dd className="text-muted-foreground truncate min-w-0">
                              <AttributeCell
                                type={attr.type}
                                value={val}
                                options={attr.options}
                                statuses={attr.statuses}
                              />
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop: table view (md+) */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full border-collapse min-w-[720px]">
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="h-9 px-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="group/row border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="h-10 px-3 text-sm"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td
                  colSpan={attributes.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  No records yet. Click the button below to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add record row */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateRecord}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="mr-1 h-4 w-4" />
          New record
        </Button>
      </div>
    </div>
  );
}
