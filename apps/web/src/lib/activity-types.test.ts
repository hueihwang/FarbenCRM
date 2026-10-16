// Run: npx tsx --test apps/web/src/lib/activity-types.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isActivityType, isOverdue, normalizeDeadline, toDeadline } from "./activity-types";

test("activity types", () => {
  for (const t of ["call", "meeting", "visit", "email", "message", "sample", "follow_up"]) assert.ok(isActivityType(t), t);
  assert.ok(!isActivityType("lunch"));
  assert.ok(!isActivityType(undefined));
});

test("a bare date from the API is due by the end of that day in Malaysia", () => {
  assert.equal(normalizeDeadline("2026-10-20", false, 8)!.toISOString(), "2026-10-20T15:59:59.000Z");
  assert.equal(normalizeDeadline("2026-10-20", undefined, 8)!.toISOString(), "2026-10-20T15:59:59.000Z");
});

test("a full date-time is kept as given; empty or invalid gives null", () => {
  assert.equal(normalizeDeadline("2026-10-20T06:30:00.000Z", true, 8)!.toISOString(), "2026-10-20T06:30:00.000Z");
  assert.equal(normalizeDeadline(null, false, 8), null);
  assert.equal(normalizeDeadline("not a date", false, 8), null);
});

test("dialog dates use the user's own calendar day", () => {
  const picked = new Date(2026, 9, 20); // 20 Oct, local midnight
  const endOfDay = toDeadline(picked);
  assert.equal(endOfDay.getDate(), 20);
  assert.equal(endOfDay.getHours(), 23);
  const withTime = toDeadline(picked, "14:30");
  assert.deepEqual([withTime.getDate(), withTime.getHours(), withTime.getMinutes()], [20, 14, 30]);
});

test("an activity due today is not overdue until the day ends", () => {
  const now = new Date(2026, 9, 20, 9, 0).getTime();
  assert.ok(!isOverdue(toDeadline(new Date(2026, 9, 20)), now), "due today, morning: not overdue");
  assert.ok(isOverdue(toDeadline(new Date(2026, 9, 19)), now), "due yesterday: overdue");
  assert.ok(isOverdue(toDeadline(new Date(2026, 9, 20), "08:30"), now), "due today 08:30, now 09:00: overdue");
  assert.ok(!isOverdue(null, now));
});
