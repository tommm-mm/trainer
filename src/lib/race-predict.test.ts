import { describe, expect, it } from "vitest";
import {
  findAnchor, fitnessIn, hrRunVdot, isPlannedTest, isRaceLike, marathonShape, MARATHON_M, predictMarathon, raceTime,
  vdotFromRace, type RunInput,
} from "./race-predict";
import { bands, mpHrSlope, mpWeeks, segmentsOf } from "./race-pace";
import { formatDuration } from "./format";

const A = { rest: 48, max: 195 };

describe("Daniels–Gilbert", () => {
  it("matches the published VDOT tables within ~15 s", () => {
    // Daniels' Running Formula: VDOT 45 → marathon 3:28:26, VDOT 50 → 3:10:49
    expect(Math.abs(raceTime(45, MARATHON_M) - (3 * 3600 + 28 * 60 + 26))).toBeLessThan(15);
    expect(Math.abs(raceTime(50, MARATHON_M) - (3 * 3600 + 10 * 60 + 49))).toBeLessThan(15);
  });
  it("round-trips a race: 1:39 half → VDOT ≈ 45.7 → marathon ≈ 3:25:46", () => {
    const v = vdotFromRace(21097.5, 99 * 60);
    expect(v).toBeCloseTo(45.65, 1);
    expect(raceTime(v, 21097.5)).toBeCloseTo(99 * 60, -1);
    expect(formatDuration(raceTime(v, MARATHON_M))).toBe("3:25:46");
  });
});

const easy = (date: string, km = 8, pace = 390, hr = 148): RunInput =>
  ({ date, name: "Rotterdam Running", distance_km: km, duration_min: (km * pace) / 60, avg_hr: hr });

/** Every other day from `from` for `n` runs. */
function block(from: string, n: number, f: (d: string, i: number) => RunInput): RunInput[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 2 * i);
    return f(d.toISOString().slice(0, 10), i);
  });
}

const HALF: RunInput = { date: "2026-03-15", name: "Mezza maratona di Bologna", distance_km: 21.1, duration_min: 99, avg_hr: 176 };

