// Season model: goal → season (macrocycle) → blocks (mesocycles) → weeks.
// `SeasonDraft` is the one write contract for every coach (rules, Claude
// Code, the Claude API, Cowork): validate it here, then insert it with the
// `create_season_proposal` RPC. It always lands as `proposed`.
// Pure and deterministic, so the Season page and any coach see the same checks.

import { addDays, daysBetween, isISODate, mondayOf } from "@/lib/dates";
import { ACWR_SAFE } from "@/lib/metrics";

export const FOCUSES = [
  "base",
  "build",
  "specific",
  "peak",
  "taper",
  "recovery",
  "transition",
] as const;
export type Focus = (typeof FOCUSES)[number];

export const FOCUS_LABELS: Record<Focus, string> = {
  base: "Base",
  build: "Build",
  specific: "Specific",
  peak: "Peak",
  taper: "Taper",
  recovery: "Recovery",
  transition: "Transition",
};

/** Block colours, shared by the timeline and the volume chart. */
export const FOCUS_COLORS: Record<Focus, string> = {
  base: "#2d6a55",
  build: "#3b82a8",
  specific: "#a86b2d",
  peak: "#b8475a",
  taper: "#7c6bb0",
  recovery: "#52525b",
  transition: "#52525b",
};

export const GYM_FOCUSES = ["hypertrophy", "strength", "power", "maintenance", "off"] as const;
export type GymFocus = (typeof GYM_FOCUSES)[number];

export const SEASON_SOURCES = ["manual", "rules", "claude_code", "claude_api", "cowork"] as const;
export type SeasonSource = (typeof SEASON_SOURCES)[number];

export const SOURCE_LABELS: Record<SeasonSource, string> = {
  manual: "you",
  rules: "weekly rules",
  claude_code: "Claude Code",
  claude_api: "AI coach",
  cowork: "Cowork",
};

export const SEASON_STATUSES = ["proposed", "approved", "superseded", "rejected"] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

/** Your caps. Guardrails warn when a week goes past them. */
export type SeasonLimits = {
  max_runs_per_week?: number;
  max_week_km?: number;
  max_long_run_km?: number;
  max_gym_per_week?: number;
};

export type WeekTargets = {
  week_start: string;
  is_deload?: boolean;
  run_km?: number | null;
  long_run_km?: number | null;
  runs?: number | null;
  quality_sessions?: number | null;
  gym_sessions?: number | null;
  key_session?: string | null;
  milestone?: string | null;
  notes?: string | null;
};

export type BlockDraft = {
  name: string;
  focus: Focus;
  gym_focus?: GymFocus | null;
  purpose?: string | null;
  key_sessions?: string | null;
  weeks: WeekTargets[];
};

export type SeasonDraft = {
  title: string;
  source: SeasonSource;
  rationale?: string | null;
  limits?: SeasonLimits;
  blocks: BlockDraft[];
};

/** A week with its block, flattened: what guardrails and charts work on. */
export type PlanWeek = WeekTargets & { block: string; focus: Focus };

export function flattenWeeks(blocks: BlockDraft[]): PlanWeek[] {
  return blocks.flatMap((b) => b.weeks.map((w) => ({ ...w, block: b.name, focus: b.focus })));
}

// ---------------------------------------------------------------- guardrails

/**
 * Ramp: a build week may exceed your highest of the last 3 build weeks by at
 * most 10% (the usual running-injury heuristic; Nielsen 2014 found > 30%
 * two-week jumps raise risk). Small absolute steps (≤ 3 km) always pass, so
 * low-volume weeks aren't flagged for +2 km.
 */
export const RAMP_MAX = 0.1;
export const RAMP_FREE_KM = 3;
/** Build weeks in a row before a lighter week is due (3:1 or 4:1 loading). */
export const MAX_WEEKS_WITHOUT_DELOAD = 4;
/**
 * Long run vs week. 30–35% is the everyday guideline (Stats page); for a
 * marathon at ~60 km/week a 30 km long run is ~50%, so the plan-level
 * check only warns above half the week.
 */
export const LONG_RUN_SHARE_MAX = 0.5;

export type Guardrail = {
  week_start: string | null;
  code: "ramp" | "deload" | "acwr" | "long_share" | "cap" | "race_week";
  message: string;
};

export type GuardrailContext = {
  limits?: SeasonLimits;
  /** Actual run km of the weeks before the season (oldest first): seeds the ACWR. */
  history?: { week_start: string; run_km: number }[];
  /** Races inside the season; their weeks skip ramp, share and cap checks. */
  raceDates?: string[];
  /** The goal race; the last week should contain it. */
  goalDate?: string | null;
};

const LIGHT_FOCUS: Focus[] = ["taper", "recovery", "transition"];
const isLight = (w: PlanWeek) => !!w.is_deload || LIGHT_FOCUS.includes(w.focus);
const km = (n: number) => `${Math.round(n * 10) / 10} km`;

