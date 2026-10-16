/** Activity types (Pipedrive-style). Tasks created before types existed are "follow_up". */
export const ACTIVITY_TYPES = [
  { id: "call", label: "Call" },
  { id: "meeting", label: "Meeting" },
  { id: "visit", label: "Visit" },
  { id: "email", label: "Email" },
  { id: "message", label: "WhatsApp / WeChat" },
  { id: "sample", label: "Sample dispatch" },
  { id: "follow_up", label: "Follow-up" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["id"];
export const DEFAULT_ACTIVITY_TYPE: ActivityType = "follow_up";

export function isActivityType(value: unknown): value is ActivityType {
  return ACTIVITY_TYPES.some((t) => t.id === value);
}

export function activityLabel(type: string | null | undefined): string {
  return ACTIVITY_TYPES.find((t) => t.id === type)?.label ?? "Follow-up";
}

/**
 * Deadline to store for a due date picked in the user's own time zone:
 * with a time, that exact moment; without one, the end of that day, so an
 * activity due "today" only becomes overdue after today has ended.
 */
export function toDeadline(date: Date, time?: string | null): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 0);
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

export function isOverdue(deadline: string | Date | null | undefined, now: number = Date.now()): boolean {
  if (!deadline) return false;
  const t = new Date(deadline).getTime();
  return !Number.isNaN(t) && t < now;
}

/**
 * Turn an API deadline into the stored timestamp. A bare date ("2026-10-20")
 * without a time means "by the end of that day" in the business time zone
 * (`tzOffsetHours` ahead of UTC). Anything else is parsed as a date-time.
 */
export function normalizeDeadline(
  deadline: string | null | undefined,
  hasDueTime: boolean | undefined,
  tzOffsetHours: number
): Date | null {
  if (!deadline) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline);
  if (m && !hasDueTime) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59) - tzOffsetHours * 3_600_000);
  }
  const d = new Date(deadline);
  return Number.isNaN(d.getTime()) ? null : d;
}