describe("runs", () => {
  it("HR-based VDOT reads low on easy runs and needs plausible inputs", () => {
    const v = hrRunVdot(easy("2026-10-01"), A)!;
    expect(v).toBeGreaterThan(33);
    expect(v).toBeLessThan(40); // vs a race VDOT ≈ 45: hence the calibration
    expect(hrRunVdot({ ...easy("2026-10-01"), avg_hr: null }, A)).toBeNull();
    expect(hrRunVdot({ ...easy("2026-10-01"), distance_km: 2 }, A)).toBeNull();
    expect(hrRunVdot({ ...easy("2026-10-01"), avg_hr: 60 }, A)).toBeNull(); // HRR < 50 %
  });

  it("finds races by plan, name or race-level HR; the most recent one anchors", () => {
    // 10 km in 48:20 at 89 % HRR: a race by HR (needs ≥ 87 % for 48′), slower than the half but newer
    const runs = [easy("2026-03-10"), HALF, { ...easy("2026-05-01", 10, 290, 179), name: null }];
    expect(findAnchor(runs, A, "2025-10-16", "2026-10-16")!.date).toBe("2026-05-01");
    const a = findAnchor(runs.slice(0, 2), A, "2025-10-16", "2026-10-16")!;
    expect(a.date).toBe("2026-03-15");
    expect(formatDuration(a.marathon)).toBe("3:25:45"); // 21.1 km in 1:39
    expect(findAnchor([easy("2026-03-10")], A, "2025-10-16", "2026-10-16")).toBeNull();
    // His real 16 Oct run: 5.02 km in 23:42 at HR 176 (87 % HRR): hard, but not a 5 km race (needs ≥ 90 %)
    const tempo = { date: "2026-10-16", name: "Rotterdam Running", distance_km: 5.02, duration_min: 23.7, avg_hr: 176 };
    expect(isRaceLike(tempo, A)).toBe(false);
    expect(isRaceLike({ ...tempo, avg_hr: 182 }, A)).toBe(true);
    expect(findAnchor([tempo], A, "2025-10-16", "2026-10-16")).toBeNull();
    expect(findAnchor([{ ...easy("2026-05-01", 10, 290, 179), name: null }], A, "2025-10-16", "2026-10-16")?.km).toBe(10);
    // …but the plan said "5 km time trial": it counts (his max HR 192: 88 % HRR)
    const A192 = { rest: 48, max: 192 };
    expect(isRaceLike({ ...tempo, planned_test: true }, A192)).toBe(true);
    // a planned "test" run easy (HR 147, 69 %) doesn't
    expect(isRaceLike({ ...easy("2026-10-16", 6, 390, 147), planned_test: true }, A192)).toBe(false);
    // Outside the 12 months: ignored
    expect(findAnchor([HALF], A, "2026-04-01", "2026-10-16")).toBeNull();
  });

  it("fitness = median of easy runs only (hard sessions don't move it); null under 3 runs", () => {
    const runs = block("2026-09-01", 9, (d, i) => easy(d, 8, 390 - i * 3));
    const f = fitnessIn(runs, A, "2026-09-01", "2026-10-16")!;
    expect(f.runs).toBe(9);
    expect(f.vdot).toBeCloseTo(hrRunVdot(runs[4], A)!, 5);
    // Adding hard sessions (HR 176) leaves it unchanged: it tracks fitness, not the training mix
    const hard = block("2026-09-02", 4, (d) => easy(d, 6, 285, 176));
    expect(fitnessIn([...runs, ...hard], A, "2026-09-01", "2026-10-16")!.vdot).toBe(f.vdot);
    expect(fitnessIn(runs.slice(0, 2), A, "2026-09-01", "2026-10-16")).toBeNull();
  });

  it("shape: ⅔ weekly km + ⅓ longest run vs 60 km / 30 km", () => {
    const runs = block("2026-09-05", 21, (d) => easy(d, 10)); // 6 weeks, 10 km every other day = 35 km/week
    const s = marathonShape(runs, "2026-10-16");
    expect(s.weeklyKm).toBeCloseTo(35, 0);
    expect(s.longRunKm).toBe(10);
    expect(s.pct).toBeCloseTo((2 / 3) * (35 / 60) + (1 / 3) * (10 / 30), 1);
  });
});

describe("isPlannedTest", () => {
  it("races, time trials and tests from the plan; not threshold tests", () => {
    expect(isPlannedTest({ session_type: "tempo", notes: "5 km time trial, in the morning." })).toBe(true);
    expect(isPlannedTest({ session_type: "race", notes: null })).toBe(true);
    expect(isPlannedTest({ session_type: "long_run", notes: "Gara: Bologna 30 km" })).toBe(true);
    expect(isPlannedTest({ session_type: "tempo", notes: "30′ threshold test: avg HR of the last 20′" })).toBe(false);
    expect(isPlannedTest({ session_type: "easy_run", notes: "Easy, HR 143–157" })).toBe(false);
    expect(isPlannedTest({ session_type: "easy_run", notes: "Attesta: latest" })).toBe(false); // whole words only
  });
});

