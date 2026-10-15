import { db } from "@/db";
import { recordStatusChanges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getObjectBySlug } from "./objects";
import { listAttributes } from "./attributes";
import { listRecords } from "./records";
import { listTasks } from "./tasks";
import { computeInsights, type InsightsInput, type PeriodKey } from "./insights-calc";

const MAX_ROWS = 10_000;
/** Business time zone offset for month, quarter and year boundaries (Malaysia, no DST). */
const TZ_OFFSET_HOURS = Number(process.env.INSIGHTS_TZ_OFFSET_HOURS ?? 8);

const toIso = (d: unknown): string | null =>
  d instanceof Date ? d.toISOString() : typeof d === "string" && d ? d : null;

function optionTitles(attrs: any[], slug: string) {
  const a = attrs.find((x) => x.slug === slug);
  const map = new Map<string, string>((a?.options ?? a?.statuses ?? []).map((o: any) => [o.id, o.title]));
  return (id: unknown) => (typeof id === "string" ? map.get(id) ?? null : null);
}

/** Load everything the dashboard needs for a workspace and compute it. */
export async function getInsights(workspaceId: string, userId: string, period: PeriodKey) {
  const dealsObj = await getObjectBySlug(workspaceId, "deals");
  if (!dealsObj) return null;
  const dealAttrs: any[] = await listAttributes(dealsObj.id);
  const stageAttr = dealAttrs.find((a) => a.type === "status");
  if (!stageAttr) return null;

  const companiesObj = await getObjectBySlug(workspaceId, "companies");
  const [dealRecs, historyRows, taskResult, companyAttrs, companyRecs] = await Promise.all([
    listRecords(dealsObj.id, { limit: MAX_ROWS }),
    db
      .select({
        recordId: recordStatusChanges.recordId,
        toStatusId: recordStatusChanges.toStatusId,
        changedAt: recordStatusChanges.changedAt,
      })
      .from(recordStatusChanges)
      .where(eq(recordStatusChanges.attributeId, stageAttr.id)),
    listTasks(workspaceId, userId, { showCompleted: false, limit: MAX_ROWS }),
    companiesObj ? listAttributes(companiesObj.id) : Promise.resolve([] as any[]),
    companiesObj ? listRecords(companiesObj.id, { limit: MAX_ROWS }) : Promise.resolve({ records: [] as any[], total: 0 }),
  ]);

  const sampleStatus = optionTitles(dealAttrs, "sample_status");
  const customerType = optionTitles(companyAttrs as any[], "customer_type");

  const input: InsightsInput = {
    now: Date.now(),
    period,
    tzOffsetHours: TZ_OFFSET_HOURS,
    stages: (stageAttr.statuses ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      color: s.color,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      celebrationEnabled: s.celebrationEnabled,
      rottingDays: s.rottingDays ?? null,
    })),
    deals: dealRecs.records.map((r: any) => {
      const v = r.values;
      const value = v.value && typeof v.value.amount === "number" ? { amount: v.value.amount, currency: v.value.currency ?? "MYR" } : null;
      return {
        id: r.id,
        name: typeof v.name === "string" && v.name ? v.name : "Unnamed deal",
        stageId: typeof v[stageAttr.slug] === "string" ? v[stageAttr.slug] : null,
        ownerId: v.owner?.id ?? null,
        ownerName: v.owner?.displayName ?? null,
        value,
        createdAt: toIso(r.createdAt) ?? new Date().toISOString(),
        lastActivityAt: toIso(r.lastActivityAt),
        sampleStatus: sampleStatus(v.sample_status),
        sampleSentDate: toIso(v.sample_sent_date),
      };
    }),
    history: historyRows.map((h) => ({ recordId: h.recordId, toStatusId: h.toStatusId, changedAt: h.changedAt.toISOString() })),
    tasks: taskResult.tasks.map((t: any) => ({
      id: t.id,
      content: t.content,
      deadline: toIso(t.deadline),
      isCompleted: !!t.isCompleted,
      assignees: (t.assignees ?? []).map((a: any) => ({ id: a.id, name: a.name || a.email || "Unknown" })),
      linked: (t.linkedRecords ?? []).map((l: any) => ({ id: l.id, displayName: l.displayName ?? "Record" })),
    })),
    companies: companyRecs.records.map((r: any) => ({
      id: r.id,
      name: typeof r.values.name === "string" ? r.values.name : "Unnamed company",
      customerType: customerType(r.values.customer_type),
      lastOrderDate: toIso(r.values.last_order_date),
      personInCharge: r.values.person_in_charge?.displayName ?? null,
    })),
  };

  return computeInsights(input);
}
