"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import type { AttributeType } from "@farbencrm/shared";
import { cn } from "@/lib/utils";
import { AlertTriangle, GripVertical } from "lucide-react";
import { ActivityIcon } from "@/components/tasks/activity-icon";
import { describeDue, DUE_TONE_CLASS } from "@/components/tasks/activity-due";
import { extractPersonalName } from "@/lib/display-name";
import { idleDays, isRotting } from "@/lib/rotting";

// ─── Types ───────────────────────────────────────────────────────────

interface StatusDef {
  id: string;
  title: string;
  color: string;
  isActive: boolean;
  rottingDays?: number | null;
}

interface AttributeDef {
  id: string;
  slug: string;
  title: string;
  type: AttributeType;
  isMultiselect: boolean;
  options?: { id: string; title: string; color: string }[];
  statuses?: StatusDef[];
}

interface RecordRow {
  id: string;
  values: Record<string, unknown>;
  lastActivityAt?: string;
}

export interface NextActivityInfo {
  type: string;
  content: string;
  deadline: string | null;
  hasDueTime: boolean;
}

interface InsertInfo {
  columnId: string;
  index: number;
}

interface RecordKanbanProps {
  attributes: AttributeDef[];
  records: RecordRow[];
  statusAttributeSlug: string;
  onMoveRecord: (recordId: string, newStatusId: string) => void;
  onReorder: (columnRecordIds: string[]) => void;
  onClickRecord: (recordId: string) => void;
  objectSlug: string;
  /** Next open activity per record id; when given, cards show it Pipedrive style */
  nextActivities?: Record<string, NextActivityInfo>;
}

// ─── Kanban Board ────────────────────────────────────────────────────

