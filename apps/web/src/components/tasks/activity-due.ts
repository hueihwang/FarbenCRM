import { differenceInCalendarDays, format, isToday, isTomorrow } from "date-fns";

export type DueTone = "overdue" | "today" | "planned" | "undated";

/** Short due label for an activity, e.g. "Overdue 2d", "Today 14:00", "Thu", "Oct 20". */
export function describeDue(
  deadline: string | Date | null | undefined,
  hasDueTime: boolean,
  now: Date = new Date()
): { label: string; tone: DueTone } {
  if (!deadline) return { label: "No date", tone: "undated" };
  const d = new Date(deadline);
  const time = hasDueTime ? ` ${format(d, "HH:mm")}` : "";
  if (d.getTime() < now.getTime()) {
    const days = differenceInCalendarDays(now, d);
    return { label: days <= 0 ? `Overdue${time}` : `Overdue ${days}d`, tone: "overdue" };
  }
  if (isToday(d)) return { label: `Today${time}`, tone: "today" };
  if (isTomorrow(d)) return { label: `Tomorrow${time}`, tone: "planned" };
  const days = differenceInCalendarDays(d, now);
  return { label: `${days < 7 ? format(d, "EEE") : format(d, "MMM d")}${time}`, tone: "planned" };
}

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-destructive",
  today: "text-green-600 dark:text-green-400",
  planned: "text-green-600 dark:text-green-400",
  undated: "text-muted-foreground",
};
