import { describe, expect, it } from "vitest";
import type { ActivityInput, HrAnchors } from "@/lib/metrics";
import { flattenWeeks, guardrails, type BlockDraft } from "@/lib/season/model";
import {
  calibrateLoad,
  DEFAULT_CALIBRATION,
  estimateWeekLoad,
  plannedLoad,
  type LoadCalibration,
} from "./load";

const anchors: HrAnchors = { rest: 46, max: 195, restSource: "default", maxSource: "default" };
const act = (p: Partial<ActivityInput> & { date: string; type: string }): ActivityInput => ({
  distance_km: null,
  duration_min: null,
  avg_hr: null,
  max_hr: null,
  rpe: null,
  ...p,
});

// Roughly Tommaso's week 1 (28 Sep): 6.4 min/km easy at RPE 4, gym 78′ at RPE 6.
const cal: LoadCalibration = {
  easy_min_per_km: 6.4,
  easy_rpe: 4,
  gym_min: 78,
  gym_rpe: 6,
  cross_min: 40,
  cross_rpe: 3,
  hiit_week: 60,
  weeks: 6,
};

describe("estimateWeekLoad", () => {
  it("adds run, quality bonus, gym, HIIT and bike/swim", () => {
    const e = estimateWeekLoad({ week_start: "2026-10-05", run_km: 31, quality_sessions: 1, gym_sessions: 3, cross_sessions: 1 }, cal);
    // run 31 × 6.4 × 4 = 793.6 + 25 × (7 − 4) = 75 → 869
    expect(e).toEqual({ run: 869, gym: 1404, hiit: 60, cross: 120, total: 2453 });
  });

  it("lightens gym and HIIT in a lighter week, drops HIIT without gym", () => {
    const light = estimateWeekLoad({ week_start: "2026-10-26", run_km: 25, gym_sessions: 2, is_deload: true }, cal);
    expect(light.gym).toBe(Math.round(2 * 78 * 6 * 0.6));
    expect(light.hiit).toBe(30);
    expect(estimateWeekLoad({ week_start: "2027-04-12", run_km: 20, gym_sessions: 0 }, cal).hiit).toBe(0);
  });

  it("treats empty targets as zero load", () => {
    expect(estimateWeekLoad({ week_start: "2026-10-05" }, cal).total).toBe(0);
  });
});

describe("plannedLoad", () => {
  it("uses the coach's target when set, the estimate otherwise", () => {
    const w = { week_start: "2026-10-05", run_km: 31, gym_sessions: 3 };
    expect(plannedLoad(w, cal)).toMatchObject({ source: "estimate", total: 794 + 1404 + 60 });
    expect(plannedLoad({ ...w, load_target: 2000 }, cal)).toMatchObject({ source: "target", total: 2000 });
  });
});

describe("calibrateLoad", () => {
  it("takes medians of the last complete weeks; current week ignored", () => {
    const acts: ActivityInput[] = [
      act({ date: "2026-09-22", type: "run", distance_km: 10, duration_min: 64, avg_hr: 145 }),
      act({ date: "2026-09-27", type: "run", distance_km: 12, duration_min: 78, avg_hr: 148, rpe: 4 }),
      act({ date: "2026-09-30", type: "run", distance_km: 8, duration_min: 50, avg_hr: 147, rpe: 3 }),
      act({ date: "2026-09-29", type: "gym", duration_min: 80, rpe: 6 }),
      act({ date: "2026-10-01", type: "gym", duration_min: 76, rpe: 7 }),
      act({ date: "2026-10-01", type: "cardio", duration_min: 12, rpe: 8 }),
      act({ date: "2026-10-06", type: "gym", duration_min: 200, rpe: 10 }), // this week: ignored
    ];
    const c = calibrateLoad(acts, anchors, "2026-10-07");
    expect(c.easy_min_per_km).toBeCloseTo(6.4, 1);
    expect(c.gym_min).toBe(78);
    expect(c.gym_rpe).toBe(6.5);
    expect(c.hiit_week).toBe(Math.round((12 * 8) / 6));
    expect(c.cross_min).toBe(DEFAULT_CALIBRATION.cross_min); // no bike/swim: default
    expect(c.weeks).toBe(2);
  });

  it("falls back to the defaults with no history", () => {
    expect(calibrateLoad([], anchors, "2026-10-07")).toEqual(DEFAULT_CALIBRATION);
  });
});

describe("load guardrails", () => {
  const blocks = (weeks: BlockDraft["weeks"]): BlockDraft[] => [{ name: "Base", focus: "base", weeks }];
  const history = [
    { week_start: "2026-09-07", total: 2000, run: 700 },
    { week_start: "2026-09-14", total: 2100, run: 750 },
    { week_start: "2026-09-21", total: 2200, run: 800 },
    { week_start: "2026-09-28", total: 2300, run: 850 },
  ];

  it("pass a steady week", () => {
    const w = flattenWeeks(blocks([{ week_start: "2026-10-05", run_km: 33, gym_sessions: 3 }]));
    expect(guardrails(w, { load: { calibration: cal, history } })).toEqual([]);
  });

  it("flag a run-load jump the km check misses (two quality sessions added)", () => {
    // km +9% on 33 (passes the km ramp), but quality adds run load
    const w = flattenWeeks(blocks([{ week_start: "2026-10-05", run_km: 36, quality_sessions: 3, gym_sessions: 3 }]));
    const codes = guardrails(w, { load: { calibration: cal, history }, history: history.map((h) => ({ week_start: h.week_start, run_km: 33 })) }).map((g) => g.code);
    expect(codes).toContain("load_ramp");
    expect(codes).not.toContain("ramp");
  });

  it("flag a total-load spike over 1.3× the average week", () => {
    const w = flattenWeeks(blocks([{ week_start: "2026-10-05", run_km: 33, gym_sessions: 3, load_target: 3200 }]));
    const g = guardrails(w, { load: { calibration: cal, history } });
    expect(g.map((x) => x.code)).toEqual(["load_acwr"]);
    expect(g[0].message).toContain("1.49");
  });

  it("skip load checks in lighter weeks and without a load context", () => {
    const w = flattenWeeks(blocks([{ week_start: "2026-10-05", run_km: 33, gym_sessions: 3, load_target: 9000, is_deload: true }]));
    expect(guardrails(w, { load: { calibration: cal, history } })).toEqual([]);
    expect(guardrails(flattenWeeks(blocks([{ week_start: "2026-10-05", load_target: 9000 }])))).toEqual([]);
  });
});
