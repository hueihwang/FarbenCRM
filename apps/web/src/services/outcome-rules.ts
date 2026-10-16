import { db } from "@/db";
import { recordValues, statuses } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/** A save that breaks a business rule; API routes turn it into HTTP 400. */
export class RecordValidationError extends Error {}

interface AttrInfo {
  id: string;
  slug: string;
  type: string;
}

const LOST_REASON_SLUG = "lost_reason";

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id) || null;
  return null;
}

/**
 * Rule: a record moved to (or kept in) a Lost stage must have a Lost Reason.
 * Lost stage = closed stage without celebration (Won is the closed stage with celebration).
 * Only applies to objects that have a "lost_reason" field.
 * `recordId` is null for a new record.
 */
export async function enforceOutcomeRules(
  recordId: string | null,
  input: Record<string, unknown>,
  bySlug: Map<string, AttrInfo>
) {
  const lostReasonAttr = bySlug.get(LOST_REASON_SLUG);
  const statusAttr = [...bySlug.values()].find((a) => a.type === "status");
  if (!lostReasonAttr || !statusAttr) return;
  const touchesStage = statusAttr.slug in input;
  const touchesReason = LOST_REASON_SLUG in input;
  if (!touchesStage && !touchesReason) return;

  // Current stored values for an existing record
  const current = new Map<string, string | null>();
  if (recordId) {
    const rows = await db
      .select({ attributeId: recordValues.attributeId, textValue: recordValues.textValue })
      .from(recordValues)
      .where(and(eq(recordValues.recordId, recordId), inArray(recordValues.attributeId, [statusAttr.id, lostReasonAttr.id])));
    for (const r of rows) current.set(r.attributeId, r.textValue);
  }

  const stageId = touchesStage ? idOf(input[statusAttr.slug]) : current.get(statusAttr.id) ?? null;
  if (!stageId) return;
  const [stage] = await db
    .select({ isActive: statuses.isActive, celebrationEnabled: statuses.celebrationEnabled, title: statuses.title })
    .from(statuses)
    .where(eq(statuses.id, stageId))
    .limit(1);
  const isLost = !!stage && !stage.isActive && !stage.celebrationEnabled;
  if (!isLost) return;

  const reason = touchesReason ? idOf(input[LOST_REASON_SLUG]) : current.get(lostReasonAttr.id) ?? null;
  if (!reason) {
    throw new RecordValidationError(`Choose a Lost Reason before marking this deal ${stage.title}.`);
  }
}
