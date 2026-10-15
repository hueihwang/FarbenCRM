"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { idleDays, isRotting } from "@/lib/rotting";

interface StageHistory {
  stages: { id: string; title: string; color: string; sortOrder: number; isActive: boolean; rottingDays: number | null }[];
  timeInStage: { statusId: string; title: string; ms: number }[];
  currentStatusId: string | null;
  currentSince: string | null;
}

/** "5h", "3d", "2mo": short duration for the stage bar. */
export function formatDuration(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

/**
 * Pipeline progress for a record with a status attribute (e.g. a deal's Stage):
 * one segment per open stage showing the time spent there, and the closed
 * outcome (Won, Lost) as a badge once reached. Re-fetches when `version` changes.
 */
export function StageBar({
  objectSlug,
  recordId,
  version,
  lastActivityAt,
}: {
  objectSlug: string;
  recordId: string;
  version: number;
  lastActivityAt?: string;
}) {
  const [history, setHistory] = useState<StageHistory | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/objects/${objectSlug}/records/${recordId}/stage-history`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setHistory(json?.data ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [objectSlug, recordId, version]);

  if (!history || history.stages.length === 0) return null;

  const spent = new Map(history.timeInStage.map((t) => [t.statusId, t.ms]));
  const open = history.stages.filter((s) => s.isActive);
  const current = history.stages.find((s) => s.id === history.currentStatusId);
  const currentIndex = open.findIndex((s) => s.id === history.currentStatusId);
  const closedOutcome = current && !current.isActive ? current : null;
  const rotting = isRotting(lastActivityAt, current);

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 gap-0.5" role="list" aria-label="Stage progress">
        {open.map((stage, i) => {
          const isCurrent = stage.id === history.currentStatusId;
          const passed = closedOutcome ? spent.has(stage.id) : currentIndex >= 0 && i < currentIndex;
          const ms = spent.get(stage.id);
          return (
            <div
              key={stage.id}
              role="listitem"
              title={`${stage.title}${ms !== undefined ? `: ${formatDuration(ms)}` : ""}`}
              className={cn(
                "min-w-0 flex-1 truncate px-2 py-1 text-xs first:rounded-l-md last:rounded-r-md",
                isCurrent ? "font-medium text-white" : passed ? "text-foreground" : "bg-muted text-muted-foreground"
              )}
              style={
                isCurrent
                  ? { backgroundColor: stage.color }
                  : passed
                    ? { backgroundColor: `${stage.color}33` }
                    : undefined
              }
            >
              {stage.title}
              {ms !== undefined && <span className="ml-1 opacity-80">{formatDuration(ms)}</span>}
            </div>
          );
        })}
      </div>
      {rotting && (
        <span
          className="shrink-0 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
          title={`No activity for ${idleDays(lastActivityAt)} days; this stage allows ${current?.rottingDays}`}
        >
          Rotting: idle {idleDays(lastActivityAt)} days
        </span>
      )}
      {closedOutcome && (
        <span
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: closedOutcome.color }}
        >
          {closedOutcome.title}
          {history.currentSince && ` ${new Date(history.currentSince).toLocaleDateString()}`}
        </span>
      )}
    </div>
  );
}
