// Effort zones for the plan's session types. Heart rate is the guide now
// (Karvonen %HRR on your Garmin anchors); paces are the targets at goal
// fitness and get replaced by test results (5 km time trial, 30′ test).

import type { HrAnchors } from "@/lib/metrics";

export type Effort = {
  key: "recovery" | "easy" | "marathon" | "threshold" | "vo2";
  label: string;
  /** %HRR band, inclusive low, exclusive high. */
  hrr: [number, number];
  feel: string;
  use: string;
  /** Seconds per km relative to goal marathon pace: [slowest, fastest]. */
  paceFromMp: [number, number] | null;
};

// Bands: easy ≤ 75% HRR matches metrics.ts (isEasyRun). Marathon, threshold
// and VO₂ follow Karvonen ranges used by Daniels / Pfitzinger (MP ≈ 75–84%,
// LT ≈ 84–90%, VO₂max work ≥ 90%). Pace offsets from marathon pace follow
// Daniels' VDOT tables around a 3:30 marathon (VDOT ≈ 45).
export const EFFORTS: Effort[] = [
  { key: "recovery", label: "Recovery", hrr: [0, 0.65], feel: "Very easy, could chat forever", use: "Day after hard sessions, cool-downs", paceFromMp: [90, 75] },
  { key: "easy", label: "Easy / long", hrr: [0.65, 0.75], feel: "Conversational, nose-breathing possible", use: "~80% of weekly km, long runs", paceFromMp: [75, 40] },
  { key: "marathon", label: "Marathon pace", hrr: [0.75, 0.84], feel: "Steady, controlled, short sentences", use: "MP blocks in long runs, MP runs", paceFromMp: [5, -5] },
  { key: "threshold", label: "Threshold / tempo", hrr: [0.84, 0.9], feel: "Comfortably hard, ~1 h race effort", use: "Tempo 20–30′, cruise intervals", paceFromMp: [-18, -26] },
  { key: "vo2", label: "Intervals", hrr: [0.9, 0.97], feel: "Hard, 5–10 km race effort", use: "3–4′ repeats, a few in Build", paceFromMp: [-40, -50] },
];

export function hrAt(hrr: number, a: Pick<HrAnchors, "rest" | "max">): number {
  return Math.round(a.rest + hrr * (a.max - a.rest));
}

export type EffortRow = Effort & { hrLow: number; hrHigh: number; pace: [number, number] | null };

/** Zones with bpm from your anchors and pace (s/km) from the goal marathon pace. */
export function effortTable(
  anchors: Pick<HrAnchors, "rest" | "max">,
  marathonPaceSecPerKm: number | null,
): EffortRow[] {
  return EFFORTS.map((e) => ({
    ...e,
    hrLow: e.hrr[0] === 0 ? 0 : hrAt(e.hrr[0], anchors),
    hrHigh: hrAt(e.hrr[1], anchors) - 1,
    pace:
      marathonPaceSecPerKm && e.paceFromMp
        ? [marathonPaceSecPerKm + e.paceFromMp[0], marathonPaceSecPerKm + e.paceFromMp[1]]
        : null,
  }));
}
