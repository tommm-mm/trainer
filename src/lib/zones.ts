// Time in heart-rate zones. Pure: no DB, no clock.
//
// Each run / bike / swim keeps a heart-rate histogram (seconds at each bpm),
// built once from the intervals.icu HR stream. Zones are applied when the
// histogram is read, so when a test changes your zones (new threshold HR, new
// max) every past week re-bins into the new zones and stays comparable.
//
// Zones are the Efforts bands (% of heart-rate reserve, Karvonen). A measured
// threshold HR re-centres them: every band edge is scaled so the threshold
// edge (84% HRR) lands exactly on the measured threshold.

import type { HrAnchors } from "@/lib/metrics";

/** Lower edges (%HRR) of easy, marathon, threshold and VO₂: four cuts, five zones. */
export const ZONE_EDGES_HRR = [0.65, 0.75, 0.84, 0.9] as const;
/** The default threshold edge: a measured threshold HR maps onto this. */
export const THRESHOLD_HRR = 0.84;

export const ZONE_KEYS = ["recovery", "easy", "marathon", "threshold", "vo2"] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

export type ZoneAnchors = Pick<HrAnchors, "rest" | "max"> & { threshold?: number | null };

/**
 * Factor applied to every %HRR edge. 1 without a measured threshold; with
 * one, the factor that puts the 84% edge on it (e.g. threshold 175 on rest 46,
 * max 195 → 86.6% HRR → factor 1.03). Out-of-range thresholds are ignored.
 */
export function zoneScale(a: ZoneAnchors): number {
  const t = a.threshold;
  if (!t || t <= a.rest || t >= a.max) return 1;
  return (t - a.rest) / (a.max - a.rest) / THRESHOLD_HRR;
}

/** A %HRR edge after re-centring on the threshold (capped at max HR). */
export function scaledHrr(hrr: number, a: ZoneAnchors): number {
  return Math.min(1, hrr * zoneScale(a));
}

/** Whole-bpm lower bounds of easy, marathon, threshold, VO₂ (same rounding as the Efforts table). */
export function zoneCuts(a: ZoneAnchors): number[] {
  return ZONE_EDGES_HRR.map((e) => Math.round(a.rest + scaledHrr(e, a) * (a.max - a.rest)));
}

/** Zone index 0–4 of a heart rate. */
export function zoneOf(bpm: number, cuts: number[]): number {
  let z = 0;
  for (const c of cuts) if (bpm >= c) z++;
  return z;
}

// ---------------------------------------------------------------- histogram

/** Seconds per whole bpm, starting at `min` (counts[0] = seconds at `min` bpm). */
export type HrHistogram = { min: number; counts: number[] };

/** Gaps longer than this (pauses, lost signal) count as this many seconds. */
export const MAX_SAMPLE_GAP_S = 5;
const HR_RANGE = { low: 30, high: 250 };

/**
 * Builds a histogram from the HR stream. `time` is seconds from the start
 * (optional: samples are taken as 1 s apart without it). Each sample counts
 * until the next one, capped at MAX_SAMPLE_GAP_S; the last sample counts 1 s.
 * Null or implausible readings are skipped. Null when no usable sample.
 */
export function histogramFromStream(
  hr: (number | null | undefined)[],
  time?: (number | null | undefined)[] | null,
): HrHistogram | null {
  const secs = new Map<number, number>();
  for (let i = 0; i < hr.length; i++) {
    const v = hr[i];
    if (v == null || !Number.isFinite(v) || v < HR_RANGE.low || v > HR_RANGE.high) continue;
    let dt = 1;
    const t0 = time?.[i];
    const t1 = time?.[i + 1];
    if (time && t0 != null && t1 != null) dt = Math.min(MAX_SAMPLE_GAP_S, Math.max(0, t1 - t0));
    if (dt <= 0) continue;
    const bpm = Math.round(v);
    secs.set(bpm, (secs.get(bpm) ?? 0) + dt);
  }
  if (secs.size === 0) return null;
  const min = Math.min(...secs.keys());
  const max = Math.max(...secs.keys());
  const counts = Array.from({ length: max - min + 1 }, (_, i) => Math.round(secs.get(min + i) ?? 0));
  return { min, counts };
}

/** Seconds in each of the five zones. */
export function zoneSeconds(h: HrHistogram, cuts: number[]): number[] {
  const out = [0, 0, 0, 0, 0];
  h.counts.forEach((s, i) => {
    if (s > 0) out[zoneOf(h.min + i, cuts)] += s;
  });
  return out;
}

