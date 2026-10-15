import { db } from "@/db";
import { attributes, recordStatusChanges, recordValues, statuses, users } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

interface StatusAttr {
  id: string;
  slug: string;
  type: string;
}

/** Normalise a status value from API input: an id string, `{ id }`, or empty. */
function statusId(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id) || null;
  return null;
}

/** Current status ids of `recordId` for the status attributes about to be written. */
export async function readStatusValues(
  recordId: string,
  input: Record<string, unknown>,
  bySlug: Map<string, StatusAttr>
): Promise<Map<string, string | null>> {
  const attrIds = Object.keys(input)
    .map((slug) => bySlug.get(slug))
    .filter((a): a is StatusAttr => a?.type === "status")
    .map((a) => a.id);
  const before = new Map<string, string | null>(attrIds.map((id) => [id, null]));
  if (attrIds.length === 0) return before;

  const rows = await db
    .select({ attributeId: recordValues.attributeId, textValue: recordValues.textValue })
    .from(recordValues)
    .where(and(eq(recordValues.recordId, recordId), inArray(recordValues.attributeId, attrIds)));
  for (const r of rows) before.set(r.attributeId, r.textValue);
  return before;
}

/**
 * Log a change for every status attribute in `input` whose value differs from
 * `before`. Call after the new values are written. For a new record pass an
 * empty map, so its starting status is logged as the first entry.
 */
export async function logStatusChanges(
  recordId: string,
  before: Map<string, string | null>,
  input: Record<string, unknown>,
  bySlug: Map<string, StatusAttr>,
  changedBy: string | null
) {
  const changes: { attributeId: string; from: string | null; to: string | null }[] = [];
  for (const [slug, value] of Object.entries(input)) {
    const attr = bySlug.get(slug);
    if (attr?.type !== "status") continue;
    const from = before.get(attr.id) ?? null;
    const to = statusId(value);
    if (from !== to) changes.push({ attributeId: attr.id, from, to });
  }
  if (changes.length === 0) return;

  const ids = [...new Set(changes.flatMap((c) => [c.from, c.to]).filter((x): x is string => !!x))];
  const titles = new Map<string, string>();
  if (ids.length) {
    const rows = await db.select({ id: statuses.id, title: statuses.title }).from(statuses).where(inArray(statuses.id, ids));
    for (const r of rows) titles.set(r.id, r.title);
  }

  await db.insert(recordStatusChanges).values(
    changes.map((c) => ({
      recordId,
      attributeId: c.attributeId,
      fromStatusId: c.from,
      fromTitle: c.from ? titles.get(c.from) ?? null : null,
      toStatusId: c.to,
      toTitle: c.to ? titles.get(c.to) ?? null : null,
      changedBy,
    }))
  );
}

export interface StageHistory {
  attributeId: string;
  attributeTitle: string;
  stages: { id: string; title: string; color: string; sortOrder: number; isActive: boolean }[];
  changes: {
    id: string;
    fromStatusId: string | null;
    fromTitle: string | null;
    toStatusId: string | null;
    toTitle: string | null;
    changedAt: string;
    changedBy: { id: string; name: string } | null;
  }[];
  /** Total time spent in each stage, including the current one up to now. */
  timeInStage: { statusId: string; title: string; ms: number }[];
  currentStatusId: string | null;
  currentSince: string | null;
}

/** Stage history for one status attribute of a record (the first status attribute by default). */
export async function getStageHistory(
  objectId: string,
  recordId: string,
  attributeId?: string,
  now: Date = new Date()
): Promise<StageHistory | null> {
  const statusAttrs = await db
    .select({ id: attributes.id, title: attributes.title })
    .from(attributes)
    .where(and(eq(attributes.objectId, objectId), eq(attributes.type, "status")))
    .orderBy(asc(attributes.sortOrder));
  const attr = attributeId ? statusAttrs.find((a) => a.id === attributeId) : statusAttrs[0];
  if (!attr) return null;

  const stageRows = await db
    .select({
      id: statuses.id,
      title: statuses.title,
      color: statuses.color,
      sortOrder: statuses.sortOrder,
      isActive: statuses.isActive,
    })
    .from(statuses)
    .where(eq(statuses.attributeId, attr.id))
    .orderBy(asc(statuses.sortOrder));

  const rows = await db
    .select({
      id: recordStatusChanges.id,
      fromStatusId: recordStatusChanges.fromStatusId,
      fromTitle: recordStatusChanges.fromTitle,
      toStatusId: recordStatusChanges.toStatusId,
      toTitle: recordStatusChanges.toTitle,
      changedAt: recordStatusChanges.changedAt,
      changedById: recordStatusChanges.changedBy,
      changedByName: users.name,
    })
    .from(recordStatusChanges)
    .leftJoin(users, eq(users.id, recordStatusChanges.changedBy))
    .where(and(eq(recordStatusChanges.recordId, recordId), eq(recordStatusChanges.attributeId, attr.id)))
    .orderBy(asc(recordStatusChanges.changedAt));

  const currentTitle = new Map(stageRows.map((s) => [s.id, s.title]));
  const spent = new Map<string, number>();
  rows.forEach((r, i) => {
    if (!r.toStatusId) return;
    const end = i + 1 < rows.length ? rows[i + 1].changedAt : now;
    spent.set(r.toStatusId, (spent.get(r.toStatusId) ?? 0) + Math.max(0, end.getTime() - r.changedAt.getTime()));
  });
  const last = rows[rows.length - 1];

  return {
    attributeId: attr.id,
    attributeTitle: attr.title,
    stages: stageRows,
    changes: rows.map((r) => ({
      id: r.id,
      fromStatusId: r.fromStatusId,
      fromTitle: r.fromStatusId ? currentTitle.get(r.fromStatusId) ?? r.fromTitle : null,
      toStatusId: r.toStatusId,
      toTitle: r.toStatusId ? currentTitle.get(r.toStatusId) ?? r.toTitle : null,
      changedAt: r.changedAt.toISOString(),
      changedBy: r.changedById ? { id: r.changedById, name: r.changedByName ?? "Unknown user" } : null,
    })),
    timeInStage: [...spent].map(([statusId, ms]) => ({
      statusId,
      title: currentTitle.get(statusId) ?? rows.find((r) => r.toStatusId === statusId)?.toTitle ?? "(deleted stage)",
      ms,
    })),
    currentStatusId: last?.toStatusId ?? null,
    currentSince: last ? last.changedAt.toISOString() : null,
  };
}
