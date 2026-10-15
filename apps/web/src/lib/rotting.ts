const DAY_MS = 24 * 60 * 60 * 1000;

export interface RottingStage {
  isActive: boolean;
  rottingDays?: number | null;
}

/** Whole days since the record's last activity. */
export function idleDays(lastActivityAt: string | Date | null | undefined, now: number = Date.now()): number | null {
  if (!lastActivityAt) return null;
  const t = new Date(lastActivityAt).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** A record rots when it sits in an open stage with a rotting limit for at least that many idle days. */
export function isRotting(
  lastActivityAt: string | Date | null | undefined,
  stage: RottingStage | null | undefined,
  now: number = Date.now()
): boolean {
  if (!stage?.isActive || !stage.rottingDays) return false;
  const idle = idleDays(lastActivityAt, now);
  return idle !== null && idle >= stage.rottingDays;
}