describe("predictMarathon", () => {
  const before = block("2026-02-01", 21, (d) => easy(d)); // 6 weeks before the half
  it("calibrates on the half: same training now → the half's marathon equivalent × shape", () => {
    const now = block("2026-09-05", 21, (d) => easy(d)); // same training today
    const p = predictMarathon([...before, HALF, ...now], A, "2026-10-16");
    expect(p.anchor?.date).toBe("2026-03-15");
    expect(p.fitness?.factor).toBeGreaterThan(1.1);
    expect(p.fitness!.vdot).toBeCloseTo(p.anchor!.vdot, 0);
    expect(p.potential).toBeCloseTo(p.anchor!.marathon, -2);
    // ~32 km/week, 8 km long run → shape ~44 % → ≈ 5.6 % lower VDOT → slower than potential
    expect(p.seconds!).toBeGreaterThan(p.potential! + 10 * 60);
    // ± 3 % (identical easy runs: no extra noise)
    expect(p.high! - p.seconds!).toBeCloseTo(p.seconds! * 0.03, -1);
    expect(p.seconds! - p.low!).toBeCloseTo(p.seconds! * 0.03, -1);
  });

  it("fitter now (same HR, faster) → faster prediction; trend vs 4 weeks ago", () => {
    const slow = block("2026-08-20", 14, (d) => easy(d));
    const fast = block("2026-09-18", 14, (d) => easy(d, 8, 370));
    const p = predictMarathon([...before, HALF, ...slow, ...fast], A, "2026-10-16");
    expect(p.potential!).toBeLessThan(p.anchor!.marathon);
    expect(p.trend!).toBeLessThan(0);
  });

  it("his case: March half (45.7) + 16 Oct 5 km TT (40.9) → the TT anchors, the half is context", () => {
    const A192 = { rest: 48, max: 192 };
    const now = block("2026-09-05", 21, (d) => easy(d));
    const tt: RunInput = { date: "2026-10-16", name: "Rotterdam Running", distance_km: 5, duration_min: 1419 / 60, avg_hr: 175, planned_test: true };
    const p = predictMarathon([...before, HALF, ...now, tt], A192, "2026-10-16");
    expect(p.anchor?.date).toBe("2026-10-16");
    expect(p.anchor!.vdot).toBeCloseTo(40.9, 1); // 5.00 km in 23:39
    expect(p.best?.date).toBe("2026-03-15");
    // calibrated on the TT: fitness = the TT's VDOT, potential = its marathon equivalent
    expect(p.potential!).toBeCloseTo(p.anchor!.marathon, -1);
    expect(formatDuration(p.anchor!.marathon)).toBe("3:45:25");
    expect(p.seconds!).toBeGreaterThan(p.potential!);
  });

  it("no anchor → no calibrated fitness, no prediction", () => {
    const p = predictMarathon(block("2026-09-05", 21, (d) => easy(d)), A, "2026-10-16");
    expect(p.anchor).toBeNull();
    expect(p.fitness).toBeNull();
    expect(p.seconds).toBeNull();
  });
});

describe("race pace", () => {
  const MP = 299; // 3:30 marathon
  it("bands: MP ± 10 s, threshold 18–26 s faster", () => {
    expect(bands(MP)).toEqual({ mp: [289, 309], threshold: [273, 281] });
  });

  it("segments from laps (≥ 0.8 km), else merged full-km splits", () => {
    const segs = segmentsOf(
      [
        { date: "2026-09-30", run_detail: { laps: [
          { n: 1, km: 2, s: 780, hr: 145, max_hr: null, label: null, work: null },
          { n: 2, km: 3.92, s: 1200, hr: 172, max_hr: null, label: null, work: null }, // 5:06 → MP
          { n: 3, km: 0.5, s: 140, hr: 175, max_hr: null, label: null, work: null }, // too short
        ] } },
        { date: "2026-10-05", run_detail: { laps: null, splits: [
          { km: 1, s: 380, hr: 140 }, { km: 2, s: 298, hr: 165 }, { km: 3, s: 300, hr: 167 },
          { km: 4, s: 277, hr: 172 }, { km: 5, s: 290, hr: 160 }, // last (partial) skipped
        ] } },
      ],
      MP,
      A,
    );
    expect(segs).toEqual([
      { date: "2026-09-30", band: "mp", km: 3.92, pace: 306, hr: 172, hrr: 0.844 },
      { date: "2026-10-05", band: "mp", km: 2, pace: 299, hr: 166, hrr: 0.803 },
      { date: "2026-10-05", band: "threshold", km: 1, pace: 277, hr: 172, hrr: 0.844 },
    ]);
  });

  it("HR at MP per week and its slope (negative = fitter)", () => {
    const seg = (date: string, hr: number) => ({ date, band: "mp" as const, km: 5, pace: 299, hr, hrr: null });
    const weeks = mpWeeks([seg("2026-09-14", 172), seg("2026-09-22", 170), seg("2026-09-23", 168), seg("2026-09-29", 167)]);
    expect(weeks.map((w) => w.hr)).toEqual([172, 169, 167]);
    expect(mpHrSlope(weeks)).toBe(-2.5);
    expect(mpHrSlope(weeks.slice(0, 2))).toBeNull();
  });
});
