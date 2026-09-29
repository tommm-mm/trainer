// Gym section of the Stats page: charts, verdicts and tables from logged
// workouts. Pure (no DB, no clock), like model.ts.

import { formatShortDate, mondayOf } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import {
  E1RM_MAX_REPS,
  HARD_SET_RANGE,
  MUSCLES,
  isHardSet,
  liftTrendPctPerWeek,
  muscleSets,
  personalRecords,
  trainedMainLifts,
  weeklyGym,
  weeklyLift,
  liftHistory,
  type ExerciseIndex,
  type StrengthSession,
} from "@/lib/strength";
import {
  assessAdherence,
  assessGymFrequency,
  assessMuscleVolume,
  assessStrengthTrend,
  type Insight,
  type Verdict,
} from "@/lib/assess";
import { isCompleteWeek, linearFit, rollingMean } from "@/lib/metrics";
import type { Block } from "./model";
import { COLORS } from "./theme";

export type GymInput = {
  today: string;
  weeks: number;
  sessions: StrengthSession[];
  index: ExerciseIndex;
  /** Planned gym sessions per week (active templates). */
  target: number;
};

export type GymModel = {
  hasData: boolean;
  tiles: { label: string; value: string; verdict: Verdict | null }[];
  blocks: Block[];
  insights: Insight[];
};

const MUSCLE_SHORT: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Delts",
  biceps: "Bis",
  triceps: "Tris",
  quads: "Quads",
  hamstrings: "Hams",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
};

