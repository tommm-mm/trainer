// Readiness score 0–100 for the Today ring, from Garmin wellness. Pure: no DB,
// no clock. It informs, it never changes the plan (the PT and you decide).
//
// Four parts, each 0–100, weighted (weights of missing parts are spread over
// the others):
//   HRV        35%  last night vs your normal (mean ± SD of the 28 days before
//                   the last 7): 50 at your mean, ±25 per SD
//   Resting HR 20%  last night vs the same baseline: 50 at your mean, −10 per bpm above
//   Sleep      30%  Garmin sleep score (or hours: 8 h = 100)
//   Form       15%  fitness − fatigue (CTL − ATL): 0 → 95, −10 → 70, −30 → 20
// Bands: 80+ ready · 60–79 good · 40–59 easy · under 40 rest.
// No score when Garmin has nothing from last night or the night before.

import { addDays } from "@/lib/dates";
import { BASELINE_DAYS, RECENT_DAYS, type WellnessDay } from "./recovery";

export type ReadinessBand = "ready" | "good" | "easy" | "rest";
export type ReadinessPart = { key: "hrv" | "rhr" | "sleep" | "form"; label: string; score: number; value: string; vs: string | null };
export type Readiness = { score: number; band: ReadinessBand; date: string; parts: ReadinessPart[] };

export const WEIGHTS = { hrv: 0.35, rhr: 0.2, sleep: 0.3, form: 0.15 } as const;
const MIN_BASELINE = 14;

const clamp = (x: number) => Math.max(0, Math.min(100, x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

export function band(score: number): ReadinessBand {
  return score >= 80 ? "ready" : score >= 60 ? "good" : score >= 40 ? "easy" : "rest";
}

/** Form (CTL − ATL) → 0–100: one line through 0 → 95, −10 → 70, −30 → 20. */
export function formScore(form: number): number {
  return clamp(95 + form * 2.5);
}

/** The score on `today` (data up to and including today), or null without a recent night. */
export function readinessScore(days: WellnessDay[], today: string): Readiness | null {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const last = byDate.get(today) ?? byDate.get(addDays(today, -1));
  if (!last) return null;
  const base: WellnessDay[] = [];
  for (let i = RECENT_DAYS; i < RECENT_DAYS + BASELINE_DAYS; i++) {
    const d = byDate.get(addDays(last.date, -i));
    if (d) base.push(d);
  }
  const vals = (k: "hrv" | "resting_hr") => base.map((d) => d[k]).filter((v): v is number => v !== null);
  const parts: ReadinessPart[] = [];

  const hb = vals("hrv");
  if (last.hrv !== null && hb.length >= MIN_BASELINE) {
    const m = mean(hb), s = sd(hb) || 1;
    parts.push({ key: "hrv", label: "HRV", score: clamp(50 + ((last.hrv - m) / s) * 25), value: `${Math.round(last.hrv)}`, vs: `/ ${Math.round(m)} normal` });
  }
  const rb = vals("resting_hr");
  if (last.resting_hr !== null && rb.length >= MIN_BASELINE) {
    const m = mean(rb);
    parts.push({ key: "rhr", label: "Resting HR", score: clamp(50 - (last.resting_hr - m) * 10), value: `${last.resting_hr}`, vs: `/ ${Math.round(m)}` });
  }
  if (last.sleep_score !== null || last.sleep_s !== null) {
    const h = last.sleep_s !== null ? `${Math.floor(last.sleep_s / 3600)}h ${String(Math.round((last.sleep_s % 3600) / 60)).padStart(2, "0")}` : "–";
    const score = last.sleep_score ?? clamp(((last.sleep_s ?? 0) / 3600 / 8) * 100);
    parts.push({ key: "sleep", label: "Sleep", score, value: h, vs: last.sleep_score !== null ? `score ${last.sleep_score}` : null });
  }
  if (last.ctl !== null && last.atl !== null) {
    const f = last.ctl - last.atl;
    parts.push({
      key: "form",
      label: "Form",
      score: formScore(f),
      value: `${f < 0 ? "−" : ""}${Math.abs(Math.round(f))}`,
      vs: `fit ${Math.round(last.ctl)} · fatigue ${Math.round(last.atl)}`,
    });
  }
  if (parts.length === 0) return null;
  const w = parts.reduce((a, p) => a + WEIGHTS[p.key], 0);
  const score = Math.round(parts.reduce((a, p) => a + p.score * WEIGHTS[p.key], 0) / w);
  return { score, band: band(score), date: last.date, parts: parts.map((p) => ({ ...p, score: Math.round(p.score) })) };
}
