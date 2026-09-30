// What to do today — a rule-based stand-in until the AI coach (Phase D)
// plans the week. Pure: the Week View passes in what it loaded.

import { addDays, daysBetween, mondayOf } from "@/lib/dates";
import type { SessionKind } from "@/lib/sessions";

export type TodayInput = {
  today: string;
  inProgress: boolean;
  /** Plans for today that aren't completed yet. */
  plannedToday: { id: string; label: string; kind: SessionKind; templateId: string | null }[];
  gymDoneToday: boolean;
  runDoneToday: boolean;
  /** Dates of completed gym workouts this week. */
  gymDatesThisWeek: string[];
  lastGymDate: string | null;
  gymTarget: number;
  templates: { id: string; name: string }[]; // rotation order
  lastTemplateId: string | null;
};

export type TodayAction =
  | { kind: "resume" }
  | { kind: "plan"; planId: string; label: string; planKind: SessionKind; templateId: string | null }
  | { kind: "gym"; templateId: string; templateName: string; reason: string }
  | { kind: "run-or-rest"; reason: string }
  | { kind: "done"; reason: string };

/** Full-body sessions need ~48 h between them for the same muscles to recover. */
export const GYM_MIN_GAP_DAYS = 2;

export function nextTemplate(templates: { id: string; name: string }[], lastId: string | null) {
  if (templates.length === 0) return null;
  const i = templates.findIndex((t) => t.id === lastId);
  return templates[(i + 1) % templates.length];
}

export function todayAction(x: TodayInput): TodayAction {
  if (x.inProgress) return { kind: "resume" };

  const plan = x.plannedToday[0];
  if (plan) {
    return { kind: "plan", planId: plan.id, label: plan.label, planKind: plan.kind, templateId: plan.templateId };
  }

  if (x.gymDoneToday) {
    return { kind: "done", reason: x.runDoneToday ? "Gym and run done today. Recover well." : "Gym done today. Eat, sleep, recover." };
  }

  const left = x.gymTarget - x.gymDatesThisWeek.length;
  const gap = x.lastGymDate ? daysBetween(x.lastGymDate, x.today) : Infinity;
  const next = nextTemplate(x.templates, x.lastTemplateId);

  if (next && left > 0 && gap >= GYM_MIN_GAP_DAYS) {
    // Days left this week, today included; sessions need a day between them.
    const daysLeft = daysBetween(x.today, addDays(mondayOf(x.today), 6)) + 1;
    const urgent = left > 1 && left >= Math.ceil(daysLeft / GYM_MIN_GAP_DAYS);
    return {
      kind: "gym",
      templateId: next.id,
      templateName: next.name,
      reason: `${x.gymDatesThisWeek.length} of ${x.gymTarget} gym sessions this week${urgent ? ", and the days to fit the rest are running out" : ""}.`,
    };
  }

  if (next && left > 0 && gap < GYM_MIN_GAP_DAYS) {
    return {
      kind: "run-or-rest",
      reason: "You lifted yesterday: give those muscles 48 h. A run or a rest day fits today.",
    };
  }

  return {
    kind: "run-or-rest",
    reason: x.runDoneToday ? "Run done today." : left <= 0 ? "Gym target met this week: today is for running or rest." : "A run or a rest day fits today.",
  };
}