// ---------------------------------------------------------------- 80/20

/**
 * Three bands for the 80/20 check (Seiler's model): easy = below the first
 * threshold (recovery + easy, < 75% HRR); moderate = marathon pace (75–84%);
 * hard = threshold and above. Moderate counts on the hard side: anything
 * above the first threshold spends the "20".
 */
export type Bands = { easy: number; moderate: number; hard: number };

export function bands(zoneSecs: number[]): Bands {
  return {
    easy: zoneSecs[0] + zoneSecs[1],
    moderate: zoneSecs[2],
    hard: zoneSecs[3] + zoneSecs[4],
  };
}

/** Easy share at or above this = on the 80/20 line. */
export const EASY_SHARE_GOOD = 0.8;
/** Below this the week is clearly too intense (amber band in between). */
export const EASY_SHARE_WATCH = 0.7;
/** Blocks where race-pace work makes ~75/25 normal (amber is expected there). */
export const RACE_PACE_FOCUSES = ["specific", "peak"];

export type IntensityVerdict = { status: "good" | "watch" | "off"; message: string };

/** Under this much zoned time a week isn't judged (one short run says little). */
export const MIN_ZONED_MINUTES = 60;

/** `b` in minutes (as `weeklyZones` returns them). */
export function judgeIntensity(b: Bands, focus?: string | null): IntensityVerdict | null {
  const total = b.easy + b.moderate + b.hard;
  if (total < MIN_ZONED_MINUTES) return null;
  const share = b.easy / total;
  const pct = `${Math.round(share * 100)}% easy`;
  if (share >= EASY_SHARE_GOOD) return { status: "good", message: `${pct}: on the 80/20 line.` };
  if (share >= EASY_SHARE_WATCH) {
    return RACE_PACE_FOCUSES.includes(focus ?? "")
      ? { status: "watch", message: `${pct}: expected with race-pace work in this block.` }
      : { status: "watch", message: `${pct}: a bit intense; keep easy days truly easy.` };
  }
  return { status: "off", message: `${pct}: too much time above easy (guide ≥ 80%).` };
}

// ---------------------------------------------------------------- weekly

export type ZonedActivity = {
  date: string;
  type: string;
  hr_hist_min: number | null;
  hr_hist: number[] | null;
};

/** Activity types whose HR reflects effort (gym and HIIT HR understate it). */
export const ZONED_TYPES = ["run", "cross"];

export function toHistogram(a: Pick<ZonedActivity, "hr_hist_min" | "hr_hist">): HrHistogram | null {
  return a.hr_hist_min != null && a.hr_hist && a.hr_hist.length ? { min: a.hr_hist_min, counts: a.hr_hist } : null;
}

export type ZoneWeek = {
  week: string;
  /** Minutes in recovery, easy, marathon, threshold, VO₂. */
  zones: number[];
  bands: Bands;
  minutes: number;
  easyShare: number | null;
  /** Run / bike / swim sessions in the week that have no HR stream (yet). */
  missing: number;
};

/** Zone minutes per ISO week (runs + bike/swim) for the given Mondays. */
export function weeklyZones(
  activities: ZonedActivity[],
  anchors: ZoneAnchors,
  weeks: string[],
  mondayOf: (d: string) => string,
): ZoneWeek[] {
  const cuts = zoneCuts(anchors);
  const secs = new Map(weeks.map((w) => [w, { zones: [0, 0, 0, 0, 0], missing: 0 }]));
  for (const a of activities) {
    if (!ZONED_TYPES.includes(a.type)) continue;
    const row = secs.get(mondayOf(a.date));
    if (!row) continue;
    const h = toHistogram(a);
    if (!h) {
      row.missing++;
      continue;
    }
    zoneSeconds(h, cuts).forEach((s, i) => (row.zones[i] += s));
  }
  return weeks.map((week) => {
    const { zones, missing } = secs.get(week)!;
    const b = bands(zones);
    const total = b.easy + b.moderate + b.hard;
    const toMin = (s: number) => Math.round(s / 6) / 10;
    return {
      week,
      zones: zones.map(toMin),
      bands: { easy: toMin(b.easy), moderate: toMin(b.moderate), hard: toMin(b.hard) },
      minutes: toMin(total),
      easyShare: total > 0 ? b.easy / total : null,
      missing,
    };
  });
}