export function buildGymStats(input: GymInput): GymModel {
  const { today, weeks: n, sessions, index, target } = input;
  const weeks = weeklyGym(sessions, index, today, n);
  const complete = (w: string) => isCompleteWeek(w, today);
  const label = (w: string) => formatShortDate(w);
  const lastComplete = [...weeks].reverse().find((w) => complete(w.week) && w.sessions > 0) ?? null;
  const current = weeks.at(-1)!;
  const hasData = sessions.length > 0;

  // ---- verdicts
  const lifts = trainedMainLifts(sessions, index);
  const liftTrends = lifts
    .map((id) => {
      const series = weeklyLift(sessions, id, today, n).map((w) => (complete(w.week) || w.week === current.week ? w.e1rm : null));
      const t = liftTrendPctPerWeek(series);
      return t ? { id, name: shortName(index[id].name), pct: t.pct } : null;
    })
    .filter((x): x is { id: string; name: string; pct: number } => x !== null);
  const completeWithData = weeks.filter((w) => complete(w.week));
  const firstLogged = completeWithData.findIndex((w) => w.sessions > 0);
  const since = firstLogged < 0 ? [] : completeWithData.slice(firstLogged).slice(-4);
  const adherenceShares = since.map((w) => w.setAdherence).filter((v): v is number => v !== null);
  const v = {
    volume: assessMuscleVolume(lastComplete?.muscles ?? null),
    strength: assessStrengthTrend(liftTrends.map((l) => ({ name: l.name, pct: l.pct }))),
    frequency: assessGymFrequency(since.map((w) => w.sessions), target),
    adherence: assessAdherence(adherenceShares.length ? mean(adherenceShares) : null),
  };

  // ---- hard sets per muscle: last complete week vs this week so far
  const thisWeek = muscleSets(sessions.filter((w) => mondayOf(w.date) === current.week), index);
  const volumePeak = Math.max(0, ...MUSCLES.map((m) => Math.max(thisWeek[m], lastComplete?.muscles[m] ?? 0)));
  const volumeMax = Math.max(25, Math.ceil(volumePeak / 5) * 5);
  const volume: Block = {
    id: "gym-volume",
    title: "Hard sets per muscle",
    verdict: v.volume,
    how: `Working sets at RIR ≤ 4 in the main block, per muscle; secondary muscles count half. Green band = ${HARD_SET_RANGE.low}–${HARD_SET_RANGE.high} sets a week: at least 10 grew more muscle than fewer (Schoenfeld 2017), and returns flatten above ~20 (Pelland 2024). While running is the priority, maintaining needs about a third of that (Bickel 2011). Calves and core aren't judged.`,
    chart: {
      data: MUSCLES.map((m) => ({
        label: MUSCLE_SHORT[m],
        last: lastComplete ? lastComplete.muscles[m] : null,
        now: thisWeek[m],
      })),
      bars: [
        { key: "last", name: lastComplete ? `Week of ${label(lastComplete.week)}` : "Last week", color: COLORS.gym },
        { key: "now", name: "This week so far", color: COLORS.muted },
      ],
      format: "sets",
      allLabels: true,
      // Always show the whole 10–20 band.
      domain: [0, volumeMax],
      ticks: Array.from({ length: volumeMax / 5 + 1 }, (_, i) => i * 5),
      zones: [{ from: HARD_SET_RANGE.low, to: HARD_SET_RANGE.high, status: "good", label: "10–20" }],
    },
    table: {
      headers: ["Muscle", "Last wk", "This wk"],
      rows: MUSCLES.map((m) => [
        MUSCLE_SHORT[m],
        lastComplete ? fmt(lastComplete.muscles[m]) : "–",
        fmt(thisWeek[m]),
      ]),
    },
  };

  // ---- e1RM per main lift (one chart, a chip per lift)
  const strength: Block = {
    id: "gym-strength",
    title: "Estimated 1RM · main lifts",
    verdict: v.strength,
    how: `e1RM = weight × (1 + (reps + RIR) / 30): Epley's formula with the reps you had left added back. Best working set per week. Only sets with reps + RIR ≤ ${E1RM_MAX_REPS} count (beyond that the estimate is unreliable); unrated RIR counts as 0, so those estimates run low. RIR is a self-estimate (±1 rep), so read the trend, not single weeks. Compare a lift only with itself.`,
    chart: undefined,
    variants: lifts.map((id) => {
      const series = weeklyLift(sessions, id, today, n);
      const vals = series.map((w) => w.e1rm);
      const pctFit = liftTrendPctPerWeek(vals);
      const hist = liftHistory(sessions, id);
      // Draw the trend only across the weeks you actually logged: no extrapolation.
      const first = vals.findIndex((x) => x !== null);
      const last = vals.length - 1 - [...vals].reverse().findIndex((x) => x !== null);
      const fit = linearFit(vals);
      const fitted = fit ? fit.fitted.map((y, i) => (i >= first && i <= last ? y : null)) : null;
      return {
        key: id,
        label: shortName(index[id].name),
        note: pctFit
          ? `${pctFit.pct >= 0 ? "+" : "−"}${formatNumber(Math.abs(pctFit.pct) * 100, 1)}% per week`
          : "Needs 3 weeks of data for a trend",
        chart: {
          data: series.map((w, i) => ({
            label: label(w.week),
            e1rm: w.e1rm === null ? null : round(w.e1rm, 1),
            trend: fitted && fitted[i] !== null ? round(fitted[i]!, 1) : null,
          })),
          lines: [{ key: "e1rm", name: "e1RM", color: COLORS.gym }],
          trend: fitted ? { key: "trend", name: "Trend" } : undefined,
          format: "kg",
        },
        table: {
          headers: ["Date", "Top set", "e1RM"],
          rows: [...hist].reverse().slice(0, 8).map((p) => [
            formatShortDate(p.date),
            `${formatNumber(p.topSet.weight_kg, 1)} × ${p.topSet.reps}${p.topSet.rir !== null ? ` @${p.topSet.rir}` : ""}`,
            `${formatNumber(p.e1rm, 1)} kg`,
          ]),
        },
      };
    }),
  };

  // ---- tonnage
  const tonnageTrend = rollingMean(weeks.map((w) => (complete(w.week) && w.sessions > 0 ? w.tonnage : null)), 4);
  const tonnage: Block = {
    id: "gym-tonnage",
    title: "Weekly tonnage",
    verdict: null,
    how: "Weight × reps of every working set, summed per week (bodyweight moves count only the added load). It moves with both effort and exercise choice, so use it to spot big swings, not as a goal.",
    chart: {
      data: weeks.map((w, i) => ({
        label: label(w.week),
        t: complete(w.week) ? round(w.tonnage / 1000, 2) : null,
        partial: complete(w.week) ? null : round(w.tonnage / 1000, 2),
        avg: tonnageTrend[i] === null ? null : round(tonnageTrend[i]! / 1000, 2),
      })),
      bars: [
        { key: "t", name: "Tonnage", color: COLORS.gym, stackId: "t" },
        { key: "partial", name: "This week so far", color: COLORS.muted, stackId: "t" },
      ],
      trend: { key: "avg", name: "4-week average" },
      format: "tonnes",
    },
  };

  // ---- sessions & adherence
  const sessionsBlock: Block = {
    id: "gym-sessions",
    title: "Gym sessions & adherence",
    verdict: v.frequency,
    how: `Workouts logged per week; the line is your plan (${target} a week, one per active workout template). Adherence = prescribed working sets you actually did (capped per exercise), and the share of rated sets within ±1 of the target RIR.`,
    chart: {
      data: weeks.map((w) => ({
        label: label(w.week),
        s: complete(w.week) ? w.sessions : null,
        partial: complete(w.week) ? null : w.sessions,
      })),
      bars: [
        { key: "s", name: "Sessions", color: COLORS.gym, stackId: "s" },
        { key: "partial", name: "This week so far", color: COLORS.muted, stackId: "s" },
      ],
      format: "count",
      thresholds: target > 0 ? [{ y: target, status: "good", label: `plan ${target}` }] : [],
      ticks: [0, 1, 2, 3, 4, 5],
      domain: [0, Math.max(5, target + 1)],
    },
    table: {
      headers: ["Week", "Sessions", "Hard sets", "Sets done", "RIR on target"],
      rows: weeks.map((w) => [
        label(w.week) + (complete(w.week) ? "" : "*"),
        String(w.sessions),
        String(w.hardSets),
        w.setAdherence === null ? "–" : pct(w.setAdherence),
        w.rirAdherence === null ? "–" : pct(w.rirAdherence),
      ]),
    },
  };

  // ---- PRs
  const prs = personalRecords(sessions, index).reverse();
  const recentPrs = prs.filter((p) => p.date >= weeks[Math.max(0, weeks.length - 4)].week);
  const prBlock: Block = {
    id: "gym-prs",
    title: "Personal records",
    verdict: null,
    how: "A record is a session beating every earlier one for that exercise: the best estimated 1RM, or the heaviest working weight. The first time you log an exercise sets the baseline.",
    chart: undefined,
    tableOpen: true,
    table: {
      headers: ["Date", "Exercise", "Record", "Before"],
      rows: prs.slice(0, 12).map((p) => [
        formatShortDate(p.date),
        shortName(index[p.exerciseId]?.name ?? "?"),
        p.kind === "e1rm"
          ? `e1RM ${formatNumber(p.value, 1)} (${formatNumber(p.set.weight_kg, 1)}×${p.set.reps})`
          : `${formatNumber(p.value, 1)} kg × ${p.set.reps}`,
        `${formatNumber(p.previous, 1)}`,
      ]),
    },
  };

  const hardThisWeek = sessions
    .filter((w) => mondayOf(w.date) === current.week)
    .reduce((s, w) => s + w.slots.reduce((t, slot) => t + slot.sets.filter((x) => isHardSet(x, slot.block, index[slot.exercise_id]?.measure ?? "reps")).length, 0), 0);

  return {
    hasData,
    tiles: [
      { label: "Gym this week", value: `${current.sessions}/${target || "–"}`, verdict: null },
      { label: "Hard sets this week", value: String(hardThisWeek), verdict: null },
      { label: "Strength trend", value: v.strength.value ?? "–", verdict: v.strength },
      { label: "PRs · 4 weeks", value: String(recentPrs.length), verdict: null },
    ],
    blocks: [volume, strength, sessionsBlock, tonnage, prBlock],
    insights: [
      { id: "gym-volume", title: "Muscle volume", verdict: v.volume },
      { id: "gym-strength", title: "Strength", verdict: v.strength },
      { id: "gym-sessions", title: "Gym consistency", verdict: v.frequency },
      { id: "gym-adherence", anchor: "gym-sessions", title: "Template adherence", verdict: v.adherence },
    ],
  };
}

/** "Squat (Barbell)" → "Squat" */
function shortName(name: string) {
  return name.replace(/\s*\(.*\)$/, "");
}

function mean(v: number[]) {
  return v.reduce((s, x) => s + x, 0) / v.length;
}
function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}
function fmt(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
