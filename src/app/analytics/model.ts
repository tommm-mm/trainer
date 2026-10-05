// Builds everything the Stats page shows from raw rows: chart data, trends,
// verdicts and the coach's read. Pure (no DB, no clock), so the page and a
// fixture preview render exactly the same thing.

import { addDays, formatShortDate, mondayOf } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import {
  ACWR_SAFE,
  EASY_MAX_HRR,
  EASY_MAX_RPE,
  LONG_RUN_MIN_WEEK_KM,
  LONG_RUN_SHARE,
  MONOTONY_HIGH,
  acwrSeries,
  dailyLoads,
  estimatedLoadShare,
  isCompleteWeek,
  linearFit,
  referenceHr,
  resolveHrAnchors,
  rollingMean,
  sessionLoads,
  trainingSummary,
  weekStarts,
  weeklyAerobic,
  weeklyMonotony,
  weeklyRunning,
  type ActivityInput,
  type HrAnchors,
} from "@/lib/metrics";
import {
  ACWR_SPIKE,
  MONOTONY_WATCH,
  assessAcwr,
  assessAerobicTrend,
  assessEasyHrTrend,
  assessLongRunShare,
  assessMonotony,
  assessRpeCoverage,
  assessVolumeRamp,
  coachRead,
  type Insight,
  type Verdict,
} from "@/lib/assess";
import type { Series, Threshold, Zone } from "./charts";
import { buildGymStats, type GymInput, type GymModel } from "./gym-model";
import { unlinkedWorkoutActivities } from "@/lib/strength";
import { formatValue, type ValueFormat } from "./format";
import { COLORS } from "./theme";

export const WEEKS = 12;
export const ACWR_DAYS = 56;

export type StatsInput = {
  today: string;
  /** Activities from at least `statsFrom(today)` to today. */
  activities: ActivityInput[];
  historyStart: string | null;
  body: { date: string; weight_kg: number | null; body_fat_pct: number | null }[];
  hr: { restHr: number | null; maxHr: number | null };
  /** Logged workouts; unlinked ones are added to the load as gym sessions. */
  gym?: Omit<GymInput, "today" | "weeks">;
};

export type ChartSpec = {
  data: Record<string, string | number | null>[];
  bars?: Series[];
  lines?: Series[];
  trend?: { key: string; name: string };
  format: ValueFormat;
  zones?: Zone[];
  thresholds?: Threshold[];
  domain?: [number, number];
  ticks?: number[];
  reversed?: boolean;
  allLabels?: boolean;
};

export type Table = { headers: string[]; rows: string[][] };

/** One of several charts in a block, picked with a chip (e.g. one per lift). */
export type Variant = { key: string; label: string; note?: string; chart: ChartSpec; table?: Table };

export type Block = {
  id: string;
  title: string;
  verdict: Verdict | null;
  how: string;
  chart?: ChartSpec;
  variants?: Variant[];
  table?: Table;
  /** Show the table without "Show numbers" (table-only cards). */
  tableOpen?: boolean;
};

export type StatsModel = {
  anchors: HrAnchors;
  easyHr: number;
  refHr: number;
  estimatedShare: number | null;
  tiles: { label: string; value: string; verdict: Verdict | null }[];
  coach: Insight[];
  /** Titles + values of everything currently on point (shown under the coach's read). */
  onPoint: { id: string; anchor?: string; title: string; value: string | null }[];
  blocks: Block[];
  gym: GymModel | null;
};

/** First date the page needs: 12 weeks of charts + 28 days of ACWR warm-up. */
export function statsFrom(today: string): string {
  return addDays(weekStarts(today, WEEKS)[0], -28);
}

