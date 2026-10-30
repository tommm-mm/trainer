// Recovery from Garmin wellness (via intervals.icu). Pure: no DB, no clock.
//
// Signals (they warn, they never change the plan; the coach judges):
//   hrv_low    7-day mean HRV below your normal range: the mean of the 28
//              days before those 7 minus 0.5 SD (the "smallest worthwhile
//              change" used in HRV-guided training: Plews 2012, Kiviniemi 2007)
//   rhr_high   7-day mean resting HR ≥ 5 bpm above the same baseline
//   sleep_short under 6 h on 2 of the last 3 nights
// Each needs enough data: ≥ 4 of the 7 days and ≥ 14 of the 28 baseline days
// (sleep: 3 nights recorded).

import { addDays } from "@/lib/dates";

export type WellnessDay = {
  date: string;
  resting_hr: number | null;
  hrv: number | null;
  sleep_s: number | null;
  sleep_score: number | null;
  vo2max: number | null;
  ctl: number | null;
  atl: number | null;
  readiness: number | null;
  steps: number | null;
};

export const RECENT_DAYS = 7;
export const BASELINE_DAYS = 28;
export const HRV_SWC_SD = 0.5;
export const RHR_HIGH_BPM = 5;
export const SHORT_SLEEP_H = 6;
const MIN_RECENT = 4;
const MIN_BASELINE = 14;

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

/** intervals.icu `/athlete/{id}/wellness` rows → wellness days (bad values dropped). */
export function parseWellness(raw: unknown): WellnessDay[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof r.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.id))
    .map((r) => ({
      date: r.id as string,
      resting_hr: num(r.restingHR, 25, 120),
      hrv: num(r.hrv, 5, 300),
      sleep_s: num(r.sleepSecs, 0, 24 * 3600),
      sleep_score: num(r.sleepScore, 0, 100),
      vo2max: num(r.vo2max, 20, 95),
      ctl: num(r.ctl, 0, 300),
      atl: num(r.atl, 0, 400),
      readiness: num(r.readiness, 0, 100),
      steps: num(r.steps, 0, 200000),
    }))
    .filter((d) => Object.entries(d).some(([k, v]) => k !== "date" && v !== null));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const r1 = (n: number) => Math.round(n * 10) / 10;

export type Signal = { code: "hrv_low" | "rhr_high" | "sleep_short"; message: string };

export type RecoveryStatus = {
  /** The latest day with any wellness data. */
  last: WellnessDay | null;
  hrv: { recent: number; base: number; sd: number } | null;
  rhr: { recent: number; base: number } | null;
  /** Hours of the last 3 nights recorded (newest last). */
  sleep: number[];
  signals: Signal[];
};

/** Recovery status on `today` (data up to and including today). */
export function recoveryStatus(days: WellnessDay[], today: string): RecoveryStatus {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const range = (from: number, to: number) => {
    const out: WellnessDay[] = [];
    for (let i = from; i <= to; i++) {
      const d = byDate.get(addDays(today, -i));
      if (d) out.push(d);
    }
    return out;
  };
  const recent = range(0, RECENT_DAYS - 1);
  const baseline = range(RECENT_DAYS, RECENT_DAYS + BASELINE_DAYS - 1);
  const vals = (ds: WellnessDay[], k: "hrv" | "resting_hr") => ds.map((d) => d[k]).filter((v): v is number => v !== null);
  const signals: Signal[] = [];

  let hrv: RecoveryStatus["hrv"] = null;
  const [hr7, hrB] = [vals(recent, "hrv"), vals(baseline, "hrv")];
  if (hr7.length >= MIN_RECENT && hrB.length >= MIN_BASELINE) {
    hrv = { recent: r1(mean(hr7)), base: r1(mean(hrB)), sd: r1(sd(hrB)) };
    const floor = mean(hrB) - HRV_SWC_SD * sd(hrB);
    if (mean(hr7) < floor) {
      signals.push({
        code: "hrv_low",
        message: `HRV 7-day ${hrv.recent} ms is below your normal (${hrv.base} ± ${hrv.sd} ms, floor ${r1(floor)}): recovery is lagging.`,
      });
    }
  }

  let rhr: RecoveryStatus["rhr"] = null;
  const [rh7, rhB] = [vals(recent, "resting_hr"), vals(baseline, "resting_hr")];
  if (rh7.length >= MIN_RECENT && rhB.length >= MIN_BASELINE) {
    rhr = { recent: r1(mean(rh7)), base: r1(mean(rhB)) };
    if (mean(rh7) - mean(rhB) >= RHR_HIGH_BPM) {
      signals.push({
        code: "rhr_high",
        message: `Resting HR 7-day ${rhr.recent} bpm is ${r1(rhr.recent - rhr.base)} above your normal ${rhr.base}: fatigue, illness or stress.`,
      });
    }
  }

  const nights = [2, 1, 0]
    .map((i) => byDate.get(addDays(today, -i))?.sleep_s)
    .filter((s): s is number => s != null)
    .map((s) => r1(s / 3600));
  if (nights.length === 3 && nights.filter((h) => h < SHORT_SLEEP_H).length >= 2) {
    signals.push({ code: "sleep_short", message: `Under ${SHORT_SLEEP_H} h of sleep on 2 of the last 3 nights (${nights.join(" · ")} h).` });
  }

  const last = [...days].sort((a, b) => b.date.localeCompare(a.date)).find((d) => d.date <= today) ?? null;
  return { last, hrv, rhr, sleep: nights, signals };
}
