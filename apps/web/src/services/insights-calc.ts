// Pure calculations for the Insights dashboard. No database access, so it can
// be tested with plain data. Relative imports only (no "@/" alias) for that reason.

import { idleDays, isRotting } from "../lib/rotting";

export type PeriodKey = "month" | "quarter" | "year" | "all";

export interface InsightsStage {
  id: string;
  title: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  celebrationEnabled: boolean;
  rottingDays: number | null;
}

export interface InsightsDeal {
  id: string;
  name: string;
  stageId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  value: { amount: number; currency: string } | null;
  createdAt: string;
  lastActivityAt: string | null;
  sampleStatus: string | null;
  sampleSentDate: string | null;
}

export interface InsightsInput {
  now: number;
  period: PeriodKey;
  /** Hours ahead of UTC used for month, quarter and year boundaries (Malaysia: 8). */
  tzOffsetHours: number;
  stages: InsightsStage[];
  deals: InsightsDeal[];
  /** Stage changes of deals, any order. */
  history: { recordId: string; toStatusId: string | null; changedAt: string }[];
  tasks: {
    id: string;
    content: string;
    deadline: string | null;
    isCompleted: boolean;
    assignees: { id: string; name: string }[];
    linked: { id: string; displayName: string }[];
  }[];
  companies: {
    id: string;
    name: string;
    customerType: string | null;
    lastOrderDate: string | null;
    personInCharge: string | null;
  }[];
}

export type Money = Record<string, number>;
export interface DealRef {
  id: string;
  name: string;
}

const DAY = 86_400_000;
const QUIET_DAYS = 90;

