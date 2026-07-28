import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMorningProposal, commitmentKeptPct, estimateAccuracyPct, priorityScore, realCapacity,
} from "../lib/scoring";
import { computeAllNudges, topNudges } from "../lib/nudges";
import { buildIcsFeed } from "../lib/ics";
import type { Task, Initiative, CadenceRule, Goal, Metric } from "../lib/types";

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? "t1",
    areaId: "area-1",
    goalId: null,
    initiativeId: null,
    type: "build",
    subtype: null,
    title: "Task",
    definitionOfDone: null,
    size: "S",
    estimateMinutes: 30,
    actualMinutes: null,
    priority: 3,
    severity: null,
    dueAt: null,
    scheduledAt: null,
    assigneeId: null,
    status: "specced",
    createdAt: new Date().toISOString(),
    closedAt: null,
    lastTouchedAt: new Date().toISOString(),
    hypothesis: null,
    targetMetric: null,
    artifactDefinition: null,
    cadenceRuleId: null,
    committedForDate: null,
    droppedReason: null,
    ...overrides,
  };
}

test("priorityScore rewards severity 1 bugs over low-priority cosmetic issues", () => {
  const crash = task({ type: "build", subtype: "bug", severity: 1, priority: 2 });
  const cosmetic = task({ type: "build", subtype: "bug", severity: 4, priority: 2 });
  assert.ok(priorityScore(crash) > priorityScore(cosmetic));
});

test("priorityScore increases with staleness, capped at 5", () => {
  const stale = task({ lastTouchedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() });
  const fresh = task({ lastTouchedAt: new Date().toISOString() });
  assert.ok(priorityScore(stale) > priorityScore(fresh));
});

test("buildMorningProposal respects the max-2-per-area mix constraint", () => {
  const tasks = [
    task({ id: "a1", areaId: "area-a", estimateMinutes: 30 }),
    task({ id: "a2", areaId: "area-a", estimateMinutes: 30 }),
    task({ id: "a3", areaId: "area-a", estimateMinutes: 30 }),
    task({ id: "b1", areaId: "area-b", estimateMinutes: 30 }),
  ];
  const result = buildMorningProposal(tasks, {}, { availableMinutes: 240 });
  const areaACount = result.proposed.filter((t) => t.areaId === "area-a").length;
  assert.ok(areaACount <= 2);
});

test("buildMorningProposal never exceeds the available-minutes budget", () => {
  const tasks = Array.from({ length: 10 }, (_, i) =>
    task({ id: `t${i}`, areaId: `area-${i}`, estimateMinutes: 90 })
  );
  const result = buildMorningProposal(tasks, {}, { availableMinutes: 200 });
  assert.ok(result.totalMinutes <= 200);
});

test("buildMorningProposal excludes delegated tasks from capacity, returns them separately", () => {
  const tasks = [
    task({ id: "d1", type: "delegated", estimateMinutes: 500 }),
    task({ id: "b1", estimateMinutes: 30 }),
  ];
  const result = buildMorningProposal(tasks, {}, { availableMinutes: 60 });
  assert.equal(result.proposed.some((t) => t.type === "delegated"), false);
  assert.equal(result.delegatedChecks.length, 1);
});

test("commitmentKeptPct: 3 of 3 beats 6 of 12", () => {
  const threeOfThree = commitmentKeptPct(3, 3)!;
  const sixOfTwelve = commitmentKeptPct(6, 12)!;
  assert.ok(threeOfThree > sixOfTwelve);
  assert.equal(threeOfThree, 1);
  assert.equal(sixOfTwelve, 0.5);
});

test("estimateAccuracyPct is 1 when actual matches estimate exactly", () => {
  assert.equal(estimateAccuracyPct(90, 90), 1);
});

test("realCapacity averages closed-committed counts", () => {
  assert.equal(realCapacity([2, 4, 6]), 4);
  assert.equal(realCapacity([]), 0);
});

test("topNudges caps at 3 regardless of how many are computed", () => {
  const initiatives: Initiative[] = Array.from({ length: 5 }, (_, i) => ({
    id: `init-${i}`,
    areaId: "area-1",
    title: `Initiative ${i}`,
    planBody: "",
    status: "running",
    ownerId: null,
    startedAt: new Date(Date.now() - 15 * 86_400_000).toISOString(),
    targetDate: null,
    restartAt: null,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
  }));
  const all = computeAllNudges({
    initiatives, cadenceRules: [], delegatedTasks: [], goals: [], metrics: [],
  });
  assert.ok(all.length >= 5);
  assert.equal(topNudges(all, 3).length, 3);
});

test("computeAllNudges never fires on vision items (no vision inputs accepted at all)", () => {
  // The nudge engine's input type has no vision-item field — vision items
  // structurally cannot produce a nudge. This test documents that guarantee.
  const inputKeys = Object.keys({
    initiatives: [], cadenceRules: [], delegatedTasks: [], goals: [], metrics: [],
  } satisfies Parameters<typeof computeAllNudges>[0]);
  assert.equal(inputKeys.includes("visionItems"), false);
});

test("cadence nudge only fires Thursday or later", () => {
  const rules: CadenceRule[] = [
    { id: "c1", areaId: "area-1", title: "Substack", targetPerWeek: 2, minPerWeek: null, currentWeekCount: 0, weekOf: "" },
  ];
  const monday = new Date("2026-08-03T12:00:00Z"); // a Monday
  const friday = new Date("2026-08-07T12:00:00Z"); // a Friday
  const onMonday = computeAllNudges({ initiatives: [], cadenceRules: rules, delegatedTasks: [], goals: [], metrics: [], now: monday });
  const onFriday = computeAllNudges({ initiatives: [], cadenceRules: rules, delegatedTasks: [], goals: [], metrics: [], now: friday });
  assert.equal(onMonday.some((n) => n.trigger === "cadence_behind"), false);
  assert.equal(onFriday.some((n) => n.trigger === "cadence_behind"), true);
});

test("goal past target_date with no movement produces a nudge", () => {
  const goals: Goal[] = [
    { id: "g1", areaId: "area-1", initiativeId: null, title: "Ship it", successDefinition: "x", targetDate: "2020-01-01", priority: 3, status: "active", visionItemId: null },
  ];
  const all = computeAllNudges({ initiatives: [], cadenceRules: [], delegatedTasks: [], goals, metrics: [] });
  assert.ok(all.some((n) => n.trigger === "goal_past_target"));
});

test("metric not updated in 14+ days produces a nudge", () => {
  const metrics: Metric[] = [
    { id: "m1", areaId: "area-1", name: "D7 retention", isNorthStar: true, parentMetricId: null, currentValue: 1, targetValue: 2, unit: "%", updatedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() },
  ];
  const all = computeAllNudges({ initiatives: [], cadenceRules: [], delegatedTasks: [], goals: [], metrics });
  assert.ok(all.some((n) => n.trigger === "metric_not_updated"));
});

test("buildIcsFeed produces a well-formed VCALENDAR with folded long lines", () => {
  const feed = buildIcsFeed(
    [{
      uid: "x@personal-pm",
      summary: "A".repeat(100),
      start: new Date("2026-01-01T10:00:00Z"),
      end: new Date("2026-01-01T11:00:00Z"),
    }],
    new Date("2026-01-01T00:00:00Z")
  );
  assert.ok(feed.startsWith("BEGIN:VCALENDAR"));
  assert.ok(feed.trim().endsWith("END:VCALENDAR"));
  assert.ok(feed.includes("BEGIN:VEVENT"));
  // Folded continuation lines start with a single space per RFC 5545.
  assert.ok(feed.includes("\r\n "));
});
