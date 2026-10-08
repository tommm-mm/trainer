import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { parseWellness, recoveryStatus, type WellnessDay } from "./recovery";

const TODAY = "2026-10-08";
const day = (i: number, v: Partial<WellnessDay>): WellnessDay => ({
  date: addDays(TODAY, -i),
  resting_hr: null, hrv: null, sleep_s: null, sleep_score: null, vo2max: null, ctl: null, atl: null, readiness: null, steps: null,
  ...v,
});
/** 35 days: baseline HRV alternating 60/64 (mean 62, sd ≈ 2), RHR 47; the last 7 days as given. */
function history(recent: Partial<WellnessDay>) {
  return Array.from({ length: 35 }, (_, i) =>
    i < 7 ? day(i, { sleep_s: 7.5 * 3600, ...recent }) : day(i, { hrv: i % 2 ? 60 : 64, resting_hr: 47, sleep_s: 7.5 * 3600 }),
  );
}

describe("parseWellness", () => {
  it("reads intervals.icu rows and drops nonsense", () => {
    expect(
      parseWellness([
        { id: "2026-10-07", restingHR: 46, hrv: 61.5, sleepSecs: 27000, sleepScore: 82, vo2max: 53, ctl: 41.2, atl: 48.9, steps: 9000 },
        { id: "2026-10-06", restingHR: 0, hrv: null },
        { id: "bad", restingHR: 50 },
      ]),
    ).toEqual([
      { date: "2026-10-07", resting_hr: 46, hrv: 61.5, sleep_s: 27000, sleep_score: 82, vo2max: 53, ctl: 41.2, atl: 48.9, readiness: null, steps: 9000 },
    ]);
    expect(parseWellness(null)).toEqual([]);
  });
});

describe("recoveryStatus", () => {
  it("no signal when the week sits in your normal range", () => {
    const s = recoveryStatus(history({ hrv: 62, resting_hr: 47 }), TODAY);
    expect(s.signals).toEqual([]);
    expect(s.hrv).toEqual({ recent: 62, base: 62, sd: 2 });
    expect(s.rhr).toEqual({ recent: 47, base: 47 });
    expect(s.last?.date).toBe(TODAY);
  });

  it("flags HRV below mean − 0.5 SD and resting HR ≥ 5 bpm up", () => {
    const s = recoveryStatus(history({ hrv: 58, resting_hr: 52 }), TODAY);
    expect(s.signals.map((x) => x.code)).toEqual(["hrv_low", "rhr_high"]);
    // 61.2 is inside the range (floor ≈ 62 − 0.5 × 2 = 61.0): not flagged
    expect(recoveryStatus(history({ hrv: 61.2, resting_hr: 51 }), TODAY).signals).toEqual([]);
  });

  it("flags short sleep on 2 of the last 3 nights", () => {
    const h = history({ hrv: 62, resting_hr: 47 });
    h[0].sleep_s = 5.5 * 3600;
    h[2].sleep_s = 5.8 * 3600;
    expect(recoveryStatus(h, TODAY).signals.map((x) => x.code)).toEqual(["sleep_short"]);
  });

  it("stays quiet without enough data", () => {
    const s = recoveryStatus([day(0, { hrv: 30, resting_hr: 70, sleep_s: 3 * 3600 })], TODAY);
    expect(s.signals).toEqual([]);
    expect(s.hrv).toBeNull();
  });
});
