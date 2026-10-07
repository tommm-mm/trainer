// Week checks: your rules applied to a planned week. Pure. They warn, they
// never block (you approve knowingly): red = safety, amber = everything else.
// Rules from the coaching brief (docs/coach/cowork-instructions.md):
//   red   gym and a hard run (quality or long) on the same day
//   red   two hard runs on the same day, or on consecutive days
//   red   the leg-heaviest gym session the day before a hard run
//   amber the leg-heaviest gym session two days before a hard run (~48 h)
//   amber gym sessions on consecutive days (≥ 48 h between full-body sessions)
//   amber week totals vs the season week: gym sessions, runs, quality
//         sessions, a long run, km (±10%)

import { addDays, daysBetween, formatDay } from "@/lib/dates";
import { sessionKind, sessionLabel } from "@/lib/sessions";
import type { WeekTargets } from "@/lib/season/model";

export type PlanInput = {
  day: string;
  session_type: string;
  target_distance_km: number | null;
  template_id: string | null;
};

export type TemplateLegs = { id: string; name: string; legSets: number };

export type Check = {
  severity: "red" | "amber";
  code:
    | "gym_hard_same_day"
    | "hard_same_day"
    | "hard_back_to_back"
    | "legs_before_hard"
    | "gym_back_to_back"
    | "gym_count"
    | "runs_count"
    | "quality_count"
    | "long_run"
    | "km";
  /** Days involved (for highlighting). */
  days: string[];
  message: string;
};

const QUALITY = /(tempo|interval|threshold|fartlek|vo2|race|marathon.?pace|\bmp\b)/i;
export const MAX_QUALITY = 2;
export const KM_TOLERANCE = 0.1;

export function isLongRun(p: Pick<PlanInput, "session_type">): boolean {
  return /long/i.test(p.session_type) && sessionKind(p.session_type) === "run";
}
export function isQuality(p: Pick<PlanInput, "session_type">): boolean {
  return sessionKind(p.session_type) === "run" && QUALITY.test(p.session_type);
}
/** A key session: quality or long run. */
export function isHardRun(p: Pick<PlanInput, "session_type">): boolean {
  return isLongRun(p) || isQuality(p);
}

const LEG_MUSCLES = ["quads", "hamstrings", "glutes"];

/**
 * Loaded leg sets per template: main-block sets with a target RIR whose
 * primary muscles include quads, hamstrings or glutes (plyometrics without a
 * RIR, like box jumps, don't count).
 */
export function legSets(
  items: { block: string; sets: number; target_rir: number | null; primary_muscles: string[] }[],
): number {
  return items
    .filter((i) => i.block === "main" && i.target_rir != null && i.primary_muscles.some((m) => LEG_MUSCLES.includes(m)))
    .reduce((n, i) => n + i.sets, 0);
}

/** Templates with the most leg sets (ties all count); none when no template trains legs. */
export function legHeaviest(templates: TemplateLegs[]): Set<string> {
  const max = Math.max(0, ...templates.map((t) => t.legSets));
  return new Set(max > 0 ? templates.filter((t) => t.legSets === max).map((t) => t.id) : []);
}

const day = (d: string) => formatDay(d).slice(0, 3);
const label = (p: PlanInput) => sessionLabel(p.session_type).toLowerCase();

/**
 * Checks the plans of the week starting `monday`. `plans` may include the
 * two days either side (other weeks), so spacing across the week boundary is
 * checked too; totals only count this week.
 */
