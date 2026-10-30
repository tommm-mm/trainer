import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import type { WellnessDay } from "./recovery";
import { band, formScore, readinessScore } from "./readiness";

const TODAY = "2026-10-30";
const day = (i: number, v: Partial<WellnessDay>): WellnessDay => ({
  date: addDays(TODAY, -i),
  resting_hr: null, hrv: null, sleep_s: null, sleep_score: null, vo2max: null, ctl: null, atl: null, readiness: null, steps: null,
  ...v,
});
/** 35 days; baseline HRV 60/64 (mean 62, sd ≈ 2), RHR 48; last night as given. */
const history = (last: Partial<WellnessDay>) =>
  Array.from({ length: 35 }, (_, i) => (i === 0 ? day(0, last) : day(i, { hrv: i % 2 ? 60 : 64, resting_hr: 48, sleep_score: 85 })));

describe("readinessScore", () => {
  it("normal night, good sleep, mildly negative form → good", () => {
    const r = readinessScore(history({ hrv: 62, resting_hr: 48, sleep_score: 90, sleep_s: 8 * 3600, ctl: 24, atl: 34 }), TODAY)!;
    // HRV 50 · RHR 50 · sleep 90 · form 70 → (17.5 + 10 + 27 + 10.5) = 65
    expect(r.score).toBe(65);
    expect(r.band).toBe("good");
    expect(r.parts.map((p) => p.key)).toEqual(["hrv", "rhr", "sleep", "form"]);
  });

  it("HRV well above normal + great sleep → ready; crashed HRV + bad sleep → rest", () => {
    expect(readinessScore(history({ hrv: 68, resting_hr: 46, sleep_score: 97, ctl: 25, atl: 25 }), TODAY)!.band).toBe("ready");
    expect(readinessScore(history({ hrv: 52, resting_hr: 55, sleep_score: 40, ctl: 20, atl: 45 }), TODAY)!.band).toBe("rest");
  });

  it("missing parts: weights spread over the rest; no recent night → null", () => {
    const r = readinessScore(history({ sleep_score: 80 }), TODAY)!;
    expect(r.score).toBe(80);
    expect(r.parts).toHaveLength(1);
    expect(readinessScore(history({}).filter((d) => d.date < addDays(TODAY, -1)), TODAY)).toBeNull();
  });

  it("bands and the form line", () => {
    expect([band(80), band(79), band(60), band(59), band(40), band(39)]).toEqual(["ready", "good", "good", "easy", "easy", "rest"]);
    expect([formScore(0), formScore(-10), formScore(-30), formScore(10)]).toEqual([95, 70, 20, 100]);
  });
});