export function buildStats(input: StatsInput): StatsModel {
  const { today } = input;
  // Workouts not linked to a Garmin session carry their own duration × session RPE.
  const acts = input.gym ? [...input.activities, ...unlinkedWorkoutActivities(input.gym.sessions)] : input.activities;
  const gym = input.gym ? buildGymStats({ today, weeks: WEEKS, ...input.gym }) : null;
  const weeks = weekStarts(today, WEEKS);
  const from = statsFrom(today);
  const complete = (w: string) => isCompleteWeek(w, today);
  const label = (w: string) => formatShortDate(w);
  const partialLabel = "This week so far";

  const anchors = resolveHrAnchors({ garminRest: input.hr.restHr, garminMax: input.hr.maxHr, activities: acts });
  const sessions = sessionLoads(acts, anchors);
  const daily = dailyLoads(sessions, from, today);
  const summary = trainingSummary(acts, anchors, today);
  const running = weeklyRunning(acts, today, WEEKS);
  const aerobic = weeklyAerobic(acts, anchors, today, WEEKS);
  const monotony = weeklyMonotony(daily, today).filter((w) => w.week >= weeks[0]);
  const acwr = acwrSeries(daily, input.historyStart).slice(-ACWR_DAYS);
  const estimatedShare = estimatedLoadShare(sessions.filter((s) => s.date >= weeks[0]));
  const refHr = referenceHr(anchors);
  const easyHr = Math.round(anchors.rest + EASY_MAX_HRR * (anchors.max - anchors.rest));

  const completeRunning = running.filter((r) => complete(r.week));
  // Aerobic trend only over complete weeks with data, oldest → newest.
  const completeAerobic = aerobic.filter((a) => complete(a.week));

  // ---- verdicts
  const v = {
    ramp: assessVolumeRamp(completeRunning),
    longRun: assessLongRunShare(completeRunning.at(-1)),
    acwr: assessAcwr(summary.acwr),
    monotony: assessMonotony(summary.monotony7d),
    aerobic: assessAerobicTrend(completeAerobic),
    easyHr: assessEasyHrTrend(completeAerobic),
    rpe: assessRpeCoverage(estimatedShare),
  };

  // ---- weekly volume + 4-week average (complete weeks only)
  const kmTrend = rollingMean(running.map((r) => (complete(r.week) ? r.km : null)), 4);
  const volume: Block = {
    id: "volume",
    title: "Weekly running volume",
    verdict: v.ramp,
    how: "Total running km per week (Mon–Sun). The dashed line is your 4-week average: its direction is the direction of your training. Build by about 10% a week at most.",
    chart: {
      data: running.map((r, i) => ({
        label: label(r.week),
        km: complete(r.week) ? round(r.km, 1) : null,
        partial: complete(r.week) ? null : round(r.km, 1),
        avg: kmTrend[i] === null ? null : round(kmTrend[i]!, 1),
      })),
      bars: [
        { key: "km", name: "Run km", color: COLORS.run, stackId: "v" },
        { key: "partial", name: partialLabel, color: COLORS.muted, stackId: "v" },
      ],
      trend: { key: "avg", name: "4-week average" },
      format: "km",
    },
    table: {
      headers: ["Week", "km", "Runs", "4-wk avg"],
      rows: running.map((r, i) => [
        label(r.week) + (complete(r.week) ? "" : "*"),
        formatNumber(r.km),
        String(r.runs),
        kmTrend[i] === null ? "–" : formatNumber(kmTrend[i]),
      ]),
    },
  };

  // ---- long-run share
  const longRun: Block = {
    id: "long-run",
    title: "Long-run share",
    verdict: v.longRun,
    how: `Longest run ÷ that week's km. Green band = the ${pct(LONG_RUN_SHARE.low)}–${pct(LONG_RUN_SHARE.high)} guideline; red zone = one run carrying too much of the week. Grey bars are weeks under ${LONG_RUN_MIN_WEEK_KM} km or the week in progress.`,
    chart: {
      data: running.map((r) => {
        const solid = complete(r.week) && r.km >= LONG_RUN_MIN_WEEK_KM;
        return {
          label: label(r.week),
          share: solid ? r.longRunShare : null,
          other: solid ? null : r.longRunShare,
        };
      }),
      bars: [
        { key: "share", name: "Long-run share", color: COLORS.run, stackId: "s" },
        { key: "other", name: `Partial / under ${LONG_RUN_MIN_WEEK_KM} km`, color: COLORS.muted, stackId: "s" },
      ],
      format: "pct",
      domain: [0, 1],
      ticks: [0, 0.25, 0.5, 0.75, 1],
      zones: [
        { from: LONG_RUN_SHARE.low, to: LONG_RUN_SHARE.high, status: "good", label: "30–35%" },
        { from: 0.45, to: 1, status: "off" },
      ],
    },
    table: {
      headers: ["Week", "Longest", "Week km", "Share"],
      rows: running.map((r) => [
        label(r.week) + (complete(r.week) ? "" : "*"),
        r.runs ? `${formatNumber(r.longestKm)} km` : "–",
        formatNumber(r.km),
        r.longRunShare === null ? "–" : pct(r.longRunShare),
      ]),
    },
  };

  // ---- weekly load (sRPE), stacked, + 4-week average
  const weeklyLoad = weeks.map((w) => {
    const days = daily.filter((d) => mondayOf(d.date) === w);
    return { week: w, run: sum(days.map((d) => d.run)), gym: sum(days.map((d) => d.gym)) };
  });
  const loadTrend = rollingMean(weeklyLoad.map((w) => (complete(w.week) ? w.run + w.gym : null)), 4);
  const load: Block = {
    id: "load",
    title: "Weekly training load",
    verdict: v.rpe,
    how: "Load = minutes × effort (RPE 1–10), in arbitrary units (AU). Gym counts too, because fatigue adds up wherever it comes from. Dashed line = 4-week average. Sessions without a rating use an estimate.",
    chart: {
      data: weeklyLoad.map((w, i) => ({
        label: label(w.week),
        run: Math.round(w.run),
        gym: Math.round(w.gym),
        avg: loadTrend[i] === null ? null : Math.round(loadTrend[i]!),
      })),
      bars: [
        { key: "run", name: "Run", color: COLORS.run, stackId: "l" },
        { key: "gym", name: "Gym, HIIT, bike/swim", color: COLORS.gym, stackId: "l" },
      ],
      trend: { key: "avg", name: "4-week average" },
      format: "load",
    },
    table: {
      headers: ["Week", "Run", "Other", "Total"],
      rows: weeklyLoad.map((w) => [
        label(w.week) + (complete(w.week) ? "" : "*"),
        formatNumber(w.run, 0),
        formatNumber(w.gym, 0),
        formatNumber(w.run + w.gym, 0),
      ]),
    },
  };

  // ---- ACWR with status zones
  const acwrMax = Math.max(2, Math.ceil(Math.max(0, ...acwr.map((p) => p.ratio ?? 0)) * 2) / 2);
  const acwrBlock: Block = {
    id: "acwr",
    title: "Acute : chronic workload (ACWR)",
    verdict: v.acwr,
    how: `Last 7 days of load ÷ your average week over the last 28 days. 1.0 = training exactly as you're used to. Green ${ACWR_SAFE.low}–${ACWR_SAFE.high} = sweet spot; amber = under-loading or climbing fast; red above ${ACWR_SPIKE} = spike, where injury risk rises.`,
    chart: {
      data: acwr.map((p) => ({ label: formatShortDate(p.date), ratio: p.ratio === null ? null : round(p.ratio, 2) })),
      lines: [{ key: "ratio", name: "ACWR", color: COLORS.run }],
      format: "ratio",
      domain: [0, acwrMax],
      ticks: steps(acwrMax, 0.5),
      zones: [
        { from: 0, to: ACWR_SAFE.low, status: "watch" },
        { from: ACWR_SAFE.low, to: ACWR_SAFE.high, status: "good", label: "sweet spot" },
        { from: ACWR_SAFE.high, to: ACWR_SPIKE, status: "watch" },
        { from: ACWR_SPIKE, to: acwrMax, status: "off", label: "spike" },
      ],
    },
    table: {
      headers: ["Day", "7-d load", "Avg week (28 d)", "ACWR"],
      rows: acwr
        .filter((_, i, a) => (a.length - 1 - i) % 7 === 0)
        .map((p) => [
          formatShortDate(p.date),
          formatNumber(p.acute, 0),
          formatNumber(p.chronic, 0),
          p.ratio === null ? "–" : p.ratio.toFixed(2),
        ]),
    },
  };

  // ---- monotony with zones (+ strain in the table)
  const monoMax = Math.max(2.5, Math.ceil(Math.max(0, ...monotony.map((m) => m.monotony ?? 0)) * 2) / 2);
  const monotonyBlock: Block = {
    id: "monotony",
    title: "Training monotony",
    verdict: v.monotony,
    how: `Average daily load ÷ how much it varies day to day, rest days included. Low = hard, easy and rest days well mixed. Amber above ${MONOTONY_WATCH}, red above ${MONOTONY_HIGH.toFixed(1)}: days too alike, which Foster linked to illness and overtraining. The badge uses your last 7 days.`,
    chart: {
      data: monotony.map((m) => ({
        label: label(m.week),
        mono: complete(m.week) && m.monotony !== null ? round(m.monotony, 2) : null,
        partial: !complete(m.week) && m.monotony !== null ? round(m.monotony, 2) : null,
      })),
      bars: [
        { key: "mono", name: "Monotony", color: COLORS.run, stackId: "m" },
        { key: "partial", name: partialLabel, color: COLORS.muted, stackId: "m" },
      ],
      format: "ratio",
      domain: [0, monoMax],
      ticks: steps(monoMax, 0.5),
      zones: [
        { from: 0, to: MONOTONY_WATCH, status: "good" },
        { from: MONOTONY_WATCH, to: MONOTONY_HIGH, status: "watch" },
        { from: MONOTONY_HIGH, to: monoMax, status: "off" },
      ],
    },
    table: {
      headers: ["Week", "Load", "Monotony", "Strain"],
      rows: monotony.map((m) => [
        label(m.week) + (complete(m.week) ? "" : "*"),
        formatNumber(m.load, 0),
        m.monotony === null ? "–" : m.monotony.toFixed(2),
        m.strain === null ? "–" : formatNumber(m.strain, 0),
      ]),
    },
  };

  // ---- aerobic: pace at reference HR + easy HR, each with a linear trend
  const paceFit = linearFit(completeAerobic.map((a) => a.paceAtRefHr));
  const hrFit = linearFit(completeAerobic.map((a) => a.avgHr));
  const completeIdx = new Map(completeAerobic.map((a, i) => [a.week, i]));
  const fitted = (fit: ReturnType<typeof linearFit>, week: string) => {
    const i = completeIdx.get(week);
    return fit && i !== undefined ? fit.fitted[i] : null;
  };
  const pace: Block = {
    id: "pace",
    title: `Easy pace at ${refHr} bpm`,
    verdict: v.aerobic,
    how: `Your easy runs converted to the pace you'd hold at ${refHr} bpm, scaling speed by heart-rate reserve (beats above your resting HR). Higher on the chart = faster at the same heart rate = fitter. The dashed line is the trend; ignore single weeks.`,
    chart: {
      data: aerobic.map((a) => ({
        label: label(a.week),
        pace: a.paceAtRefHr === null || !complete(a.week) ? null : Math.round(a.paceAtRefHr),
        trend: roundOrNull(fitted(paceFit, a.week), 0),
      })),
      lines: [{ key: "pace", name: `Pace @${refHr} bpm`, color: COLORS.run }],
      trend: { key: "trend", name: "Trend" },
      format: "pace",
      reversed: true,
    },
    table: {
      headers: ["Week", "Easy runs", "Avg HR", "EF", `Pace @${refHr}`],
      rows: aerobic.map((a) => [
        label(a.week) + (complete(a.week) ? "" : "*"),
        String(a.easyRuns),
        a.avgHr === null ? "–" : formatNumber(a.avgHr, 0),
        a.ef === null ? "–" : a.ef.toFixed(2),
        a.paceAtRefHr === null ? "–" : formatValue(a.paceAtRefHr, "pace"),
      ]),
    },
  };
  const easyHrBlock: Block = {
    id: "easy-hr",
    title: "Easy-run heart rate",
    verdict: v.easyHr,
    how: `Average heart rate on easy runs (rated RPE ≤ ${EASY_MAX_RPE}, or unrated at ≤ ${easyHr} bpm). Drifting down at similar paces = a stronger aerobic engine. Heat, poor sleep and stress push it up.`,
    chart: {
      data: aerobic.map((a) => ({
        label: label(a.week),
        hr: a.avgHr === null || !complete(a.week) ? null : Math.round(a.avgHr),
        trend: roundOrNull(fitted(hrFit, a.week), 1),
      })),
      lines: [{ key: "hr", name: "Avg HR", color: COLORS.run }],
      trend: { key: "trend", name: "Trend" },
      format: "bpm",
    },
  };

  const blocks: Block[] = [volume, longRun, load, acwrBlock, monotonyBlock, pace, easyHrBlock];

  // ---- body metrics (only with data; no verdict: direction depends on the goal)
  const weights = input.body.filter((b) => b.weight_kg !== null);
  if (weights.length > 0) {
    const wTrend = rollingMean(weights.map((b) => b.weight_kg), 7);
    blocks.push({
      id: "weight",
      title: "Weight",
      verdict: null,
      how: "Daily weigh-ins swing about ±1 kg with water, salt and food. The dashed line (7-entry average) is what matters. Weigh in the morning, before breakfast.",
      chart: {
        data: weights.map((b, i) => ({
          label: formatShortDate(b.date),
          kg: b.weight_kg,
          avg: wTrend[i] === null ? null : round(wTrend[i]!, 1),
        })),
        lines: [{ key: "kg", name: "Weight", color: COLORS.run }],
        trend: { key: "avg", name: "7-entry average" },
        format: "kg",
      },
    });
  }
  const fats = input.body.filter((b) => b.body_fat_pct !== null);
  if (fats.length > 0) {
    blocks.push({
      id: "body-fat",
      title: "Body fat",
      verdict: null,
      how: "Home scales estimate body fat from electrical impedance, which moves with hydration. Compare readings taken under the same conditions and read the multi-week trend.",
      chart: {
        data: fats.map((b) => ({ label: formatShortDate(b.date), bf: b.body_fat_pct! / 100 })),
        lines: [{ key: "bf", name: "Body fat", color: COLORS.gym }],
        format: "pct",
      },
    });
  }

  const insights: Insight[] = [
    { id: "acwr", title: "Workload", verdict: v.acwr },
    { id: "volume", title: "Volume ramp", verdict: v.ramp },
    { id: "monotony", title: "Variety", verdict: v.monotony },
    { id: "long-run", title: "Long run", verdict: v.longRun },
    { id: "pace", title: "Aerobic fitness", verdict: v.aerobic },
    { id: "easy-hr", title: "Easy-run HR", verdict: v.easyHr },
    { id: "load", title: "Effort ratings", verdict: v.rpe },
    ...(gym?.hasData ? gym.insights : []),
  ];
  // The card leads with what needs attention; what's fine goes in one line.
  const coach = coachRead(insights.filter((i) => i.verdict.status !== "good"));
  const onPoint = insights
    .filter((i) => i.verdict.status === "good")
    .map((i) => ({ id: i.id, anchor: i.anchor, title: i.title, value: i.verdict.value }));

  return {
    anchors,
    easyHr,
    refHr,
    estimatedShare,
    coach,
    onPoint,
    blocks,
    gym,
    tiles: [
      { label: "ACWR", value: v.acwr.value ?? "–", verdict: v.acwr },
      { label: "Monotony 7 d", value: v.monotony.value ?? "–", verdict: v.monotony },
      { label: "Run km this week", value: formatNumber(summary.weekKm), verdict: null },
      { label: "vs 3-wk avg", value: v.ramp.value ?? "–", verdict: v.ramp },
    ],
  };
}

function steps(max: number, step: number) {
  return Array.from({ length: Math.round(max / step) + 1 }, (_, i) => round(i * step, 2));
}

function pct(v: number) {
  return `${formatNumber(v * 100, 0)}%`;
}

function round(v: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function roundOrNull(v: number | null, digits: number) {
  return v === null ? null : round(v, digits);
}

function sum(values: number[]) {
  return values.reduce((s, x) => s + x, 0);
}
