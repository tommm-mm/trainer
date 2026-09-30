// Where you are in a season and how the done work compares with the plan.
// Pure: the Season page and the Week View pass in rows they already load.

import { addDays, mondayOf } from "@/lib/dates";
import type { WeekTargets } from "./model";

export type BlockWithWeeks = { name: string; focus: string; weeks: WeekTargets[] };

export type Position = {
  blockIndex: number;
  /** 1-based week inside the block. */
  weekInBlock: number;
  blockWeeks: number;
  /** 1-based week inside the season. */
  seasonWeek: number;
  seasonWeeks: number;
  week: WeekTargets;
};

/** The block and week containing `today`, or null before/after the season. */
export function currentPosition(blocks: BlockWithWeeks[], today: string): Position | null {
  const monday = mondayOf(today);
  const seasonWeeks = blocks.reduce((n, b) => n + b.weeks.length, 0);
  let seasonWeek = 0;
  for (const [blockIndex, b] of blocks.entries()) {
    for (const [i, w] of b.weeks.entries()) {
      seasonWeek++;
      if (w.week_start === monday) {
        return { blockIndex, weekInBlock: i + 1, blockWeeks: b.weeks.length, seasonWeek, seasonWeeks, week: w };
      }
    }
  }
  return null;
}

export type ActivityRow = { date: string; type: string; distance_km: number | null };

export type WeekActual = {
  run_km: number;
  runs: number;
  long_run_km: number;
  gym_sessions: number;
  cross_sessions: number;
};

/**
 * Done work per ISO week. Gym sessions count distinct days with a Garmin
 * strength activity or a finished logged workout (same rule as the Week View);
 * HIIT "cardio" finishers don't count. Cross-training counts distinct days
 * with a bike / swim activity.
 */
export function weeklyActuals(
  activities: ActivityRow[],
  workoutDates: string[] = [],
): Map<string, WeekActual> {
  const out = new Map<string, WeekActual>();
  const gymDays = new Map<string, Set<string>>();
  const crossDays = new Map<string, Set<string>>();
  const get = (week: string) => {
    let a = out.get(week);
    if (!a) {
      a = { run_km: 0, runs: 0, long_run_km: 0, gym_sessions: 0, cross_sessions: 0 };
      out.set(week, a);
    }
    return a;
  };
  const addGym = (date: string) => {
    const week = mondayOf(date);
    const days = gymDays.get(week) ?? new Set<string>();
    days.add(date);
    gymDays.set(week, days);
    get(week).gym_sessions = days.size;
  };

  for (const a of activities) {
    if (a.type === "run") {
      const w = get(mondayOf(a.date));
      const km = Number(a.distance_km ?? 0);
      w.run_km = Math.round((w.run_km + km) * 10) / 10;
      w.runs++;
      w.long_run_km = Math.max(w.long_run_km, km);
    } else if (a.type === "gym") {
      addGym(a.date);
    } else if (a.type === "cross") {
      const week = mondayOf(a.date);
      const days = crossDays.get(week) ?? new Set<string>();
      days.add(a.date);
      crossDays.set(week, days);
      get(week).cross_sessions = days.size;
    }
  }
  for (const d of workoutDates) addGym(d);
  return out;
}

/**
 * On-target band for weekly km: ±6% (≈ ±2 km at 30 km, ±4 km at 60 km).
 * A week is judged on the totals, not on which day each run happened.
 */
export const KM_TOLERANCE = 0.06;

export type WeekVerdict = "ahead" | "on_target" | "short" | "missed" | "open";

export function judgeWeek(
  target: number | null | undefined,
  done: number,
  weekStart: string,
  today: string,
): WeekVerdict {
  if (!target) return "open";
  const finished = addDays(weekStart, 6) < today;
  if (done > target * (1 + KM_TOLERANCE)) return "ahead";
  if (done >= target * (1 - KM_TOLERANCE)) return "on_target";
  if (!finished) return "open";
  return done >= target * 0.7 ? "short" : "missed";
}