export function guardrails(weeks: PlanWeek[], ctx: GuardrailContext = {}): Guardrail[] {
  const out: Guardrail[] = [];
  const limits = ctx.limits ?? {};
  const raceWeeks = new Set((ctx.raceDates ?? []).map(mondayOf));
  if (ctx.goalDate) raceWeeks.add(mondayOf(ctx.goalDate));

  const series = [
    ...(ctx.history ?? []).map((h) => ({ km: h.run_km, light: false, race: false })),
  ];
  let streak = 0;

  for (const w of weeks) {
    const race = raceWeeks.has(w.week_start);
    const runKm = w.run_km ?? null;

    if (runKm !== null && !isLight(w) && !race) {
      const recent = series.filter((s) => !s.light && !s.race).slice(-3).map((s) => s.km);
      const ref = recent.length ? Math.max(...recent) : null;
      if (ref && ref > 0 && runKm > ref * (1 + RAMP_MAX) && runKm - ref > RAMP_FREE_KM) {
        out.push({
          week_start: w.week_start,
          code: "ramp",
          message: `${km(runKm)} is +${Math.round((runKm / ref - 1) * 100)}% on your recent high of ${km(ref)} (guide ≤ ${RAMP_MAX * 100}%).`,
        });
      }

      const chronic = series.slice(-4).map((s) => s.km);
      if (chronic.length === 4) {
        const avg = chronic.reduce((a, b) => a + b, 0) / 4;
        const ratio = avg > 0 ? runKm / avg : null;
        if (ratio !== null && avg >= 10 && ratio > ACWR_SAFE.high) {
          out.push({
            week_start: w.week_start,
            code: "acwr",
            message: `Projected ACWR ${ratio.toFixed(2)} (this week vs the 4 before; safe ${ACWR_SAFE.low}–${ACWR_SAFE.high}).`,
          });
        }
      }
    }

    streak = isLight(w) ? 0 : streak + 1;
    if (streak === MAX_WEEKS_WITHOUT_DELOAD + 1) {
      out.push({
        week_start: w.week_start,
        code: "deload",
        message: `${streak} build weeks in a row without a lighter week (guide: every 3rd–4th week).`,
      });
    }

    if (!race) {
      if (runKm && w.long_run_km && w.long_run_km / runKm > LONG_RUN_SHARE_MAX) {
        out.push({
          week_start: w.week_start,
          code: "long_share",
          message: `Long run ${km(w.long_run_km)} is ${Math.round((w.long_run_km / runKm) * 100)}% of the week (plan guide ≤ ${LONG_RUN_SHARE_MAX * 100}%).`,
        });
      }
      const caps: [number | null | undefined, number | undefined, string][] = [
        [runKm, limits.max_week_km, "Weekly km"],
        [w.long_run_km, limits.max_long_run_km, "Long run"],
        [w.runs, limits.max_runs_per_week, "Runs"],
        [w.gym_sessions, limits.max_gym_per_week, "Gym sessions"],
      ];
      for (const [value, cap, label] of caps) {
        if (value != null && cap != null && value > cap) {
          out.push({ week_start: w.week_start, code: "cap", message: `${label} ${value} is above your cap of ${cap}.` });
        }
      }
    }

    series.push({ km: runKm ?? 0, light: isLight(w), race });
  }

  const last = weeks.at(-1);
  if (ctx.goalDate && last && mondayOf(ctx.goalDate) !== last.week_start) {
    out.push({
      week_start: last.week_start,
      code: "race_week",
      message: `The season ends the week of ${last.week_start}, but the goal date is ${ctx.goalDate}.`,
    });
  }
  return out;
}

// ---------------------------------------------------------------- validation

export type ValidationResult = { errors: string[]; warnings: Guardrail[] };

export type ValidationContext = GuardrailContext & {
  /** Weeks of the approved version: past weeks must stay as they were. */
  approved?: WeekTargets[];
  today?: string;
};

const RANGES: [keyof WeekTargets, number, number][] = [
  ["run_km", 0, 300],
  ["long_run_km", 0, 100],
  ["runs", 0, 14],
  ["quality_sessions", 0, 7],
  ["gym_sessions", 0, 14],
];

