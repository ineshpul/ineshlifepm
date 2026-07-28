// §7.5 Nudge engine — maximum 3 render on Today. Never fires on Vision items.
import type { Initiative, CadenceRule, Task, Goal, Metric, Nudge } from "./types";
import { daysSince, isThursdayOrLater } from "./dates";

export interface NudgeInputs {
  initiatives: Initiative[];
  cadenceRules: CadenceRule[];
  delegatedTasks: Task[];
  goals: Goal[];
  metrics: Metric[];
  learningActiveCount?: number; // out of 2 max slots
  now?: Date;
}

export function computeAllNudges(input: NudgeInputs): Nudge[] {
  const now = input.now ?? new Date();
  const nudges: Nudge[] = [];

  for (const init of input.initiatives) {
    if (init.status === "parked") continue; // silent until restart_at, handled by caller filtering
    if (init.status === "handing_off") {
      const d = daysSince(init.startedAt, now);
      if (d >= 21) {
        nudges.push({
          id: `init-handoff-${init.id}`,
          trigger: "initiative_handoff_stalled",
          message: `${init.title} handoff still open`,
          severity: 4 + Math.min(6, Math.floor((d - 21) / 7)),
          entityType: "initiative",
          entityId: init.id,
        });
      }
    } else {
      // untouched 10+ days — approximate "touched" via startedAt if no activity tracking passed in;
      // caller should pass a more precise lastActivityAt if available via outcomeNotes timestamps.
      const lastActivity =
        init.outcomeNotes.length > 0
          ? init.outcomeNotes[init.outcomeNotes.length - 1]!.date
          : init.startedAt;
      const d = daysSince(lastActivity, now);
      if (d >= 10) {
        nudges.push({
          id: `init-stale-${init.id}`,
          trigger: "initiative_untouched",
          message: `${init.title} hasn't moved in ${d} days`,
          severity: 3 + Math.min(6, Math.floor((d - 10) / 7)),
          entityType: "initiative",
          entityId: init.id,
        });
      }
    }
  }

  if (isThursdayOrLater(now)) {
    for (const rule of input.cadenceRules) {
      if (rule.currentWeekCount < rule.targetPerWeek) {
        nudges.push({
          id: `cadence-${rule.id}`,
          trigger: "cadence_behind",
          message: `${rule.title} ${rule.currentWeekCount} of ${rule.targetPerWeek} this week`,
          severity: 2 + (rule.targetPerWeek - rule.currentWeekCount),
          entityType: "cadenceRule",
          entityId: rule.id,
        });
      }
    }
  }

  for (const t of input.delegatedTasks) {
    if (t.status === "accepted") continue;
    const d = daysSince(t.lastTouchedAt, now);
    if (d >= 7) {
      nudges.push({
        id: `delegated-${t.id}`,
        trigger: "delegated_stalled",
        message: `${t.title} has been in progress ${d} days`,
        severity: 3 + Math.min(6, Math.floor((d - 7) / 7)),
        entityType: "task",
        entityId: t.id,
      });
    }
  }

  for (const g of input.goals) {
    if (g.status !== "active" || !g.targetDate) continue;
    if (new Date(g.targetDate).getTime() < now.getTime()) {
      nudges.push({
        id: `goal-overdue-${g.id}`,
        trigger: "goal_past_target",
        message: `${g.title} passed its date. Re-date it or park it.`,
        severity: 6,
        entityType: "goal",
        entityId: g.id,
      });
    }
  }

  for (const m of input.metrics) {
    const d = daysSince(m.updatedAt, now);
    if (d >= 14) {
      nudges.push({
        id: `metric-stale-${m.id}`,
        trigger: "metric_not_updated",
        message: `${m.name} last updated ${d} days ago`,
        severity: 2 + Math.min(6, Math.floor((d - 14) / 7)),
        entityType: "metric",
        entityId: m.id,
      });
    }
  }

  if (typeof input.learningActiveCount === "number" && input.learningActiveCount < 2) {
    nudges.push({
      id: "learning-slot-empty",
      trigger: "learning_slot_empty",
      message: `${2 - input.learningActiveCount} learning slot${input.learningActiveCount === 0 ? "s" : ""} free`,
      severity: 1,
      entityType: "learning",
      entityId: "active",
    });
  }

  return nudges.sort((a, b) => b.severity - a.severity);
}

export function topNudges(all: Nudge[], max = 3): Nudge[] {
  return all.slice(0, max);
}