function addMoney(m: Money, v: InsightsDeal["value"]) {
  if (v && typeof v.amount === "number") m[v.currency || "MYR"] = (m[v.currency || "MYR"] ?? 0) + v.amount;
}
const sumMoney = (deals: InsightsDeal[]) => {
  const m: Money = {};
  deals.forEach((d) => addMoney(m, d.value));
  return m;
};
const refs = (deals: InsightsDeal[]): DealRef[] => deals.map((d) => ({ id: d.id, name: d.name }));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Start of the period in UTC ms, using the business time zone for calendar boundaries. */
export function periodStart(period: PeriodKey, now: number, tzOffsetHours: number): number | null {
  if (period === "all") return null;
  const local = new Date(now + tzOffsetHours * 3_600_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const startMonth = period === "month" ? m : period === "quarter" ? m - (m % 3) : 0;
  return Date.UTC(y, startMonth, 1) - tzOffsetHours * 3_600_000;
}

export function computeInsights(input: InsightsInput) {
  const { now, stages } = input;
  const start = periodStart(input.period, now, input.tzOffsetHours);
  const inPeriod = (iso: string | null | undefined) => !!iso && (start === null || Date.parse(iso) >= start);

  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(sorted.map((s) => [s.id, s]));
  const openStages = sorted.filter((s) => s.isActive);
  const wonStage = sorted.find((s) => !s.isActive && s.celebrationEnabled) ?? null;
  const lostStages = sorted.filter((s) => !s.isActive && s !== wonStage);
  const lostIds = new Set(lostStages.map((s) => s.id));

  const stageOf = (d: InsightsDeal) => (d.stageId ? byId.get(d.stageId) : undefined);
  const openDeals = input.deals.filter((d) => stageOf(d)?.isActive);

  const historyByDeal = new Map<string, { toStatusId: string | null; at: number }[]>();
  for (const h of input.history) {
    const arr = historyByDeal.get(h.recordId) ?? [];
    arr.push({ toStatusId: h.toStatusId, at: Date.parse(h.changedAt) });
    historyByDeal.set(h.recordId, arr);
  }
  for (const arr of historyByDeal.values()) arr.sort((a, b) => a.at - b.at);

  /** When the deal entered its current stage (last history entry), falling back to creation. */
  const enteredCurrent = (d: InsightsDeal): string => {
    const arr = historyByDeal.get(d.id);
    const last = arr?.[arr.length - 1];
    return last && last.toStatusId === d.stageId ? new Date(last.at).toISOString() : d.createdAt;
  };

  // Won and lost in the period
  const won = wonStage ? input.deals.filter((d) => d.stageId === wonStage.id && inPeriod(enteredCurrent(d))) : [];
  const lost = input.deals.filter((d) => d.stageId && lostIds.has(d.stageId) && inPeriod(enteredCurrent(d)));

  // Pipeline by stage (current state, not period-bound)
  const pipeline = sorted.map((s) => {
    const rows = input.deals.filter((d) => d.stageId === s.id);
    return { stageId: s.id, title: s.title, color: s.color, isOpen: s.isActive, count: rows.length, value: sumMoney(rows), deals: refs(rows) };
  });

  // Funnel over deals created in the period: furthest step reached, from real stage history
  const steps = [...openStages, ...(wonStage ? [wonStage] : [])];
  const stepIndex = new Map(steps.map((s, i) => [s.id, i]));
  const furthest = (d: InsightsDeal) => {
    const seen = new Set<string>((historyByDeal.get(d.id) ?? []).map((h) => h.toStatusId).filter((x): x is string => !!x));
    if (d.stageId) seen.add(d.stageId);
    let max = -1;
    for (const id of seen) max = Math.max(max, stepIndex.get(id) ?? -1);
    return max;
  };
  const cohort = input.deals.filter((d) => inPeriod(d.createdAt));
  let prev = 0;
  const funnel = steps.map((s, i) => {
    const rows = cohort.filter((d) => furthest(d) >= i);
    const conversion = i === 0 || prev === 0 ? null : Math.round((rows.length / prev) * 100);
    prev = rows.length;
    return { stageId: s.id, title: s.title, reached: rows.length, conversionFromPrevious: conversion, deals: refs(rows) };
  });

  // Average days in each open stage, over stays that ended in the period
  const stays = new Map<string, number[]>();
  for (const arr of historyByDeal.values()) {
    for (let i = 0; i + 1 < arr.length; i++) {
      const from = arr[i];
      const to = arr[i + 1];
      if (!from.toStatusId || !byId.get(from.toStatusId)?.isActive) continue;
      if (start !== null && to.at < start) continue;
      const list = stays.get(from.toStatusId) ?? [];
      list.push((to.at - from.at) / DAY);
      stays.set(from.toStatusId, list);
    }
  }
  const avgDaysInStage = openStages.map((s) => {
    const list = stays.get(s.id) ?? [];
    return { stageId: s.id, title: s.title, avgDays: list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null, deals: list.length };
  });

  // Rotting
  const rotting = openDeals
    .filter((d) => isRotting(d.lastActivityAt, stageOf(d), now))
    .map((d) => ({ id: d.id, name: d.name, stage: stageOf(d)!.title, owner: d.ownerName, idleDays: idleDays(d.lastActivityAt, now) ?? 0, limit: stageOf(d)!.rottingDays! }))
    .sort((a, b) => b.idleDays - a.idleDays);

  // Overdue tasks per person
  const overdueTasks = input.tasks.filter((t) => !t.isCompleted && t.deadline && Date.parse(t.deadline) < now);
  const overdueMap = new Map<string, { owner: string; ownerId: string | null; tasks: { id: string; content: string; due: string; linked: DealRef[] }[] }>();
  for (const t of overdueTasks) {
    const people = t.assignees.length ? t.assignees : [{ id: "", name: "(unassigned)" }];
    for (const p of people) {
      const g = overdueMap.get(p.id || p.name) ?? { owner: p.name, ownerId: p.id || null, tasks: [] };
      g.tasks.push({ id: t.id, content: t.content, due: String(t.deadline).slice(0, 10), linked: t.linked.map((l) => ({ id: l.id, name: l.displayName })) });
      overdueMap.set(p.id || p.name, g);
    }
  }
  const overdueByPerson = [...overdueMap.values()].sort((a, b) => b.tasks.length - a.tasks.length);

  // Per salesperson
  const owners = new Map<string, { owner: string; openCount: number; openValue: Money; wonCount: number; wonValue: Money; rotting: number; overdue: number }>();
  const ownerRow = (id: string | null, name: string | null) => {
    const key = id ?? "(no owner)";
    if (!owners.has(key)) owners.set(key, { owner: name ?? "(no owner)", openCount: 0, openValue: {}, wonCount: 0, wonValue: {}, rotting: 0, overdue: 0 });
    return owners.get(key)!;
  };
  for (const d of openDeals) {
    const r = ownerRow(d.ownerId, d.ownerName);
    r.openCount++;
    addMoney(r.openValue, d.value);
  }
  for (const d of won) {
    const r = ownerRow(d.ownerId, d.ownerName);
    r.wonCount++;
    addMoney(r.wonValue, d.value);
  }
  for (const d of rotting) ownerRow(input.deals.find((x) => x.id === d.id)!.ownerId, d.owner).rotting++;
  for (const g of overdueByPerson) if (g.ownerId) ownerRow(g.ownerId, g.owner).overdue += g.tasks.length;
  const byOwner = [...owners.values()].sort((a, b) => b.openCount - a.openCount);

  // Samples out, waiting for feedback
  const samplesAwaiting = openDeals
    .filter((d) => d.sampleStatus === "Sent")
    .map((d) => ({
      id: d.id,
      name: d.name,
      owner: d.ownerName,
      sentDate: d.sampleSentDate,
      daysWaiting: d.sampleSentDate ? Math.floor((now - Date.parse(d.sampleSentDate)) / DAY) : null,
    }))
    .sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1));

  // Active customers with no order in 90 days (blank date counts as no order)
  const quietCustomers = input.companies
    .filter((c) => c.customerType === "Active Customer")
    .map((c) => ({ ...c, days: c.lastOrderDate ? Math.floor((now - Date.parse(c.lastOrderDate)) / DAY) : null }))
    .filter((c) => c.days === null || c.days >= QUIET_DAYS)
    .map((c) => ({ id: c.id, name: c.name, lastOrderDate: c.lastOrderDate, daysSinceOrder: c.days, personInCharge: c.personInCharge }))
    .sort((a, b) => (b.daysSinceOrder ?? Infinity) - (a.daysSinceOrder ?? Infinity));

  const closed = won.length + lost.length;
  return {
    period: { key: input.period, start: start === null ? null : new Date(start).toISOString() },
    kpis: {
      open: { count: openDeals.length, value: sumMoney(openDeals) },
      won: { count: won.length, value: sumMoney(won), deals: refs(won) },
      lost: { count: lost.length, value: sumMoney(lost), deals: refs(lost) },
      winRate: closed ? Math.round((won.length / closed) * 100) : null,
      rotting: rotting.length,
      overdueTasks: overdueTasks.length,
      samplesAwaiting: samplesAwaiting.length,
      quietCustomers: quietCustomers.length,
    },
    pipeline,
    funnel,
    avgDaysInStage,
    byOwner,
    rotting,
    overdueByPerson,
    samplesAwaiting,
    quietCustomers,
  };
}

export type Insights = ReturnType<typeof computeInsights>;
