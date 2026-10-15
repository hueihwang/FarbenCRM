// Tests for the Insights dashboard calculations, against hand-worked data.
// Run (from any folder with tsx installed): npx tsx --test apps/web/src/services/insights-calc.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { computeInsights, periodStart, type InsightsInput } from "./insights-calc";

// 2026-10-15 12:00 in Malaysia (UTC+8)
const NOW = Date.parse("2026-10-15T04:00:00Z");
const at = (iso: string) => new Date(Date.parse(iso)).toISOString();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const stages = [
  { id: "lead", title: "Lead", color: "#6366f1", sortOrder: 0, isActive: true, celebrationEnabled: false, rottingDays: 14 },
  { id: "st", title: "Sample and Trial", color: "#8b5cf6", sortOrder: 1, isActive: true, celebrationEnabled: false, rottingDays: 21 },
  { id: "qo", title: "Quote and Order", color: "#a855f7", sortOrder: 2, isActive: true, celebrationEnabled: false, rottingDays: 14 },
  { id: "won", title: "Won", color: "#22c55e", sortOrder: 4, isActive: false, celebrationEnabled: true, rottingDays: null },
  { id: "lost", title: "Lost", color: "#ef4444", sortOrder: 5, isActive: false, celebrationEnabled: false, rottingDays: null },
];

const deal = (id: string, name: string, stageId: string, createdAt: string, extra: Partial<InsightsInput["deals"][number]> = {}) => ({
  id, name, stageId, createdAt, ownerId: null, ownerName: null, value: null, lastActivityAt: daysAgo(1),
  sampleStatus: null, sampleSentDate: null, ...extra,
});
const ana = { ownerId: "u1", ownerName: "Ana" };
const ben = { ownerId: "u2", ownerName: "Ben" };
const myr = (amount: number) => ({ amount, currency: "MYR" });

const input = (period: InsightsInput["period"]): InsightsInput => ({
  now: NOW,
  period,
  tzOffsetHours: 8,
  stages,
  deals: [
    deal("d1", "Alpha", "won", at("2026-10-02T02:00:00Z"), { ...ana, value: myr(1000) }),
    deal("d2", "Beta", "lost", at("2026-09-10T02:00:00Z"), { ...ben, sampleStatus: "Feedback Received" }),
    deal("d3", "Gamma", "st", at("2026-10-01T02:00:00Z"), { ...ben, value: myr(5000), lastActivityAt: at("2026-10-06T02:00:00Z"), sampleStatus: "Sent", sampleSentDate: "2026-10-06" }),
    deal("d4", "Delta", "lead", at("2026-09-25T04:00:00Z"), { ...ben, lastActivityAt: daysAgo(20) }),
    deal("d5", "Epsilon", "lost", at("2026-10-03T02:00:00Z")),
    // 2026-09-30 20:00 in Malaysia: just before October starts there
    deal("d6", "Zeta", "lead", at("2026-09-30T12:00:00Z"), { lastActivityAt: daysAgo(1) }),
  ],
  history: [
    { recordId: "d1", toStatusId: "lead", changedAt: at("2026-10-02T02:00:00Z") },
    { recordId: "d1", toStatusId: "st", changedAt: at("2026-10-05T02:00:00Z") },
    { recordId: "d1", toStatusId: "qo", changedAt: at("2026-10-10T02:00:00Z") },
    { recordId: "d1", toStatusId: "won", changedAt: at("2026-10-12T02:00:00Z") },
    { recordId: "d2", toStatusId: "lead", changedAt: at("2026-09-10T02:00:00Z") },
    { recordId: "d2", toStatusId: "st", changedAt: at("2026-09-20T02:00:00Z") },
    { recordId: "d2", toStatusId: "lost", changedAt: at("2026-10-03T02:00:00Z") },
    { recordId: "d3", toStatusId: "lead", changedAt: at("2026-10-01T02:00:00Z") },
    { recordId: "d3", toStatusId: "st", changedAt: at("2026-10-06T02:00:00Z") },
    { recordId: "d4", toStatusId: "lead", changedAt: at("2026-09-25T04:00:00Z") },
    { recordId: "d5", toStatusId: "lead", changedAt: at("2026-10-03T02:00:00Z") },
    { recordId: "d5", toStatusId: "lost", changedAt: at("2026-10-04T02:00:00Z") },
    { recordId: "d6", toStatusId: "lead", changedAt: at("2026-09-30T12:00:00Z") },
  ],
  tasks: [
    { id: "t1", content: "Chase Gamma trial", deadline: daysAgo(2), isCompleted: false, assignees: [{ id: "u2", name: "Ben" }], linked: [{ id: "d3", displayName: "Gamma" }] },
    { id: "t2", content: "Done already", deadline: daysAgo(5), isCompleted: true, assignees: [{ id: "u1", name: "Ana" }], linked: [] },
    { id: "t3", content: "Future", deadline: daysAgo(-3), isCompleted: false, assignees: [], linked: [] },
  ],
  companies: [
    { id: "c1", name: "Acme", customerType: "Active Customer", lastOrderDate: daysAgo(100).slice(0, 10), personInCharge: "Ana" },
    { id: "c2", name: "Bolt", customerType: "Active Customer", lastOrderDate: daysAgo(10).slice(0, 10), personInCharge: null },
    { id: "c3", name: "Cord", customerType: "Active Customer", lastOrderDate: null, personInCharge: null },
    { id: "c4", name: "Dune", customerType: "Prospect", lastOrderDate: null, personInCharge: null },
  ],
});