export function validateSeasonDraft(draft: SeasonDraft, ctx: ValidationContext = {}): ValidationResult {
  const errors: string[] = [];
  if (!draft.title?.trim()) errors.push("The season needs a title.");
  if (!(SEASON_SOURCES as readonly string[]).includes(draft.source)) errors.push(`Unknown source "${draft.source}".`);
  if (!draft.blocks?.length) errors.push("A season needs at least one block.");

  for (const b of draft.blocks ?? []) {
    const name = b.name?.trim() || "(unnamed)";
    if (!b.name?.trim() || b.name.length > 40) errors.push(`Block "${name}": name must be 1–40 characters.`);
    if (!(FOCUSES as readonly string[]).includes(b.focus)) errors.push(`Block "${name}": unknown focus "${b.focus}".`);
    if (b.gym_focus && !(GYM_FOCUSES as readonly string[]).includes(b.gym_focus)) {
      errors.push(`Block "${name}": unknown gym focus "${b.gym_focus}".`);
    }
    if (!b.weeks?.length || b.weeks.length > 8) errors.push(`Block "${name}": needs 1–8 weeks.`);
  }

  const weeks = flattenWeeks(draft.blocks ?? []);
  weeks.forEach((w, i) => {
    if (!isISODate(w.week_start) || mondayOf(w.week_start) !== w.week_start) {
      errors.push(`Week ${w.week_start}: must be a Monday (YYYY-MM-DD).`);
      return;
    }
    const prev = weeks[i - 1];
    if (prev && isISODate(prev.week_start) && daysBetween(prev.week_start, w.week_start) !== 7) {
      errors.push(`Week ${w.week_start}: weeks must follow each other with no gaps or overlaps.`);
    }
    for (const [key, min, max] of RANGES) {
      const v = w[key];
      if (v != null && (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)) {
        errors.push(`Week ${w.week_start}: ${key} must be ${min}–${max}.`);
      }
    }
    if (w.long_run_km != null && w.run_km != null && w.long_run_km > w.run_km) {
      errors.push(`Week ${w.week_start}: long run is longer than the whole week.`);
    }
  });

  if (ctx.approved && ctx.today) {
    const thisMonday = mondayOf(ctx.today);
    const before = new Map(ctx.approved.map((w) => [w.week_start, w]));
    for (const w of weeks) {
      const old = before.get(w.week_start);
      if (w.week_start < thisMonday && old && changedFields(old, w).length) {
        errors.push(`Week ${w.week_start} is in the past and can't change.`);
      }
    }
  }

  return { errors, warnings: errors.length ? [] : guardrails(weeks, { ...ctx, limits: draft.limits ?? ctx.limits }) };
}

// ---------------------------------------------------------------- diff

const DIFF_FIELDS = [
  "run_km",
  "long_run_km",
  "runs",
  "quality_sessions",
  "gym_sessions",
  "is_deload",
  "key_session",
  "milestone",
] as const satisfies readonly (keyof WeekTargets)[];

function norm(v: unknown) {
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

export function changedFields(a: WeekTargets, b: WeekTargets): (typeof DIFF_FIELDS)[number][] {
  return DIFF_FIELDS.filter((f) => {
    const x = f === "is_deload" ? !!a[f] : norm(a[f]);
    const y = f === "is_deload" ? !!b[f] : norm(b[f]);
    return x !== y;
  });
}

export type WeekDiff = {
  week_start: string;
  kind: "changed" | "added" | "removed";
  before: WeekTargets | null;
  after: WeekTargets | null;
  fields: string[];
};

/** Weeks that differ between the approved version and a proposal. */
export function diffWeeks(before: WeekTargets[], after: WeekTargets[]): WeekDiff[] {
  const a = new Map(before.map((w) => [w.week_start, w]));
  const b = new Map(after.map((w) => [w.week_start, w]));
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const out: WeekDiff[] = [];
  for (const k of keys) {
    const x = a.get(k) ?? null;
    const y = b.get(k) ?? null;
    if (x && y) {
      const fields = changedFields(x, y);
      if (fields.length) out.push({ week_start: k, kind: "changed", before: x, after: y, fields });
    } else {
      out.push({ week_start: k, kind: x ? "removed" : "added", before: x, after: y, fields: [] });
    }
  }
  return out;
}

// ---------------------------------------------------------------- summary

export type SeasonSummary = {
  start: string;
  end: string;
  weeks: number;
  blocks: number;
  peakKm: number | null;
  peakWeek: string | null;
  longestRun: number | null;
  deloads: number;
};

/** Headline numbers. The goal race week is left out of peak km and longest run. */
export function summarize(blocks: BlockDraft[], goalDate?: string | null): SeasonSummary | null {
  const weeks = flattenWeeks(blocks);
  if (!weeks.length) return null;
  const raceWeek = goalDate ? mondayOf(goalDate) : null;
  const training = weeks.filter((w) => w.week_start !== raceWeek);
  const peak = training.reduce<PlanWeek | null>(
    (best, w) => ((w.run_km ?? 0) > (best?.run_km ?? 0) ? w : best),
    null,
  );
  const longs = training.map((w) => w.long_run_km ?? 0);
  return {
    start: weeks[0].week_start,
    end: addDays(weeks.at(-1)!.week_start, 6),
    weeks: weeks.length,
    blocks: blocks.length,
    peakKm: peak?.run_km ?? null,
    peakWeek: peak?.week_start ?? null,
    longestRun: longs.length ? Math.max(...longs) || null : null,
    deloads: weeks.filter((w) => w.is_deload).length,
  };
}