export function checkWeek(opts: {
  monday: string;
  plans: PlanInput[];
  templates: TemplateLegs[];
  target?: WeekTargets | null;
}): Check[] {
  const { monday, plans, templates, target } = opts;
  const sunday = addDays(monday, 6);
  const inWeek = (d: string) => d >= monday && d <= sunday;
  const heavy = legHeaviest(templates);
  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const byDay = new Map<string, PlanInput[]>();
  for (const p of plans) {
    const kind = sessionKind(p.session_type);
    if (kind === "other") continue;
    byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
  }
  const days = [...byDay.keys()].sort();
  const out: Check[] = [];
  const gymName = (p: PlanInput) => (p.template_id && templateName.get(p.template_id)) || "gym";

  // ---- same day
  for (const d of days.filter(inWeek)) {
    const list = byDay.get(d)!;
    const hard = list.filter(isHardRun);
    const gym = list.filter((p) => sessionKind(p.session_type) === "gym");
    if (hard.length && gym.length) {
      out.push({
        severity: "red",
        code: "gym_hard_same_day",
        days: [d],
        message: `${day(d)}: ${gymName(gym[0])} and a ${label(hard[0])} on the same day. Keep gym and hard runs on separate days.`,
      });
    }
    if (hard.length > 1) {
      out.push({
        severity: "red",
        code: "hard_same_day",
        days: [d],
        message: `${day(d)}: ${hard.map(label).join(" and ")} on the same day. Quality and long runs go on separate days.`,
      });
    }
  }

  // ---- spacing (pairs touching this week)
  for (let i = 0; i < days.length; i++) {
    for (let j = i + 1; j < days.length; j++) {
      const [a, b] = [days[i], days[j]];
      const gap = daysBetween(a, b);
      if (gap > 2) break;
      if (!inWeek(a) && !inWeek(b)) continue;
      const pa = byDay.get(a)!;
      const pb = byDay.get(b)!;
      const hardA = pa.find(isHardRun);
      const hardB = pb.find(isHardRun);
      const gymA = pa.find((p) => sessionKind(p.session_type) === "gym");
      const gymB = pb.find((p) => sessionKind(p.session_type) === "gym");

      if (gap === 1 && hardA && hardB) {
        out.push({
          severity: "red",
          code: "hard_back_to_back",
          days: [a, b],
          message: `${day(a)} ${label(hardA)} → ${day(b)} ${label(hardB)}: two hard runs back to back. Keep key sessions ≥ 48 h apart.`,
        });
      }
      if (gymA && hardB && gymA.template_id && heavy.has(gymA.template_id)) {
        out.push({
          severity: gap === 1 ? "red" : "amber",
          code: "legs_before_hard",
          days: [a, b],
          message: `${day(a)} ${gymName(gymA)} (your leg-heaviest session) ${gap === 1 ? "the day before" : "2 days before"} ${day(b)}'s ${label(hardB)}. Keep it out of the 48 h before key runs.`,
        });
      }
      if (gap === 1 && gymA && gymB) {
        out.push({
          severity: "amber",
          code: "gym_back_to_back",
          days: [a, b],
          message: `${day(a)} and ${day(b)}: gym on consecutive days. Leave ≥ 48 h between full-body sessions.`,
        });
      }
    }
  }

  // ---- totals vs the season week
  if (target) {
    const week = plans.filter((p) => inWeek(p.day));
    const runs = week.filter((p) => sessionKind(p.session_type) === "run");
    const gymDays = new Set(week.filter((p) => sessionKind(p.session_type) === "gym").map((p) => p.day)).size;
    const quality = runs.filter(isQuality).length;
    const km = runs.reduce((s, p) => s + (p.target_distance_km ?? 0), 0);
    const allKm = runs.length > 0 && runs.every((p) => p.target_distance_km != null);
    const add = (code: Check["code"], message: string) => out.push({ severity: "amber", code, days: [], message });

    if (target.gym_sessions != null && gymDays < target.gym_sessions) {
      add("gym_count", `${gymDays} gym session${gymDays === 1 ? "" : "s"} planned, the block calls for ${target.gym_sessions}. Reschedule rather than drop.`);
    }
    if (target.runs != null && runs.length > target.runs) {
      add("runs_count", `${runs.length} runs planned, the season week has ${target.runs}.`);
    }
    const maxQuality = Math.min(MAX_QUALITY, target.quality_sessions ?? MAX_QUALITY);
    if (quality > maxQuality) {
      add("quality_count", `${quality} quality sessions planned, max ${maxQuality} this week.`);
    }
    if (target.long_run_km && runs.length > 0 && !runs.some(isLongRun)) {
      add("long_run", `No long run planned (target ${target.long_run_km} km).`);
    }
    if (target.run_km && allKm && Math.abs(km - target.run_km) > target.run_km * KM_TOLERANCE) {
      add("km", `${Math.round(km * 10) / 10} km planned vs ${target.run_km} km in the season week (±${KM_TOLERANCE * 100}%).`);
    }
  }

  return out.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "red" ? -1 : 1));
}