const month = computeInsights(input("month"));
const all = computeInsights(input("all"));
const names = (deals: { name: string }[]) => deals.map((d) => d.name).sort();

test("period boundaries use Malaysian time", () => {
  assert.equal(new Date(periodStart("month", NOW, 8)!).toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(new Date(periodStart("quarter", NOW, 8)!).toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(new Date(periodStart("year", NOW, 8)!).toISOString(), "2025-12-31T16:00:00.000Z");
  assert.equal(periodStart("all", NOW, 8), null);
});

test("KPIs: open pipeline, won, lost and win rate for the month", () => {
  assert.equal(month.kpis.open.count, 3);
  assert.deepEqual(month.kpis.open.value, { MYR: 5000 });
  assert.deepEqual(names(month.kpis.won.deals), ["Alpha"]);
  assert.deepEqual(month.kpis.won.value, { MYR: 1000 });
  assert.deepEqual(names(month.kpis.lost.deals), ["Beta", "Epsilon"], "lost this month, even if created last month");
  assert.equal(month.kpis.winRate, 33);
});

test("pipeline by stage reflects current stages", () => {
  const p = Object.fromEntries(month.pipeline.map((s) => [s.title, names(s.deals)]));
  assert.deepEqual(p, { Lead: ["Delta", "Zeta"], "Sample and Trial": ["Gamma"], "Quote and Order": [], Won: ["Alpha"], Lost: ["Beta", "Epsilon"] });
});

test("conversion uses real stage history for deals created in the period", () => {
  assert.deepEqual(
    month.funnel.map((s) => [s.title, s.reached, s.conversionFromPrevious]),
    [["Lead", 3, null], ["Sample and Trial", 2, 67], ["Quote and Order", 1, 50], ["Won", 1, 100]]
  );
  assert.deepEqual(names(month.funnel[0].deals), ["Alpha", "Epsilon", "Gamma"], "Zeta was created just before the month started");
  assert.deepEqual(
    all.funnel.map((s) => [s.title, s.reached, s.conversionFromPrevious]),
    [["Lead", 6, null], ["Sample and Trial", 3, 50], ["Quote and Order", 1, 33], ["Won", 1, 100]]
  );
});

test("average days in stage over stays that ended in the period", () => {
  assert.deepEqual(
    month.avgDaysInStage.map((s) => [s.title, s.avgDays, s.deals]),
    [["Lead", 3, 3], ["Sample and Trial", 9, 2], ["Quote and Order", 2, 1]]
  );
  assert.equal(all.avgDaysInStage[0].avgDays, 4.8);
});

test("rotting, overdue tasks, samples and quiet customers", () => {
  assert.deepEqual(month.rotting.map((r) => [r.name, r.idleDays, r.limit]), [["Delta", 20, 14]]);
  assert.equal(month.kpis.overdueTasks, 1);
  assert.deepEqual(month.overdueByPerson.map((g) => [g.owner, g.tasks.map((t) => t.content)]), [["Ben", ["Chase Gamma trial"]]]);
  assert.deepEqual(month.samplesAwaiting.map((s) => [s.name, s.daysWaiting]), [["Gamma", 9]]);
  assert.deepEqual(month.quietCustomers.map((c) => c.name), ["Cord", "Acme"]);
});

test("per salesperson", () => {
  const by = Object.fromEntries(month.byOwner.map((o) => [o.owner, o]));
  assert.equal(by.Ben.openCount, 2);
  assert.deepEqual(by.Ben.openValue, { MYR: 5000 });
  assert.equal(by.Ben.rotting, 1);
  assert.equal(by.Ben.overdue, 1);
  assert.equal(by.Ana.wonCount, 1);
  assert.deepEqual(by.Ana.wonValue, { MYR: 1000 });
  assert.equal(by["(no owner)"].openCount, 1);
});