export function RecordKanban({
  attributes,
  records,
  statusAttributeSlug,
  onMoveRecord,
  onReorder,
  onClickRecord,
  objectSlug,
  nextActivities,
}: RecordKanbanProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertInfo, setInsertInfo] = useState<InsertInfo | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const statusAttr = attributes.find((a) => a.slug === statusAttributeSlug);
  const statuses = statusAttr?.statuses || [];

  // Find the "name" attribute for card display
  const nameAttr = attributes.find((a) => a.slug === "name");
  // Find a currency attribute for column totals
  const currencyAttr = attributes.find((a) => a.type === "currency");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Custom collision detection using fresh DOM rects
  const collisionDetection: CollisionDetection = useCallback(
    ({ droppableContainers, pointerCoordinates }) => {
      if (!pointerCoordinates) return [];

      for (const container of droppableContainers) {
        const node = container.node.current;
        if (!node || container.disabled) continue;

        const rect = node.getBoundingClientRect();
        if (
          pointerCoordinates.x >= rect.left &&
          pointerCoordinates.x <= rect.right &&
          pointerCoordinates.y >= rect.top &&
          pointerCoordinates.y <= rect.bottom
        ) {
          return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
        }
      }

      // Fallback: closest column center
      let closestId: string | null = null;
      let closestDist = Infinity;
      let closestContainer = null;
      for (const container of droppableContainers) {
        const node = container.node.current;
        if (!node || container.disabled) continue;

        const rect = node.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(pointerCoordinates.x - cx, pointerCoordinates.y - cy);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = container.id as string;
          closestContainer = container;
        }
      }

      if (closestId && closestContainer) {
        return [{ id: closestId, data: { droppableContainer: closestContainer, value: closestDist } }];
      }

      return [];
    },
    []
  );

  const measuring = useMemo(
    () => ({
      droppable: { strategy: MeasuringStrategy.Always },
    }),
    []
  );

  // Group records by status
  const columnMap = useMemo(() => {
    const map = new Map<string, RecordRow[]>();
    map.set("_unset", []);
    for (const s of statuses) {
      map.set(s.id, []);
    }
    for (const rec of records) {
      const statusVal = rec.values[statusAttributeSlug] as string | undefined;
      const key = statusVal && map.has(statusVal) ? statusVal : "_unset";
      map.get(key)!.push(rec);
    }
    return map;
  }, [records, statuses, statusAttributeSlug]);

  const activeRecord = activeId
    ? records.find((r) => r.id === activeId) ?? null
    : null;

  // Calculate insertion index from pointer Y within a column
  function getInsertIndex(columnId: string, pointerY: number): number {
    const board = boardRef.current;
    if (!board) return 0;

    const colEl = board.querySelector(`[data-column-id="${columnId}"]`);
    if (!colEl) return 0;

    const cardEls = colEl.querySelectorAll("[data-record-id]");
    if (cardEls.length === 0) return 0;

    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (pointerY < midY) return i;
    }

    return cardEls.length;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragMove(event: DragMoveEvent) {
    const { over, activatorEvent } = event;
    if (!over || !activeId) {
      setInsertInfo(null);
      return;
    }

    const columnId = over.id as string;
    // Get the current pointer position from the native event
    const nativeEvent = activatorEvent as PointerEvent;
    // Use delta + initial position to get current position
    const pointerY = nativeEvent.clientY + event.delta.y;

    const index = getInsertIndex(columnId, pointerY);
    setInsertInfo({ columnId, index });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const currentInsertInfo = insertInfo;
    setActiveId(null);
    setInsertInfo(null);
    if (!over) return;

    const recordId = active.id as string;
    const targetColumnId = over.id as string;

    if (targetColumnId === "_unset") return;
    if (!statuses.find((s) => s.id === targetColumnId)) return;

    const rec = records.find((r) => r.id === recordId);
    const currentStatus = rec?.values[statusAttributeSlug] as string | undefined;
    const isCrossColumn = currentStatus !== targetColumnId;

    // Get the target column's current records (excluding the dragged card)
    const targetRecords = (columnMap.get(targetColumnId) || []).filter(
      (r) => r.id !== recordId
    );
    const insertIdx = currentInsertInfo?.columnId === targetColumnId
      ? Math.min(currentInsertInfo.index, targetRecords.length)
      : targetRecords.length;

    // Build new ordered list for the target column
    const newOrder = [...targetRecords.map((r) => r.id)];
    newOrder.splice(insertIdx, 0, recordId);

    if (isCrossColumn) {
      // Move to new column + set order
      onMoveRecord(recordId, targetColumnId);
    }

    // Always update order (even for within-column moves)
    onReorder(newOrder);

    // If it was a within-column move and position didn't change, skip
    if (!isCrossColumn) {
      const sourceRecords = columnMap.get(targetColumnId) || [];
      const oldOrder = sourceRecords.map((r) => r.id);
      if (JSON.stringify(oldOrder) === JSON.stringify(newOrder)) return;
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      measuring={measuring}
      autoScroll={false}
    >
      <div ref={boardRef} className="flex h-full gap-3 overflow-x-auto p-4">
        {/* Unset column (only if there are records without status) */}
        {(columnMap.get("_unset")?.length ?? 0) > 0 && (
          <KanbanColumn
            id="_unset"
            title="No Status"
            color="#666"
            records={columnMap.get("_unset") || []}
            nameAttr={nameAttr}
            currencyAttr={currencyAttr}
            attributes={attributes}
            onClickRecord={onClickRecord}
            insertInfo={insertInfo}
            activeId={activeId}
            nextActivities={nextActivities}
          />
        )}

        {statuses.map((status) => (
          <KanbanColumn
            key={status.id}
            id={status.id}
            title={status.title}
            color={status.color}
            stage={status}
            records={columnMap.get(status.id) || []}
            nameAttr={nameAttr}
            currencyAttr={currencyAttr}
            attributes={attributes}
            onClickRecord={onClickRecord}
            insertInfo={insertInfo}
            activeId={activeId}
            nextActivities={nextActivities}
          />
        ))}
      </div>

      <DragOverlay>
        {activeRecord && (
          <KanbanCardOverlay
            record={activeRecord}
            nameAttr={nameAttr}
            currencyAttr={currencyAttr}
            attributes={attributes}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Column ──────────────────────────────────────────────────────────

function KanbanColumn({
  id,
  title,
  color,
  stage,
  records,
  nameAttr,
  currencyAttr,
  attributes,
  onClickRecord,
  insertInfo,
  activeId,
  nextActivities,
}: {
  id: string;
  title: string;
  color: string;
  stage?: StatusDef;
  records: RecordRow[];
  nameAttr?: AttributeDef;
  currencyAttr?: AttributeDef;
  attributes: AttributeDef[];
  onClickRecord: (recordId: string) => void;
  insertInfo: InsertInfo | null;
  activeId: string | null;
  nextActivities?: Record<string, NextActivityInfo>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const count = records.length;
  const rottingCount = records.filter((r) => isRotting(r.lastActivityAt, stage)).length;
  // Column total per currency (deals store { amount, currency })
  const totals = new Map<string, number>();
  if (currencyAttr) {
    for (const rec of records) {
      const val = rec.values[currencyAttr.slug] as { amount?: number; currency?: string; currencyCode?: string } | undefined;
      if (typeof val?.amount !== "number") continue;
      const cur = val.currency || val.currencyCode || "MYR";
      totals.set(cur, (totals.get(cur) ?? 0) + val.amount);
    }
  }

  const showInsert = insertInfo?.columnId === id && activeId;
  // Filter out the actively dragged card from display
  const visibleRecords = records.filter((r) => r.id !== activeId);
  const insertIdx = showInsert
    ? Math.min(insertInfo!.index, visibleRecords.length)
    : -1;

  return (
    <div
      ref={setNodeRef}
      data-column-id={id}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border border-border/50 bg-card/50 transition-colors",
        isOver && "border-primary/50 bg-primary/5"
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium truncate">{title}</span>
        {rottingCount > 0 && (
          <span
            className="ml-auto rounded-full bg-destructive/10 px-1.5 text-[11px] font-medium text-destructive"
            title={`${rottingCount} idle for ${stage?.rottingDays}+ days`}
          >
            {rottingCount} rotting
          </span>
        )}
        <span className={cn("text-xs text-muted-foreground", rottingCount === 0 && "ml-auto")}>{count}</span>
      </div>

      {/* Currency total */}
      {totals.size > 0 && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/30">
          {[...totals].map(([cur, amt]) => formatMoney(amt, cur)).join(" + ")}
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {visibleRecords.map((record, i) => (
          <div key={record.id}>
            {insertIdx === i && <InsertIndicator />}
            <KanbanCard
              record={record}
              stage={stage}
              nextActivity={nextActivities ? nextActivities[record.id] ?? null : undefined}
              nameAttr={nameAttr}
              currencyAttr={currencyAttr}
              attributes={attributes}
              onClick={() => onClickRecord(record.id)}
            />
          </div>
        ))}
        {insertIdx === visibleRecords.length && <InsertIndicator />}

        {visibleRecords.length === 0 && !showInsert && (
          <div className="py-8 text-center text-xs text-muted-foreground/50">
            Drop here
          </div>
        )}
        {visibleRecords.length === 0 && showInsert && <InsertIndicator />}
      </div>
    </div>
  );
}

// ─── Insert Indicator ────────────────────────────────────────────────

function InsertIndicator() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
      <div className="h-0.5 flex-1 rounded-full bg-primary" />
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────

function KanbanCard({
  record,
  stage,
  nextActivity,
  nameAttr,
  currencyAttr,
  attributes,
  onClick,
}: {
  record: RecordRow;
  stage?: StatusDef;
  /** undefined: not shown; null: no open activity (warning) */
  nextActivity?: NextActivityInfo | null;
  nameAttr?: AttributeDef;
  currencyAttr?: AttributeDef;
  attributes: AttributeDef[];
  onClick: () => void;
}) {
  const {
    attributes: dragAttrs,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({ id: record.id });

  const displayName = getDisplayName(record, nameAttr);
  const currencyVal = currencyAttr
    ? (record.values[currencyAttr.slug] as { amount?: number; currencyCode?: string } | undefined)
    : undefined;
  const rotting = isRotting(record.lastActivityAt, stage);
  const idle = idleDays(record.lastActivityAt);

  // Pipedrive-style card for pipeline records: company, value, owner, next activity
  const company = record.values.company as { displayName?: string } | undefined;
  const owner = record.values.owner as { displayName?: string } | undefined;
  const pipelineCard = nextActivity !== undefined || !!company || !!owner;

  const extraFields = pipelineCard ? [] : attributes
    .filter(
      (a) =>
        a.slug !== "name" &&
        a.type !== "status" &&
        a.type !== "currency" &&
        record.values[a.slug] != null
    )
    .slice(0, 2);

  return (
    <div
      ref={setNodeRef}
      data-record-id={record.id}
      className={cn(
        "group rounded-md border border-border/60 bg-background p-2.5 shadow-sm cursor-pointer hover:border-border transition-colors",
        rotting && "border-destructive/70 hover:border-destructive",
        isDragging && "opacity-30"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...dragAttrs}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab opacity-0 group-hover:opacity-60 active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{displayName}</p>
          {rotting && (
            <p className="mt-0.5 text-xs font-medium text-destructive">Idle {idle} days</p>
          )}

          {(company?.displayName || currencyVal?.amount != null) && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[
                company?.displayName,
                currencyVal?.amount != null
                  ? formatMoney(currencyVal.amount, (currencyVal as { currency?: string }).currency || currencyVal.currencyCode || "MYR")
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {pipelineCard && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <NextActivityBadge activity={nextActivity} />
              {owner?.displayName && (
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-medium text-primary"
                  title={owner.displayName}
                >
                  {initials(owner.displayName)}
                </span>
              )}
            </div>
          )}

          {extraFields.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {extraFields.map((attr) => {
                const val = record.values[attr.slug];
                return (
                  <p key={attr.slug} className="text-xs text-muted-foreground truncate">
                    <span className="text-muted-foreground/60">{attr.title}: </span>
                    {formatCardValue(val, attr.type)}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KanbanCardOverlay({
  record,
  nameAttr,
  currencyAttr,
  attributes,
}: {
  record: RecordRow;
  nameAttr?: AttributeDef;
  currencyAttr?: AttributeDef;
  attributes: AttributeDef[];
}) {
  const displayName = getDisplayName(record, nameAttr);
  const currencyVal = currencyAttr
    ? (record.values[currencyAttr.slug] as { amount?: number; currencyCode?: string } | undefined)
    : undefined;

  return (
    <div className="w-68 rounded-md border border-primary/50 bg-background p-2.5 shadow-lg">
      <p className="text-sm font-medium truncate">{displayName}</p>
      {currencyVal?.amount != null && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatMoney(currencyVal.amount, (currencyVal as { currency?: string }).currency || currencyVal.currencyCode || "MYR")}
        </p>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-MY", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Next activity on a card: green when planned, red when overdue, amber warning when none. */
function NextActivityBadge({ activity }: { activity?: NextActivityInfo | null }) {
  if (activity === undefined) return <span />;
  if (activity === null) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        No activity planned
      </span>
    );
  }
  const due = describeDue(activity.deadline, activity.hasDueTime);
  return (
    <span className={cn("flex min-w-0 items-center gap-1 text-[11px]", DUE_TONE_CLASS[due.tone])} title={activity.content}>
      <ActivityIcon type={activity.type} className="h-3 w-3 shrink-0" />
      <span className="truncate">{activity.deadline ? due.label : activity.content}</span>
    </span>
  );
}

function getDisplayName(record: RecordRow, nameAttr?: AttributeDef): string {
  if (!nameAttr) return "Unnamed";
  const val = record.values[nameAttr.slug];
  if (!val) return "Unnamed";
  if (nameAttr.type === "personal_name") {
    return extractPersonalName(val) || "Unnamed";
  }
  return String(val);
}

function formatCardValue(val: unknown, type: AttributeType): string {
  if (val == null) return "—";
  if (type === "personal_name") {
    return extractPersonalName(val) || "—";
  }
  if (type === "date") {
    return new Date(val as string).toLocaleDateString();
  }
  if (Array.isArray(val)) {
    return val.filter(Boolean).join(", ");
  }
  return String(val);
}
