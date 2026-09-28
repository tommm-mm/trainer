import { describe, expect, it } from "vitest";
import {
  acwrSeries,
  dailyLoads,
  DEFAULT_REST_HR,
  efficiencyFactor,
  estimatedLoadShare,
  hrReserve,
  isEasyRun,
  MAX_HR_FLOOR,
  median,
  monotony,
  paceAtHr,
  referenceHr,
  resolveHrAnchors,
  rpeFromHr,
  sessionLoads,
  trainingSummary,
  weekStarts,
  weeklyAerobic,
  weeklyMonotony,
  weeklyRunning,
  type ActivityInput,
  type DailyLoad,
  type HrAnchors,
} from "./metrics";

const anchors: HrAnchors = { rest: 50, max: 200, restSource: "default", maxSource: "default" };

function act(p: Partial<ActivityInput> & { date: string }): ActivityInput {
  return {
    type: "run",
    distance_km: null,
    duration_min: null,
    avg_hr: null,
    max_hr: null,
    rpe: null,
    ...p,
  };
}

function flatDays(from: string, totals: number[]): DailyLoad[] {
  return dailyLoads(
    totals.map((t, i) => ({
      date: new Date(Date.parse(from) + i * 86_400_000).toISOString().slice(0, 10),
      type: "run",
      minutes: t,
      rpe: 1,
      rpeSource: "entered" as const,
      load: t,
    })),
    from,
    new Date(Date.parse(from) + (totals.length - 1) * 86_400_000).toISOString().slice(0, 10),
  );
}

describe("HR anchors", () => {
  it("falls back to the user-reported defaults", () => {
    const a = resolveHrAnchors({ activities: [] });
    expect(a).toEqual({
      rest: DEFAULT_REST_HR,
      max: MAX_HR_FLOOR,
      restSource: "default",
      maxSource: "default",
    });
  });

  it("uses Garmin values and lets a higher observed peak win", () => {
    expect(resolveHrAnchors({ garminRest: 44, garminMax: 198, activities: [{ max_hr: 180 }] }))
      .toMatchObject({ rest: 44, restSource: "garmin", max: 198, maxSource: "garmin" });
    expect(resolveHrAnchors({ garminMax: 198, activities: [{ max_hr: 203 }] }))
      .toMatchObject({ max: 203, maxSource: "observed" });
  });

  it("never lets max drop below the floor and ignores absurd resting HR", () => {
    expect(resolveHrAnchors({ garminMax: 170, garminRest: 5, activities: [] }))
      .toMatchObject({ max: MAX_HR_FLOOR, rest: DEFAULT_REST_HR });
  });
});

describe("HR → RPE", () => {
  it("computes heart-rate reserve and clamps it", () => {
    expect(hrReserve(125, anchors)).toBeCloseTo(0.5); // (125-50)/150
    expect(hrReserve(40, anchors)).toBe(0);
    expect(hrReserve(220, anchors)).toBe(1);
  });

  it("maps HRR to RPE ≈ 15×HRR − 6, clamped to 1–10", () => {
    expect(rpeFromHr(140, anchors)).toBe(3); // HRR 0.6 → 3
    expect(rpeFromHr(170, anchors)).toBe(6); // HRR 0.8 → 6
    expect(rpeFromHr(185, anchors)).toBe(8); // HRR 0.9 → 7.5 → 8
    expect(rpeFromHr(60, anchors)).toBe(1);
    expect(rpeFromHr(200, anchors)).toBe(9);
  });
});

describe("session load (sRPE) with tiered RPE fallback", () => {
  const acts = [
    act({ date: "2026-09-01", duration_min: 60, rpe: 3 }), // entered
    act({ date: "2026-09-02", duration_min: 40, avg_hr: 170 }), // run + HR → 6
    act({ date: "2026-09-03", type: "gym", duration_min: 50, rpe: 8 }), // entered
    act({ date: "2026-09-04", type: "gym", duration_min: 50, rpe: 7 }), // entered
    act({ date: "2026-09-05", type: "gym", duration_min: 40, avg_hr: 100 }), // gym → median 7.5
    act({ date: "2026-09-06", duration_min: 30 }), // run, no HR → run median of 3 and 5 = 4
    act({ date: "2026-09-07", type: "bike", duration_min: 30 }), // unknown → default 5
    act({ date: "2026-09-08", duration_min: null, rpe: 5 }), // no load, but its RPE counts in the median
  ];
  const loads = sessionLoads(acts, anchors);

  it("uses the right RPE source for each case", () => {
    expect(loads.map((l) => [l.rpeSource, l.rpe, l.load])).toEqual([
      ["entered", 3, 180],
      ["hr", 6, 240],
      ["entered", 8, 400],
      ["entered", 7, 350],
      ["median", 7.5, 300],
      ["median", 4, 120],
      ["default", 5, 150],
    ]);
  });

  it("reports the share of load that was estimated", () => {
    // estimated = 240 + 300 + 120 + 150 = 810 of 1740
    expect(estimatedLoadShare(loads)).toBeCloseTo(810 / 1740);
    expect(estimatedLoadShare([])).toBeNull();
  });

  it("computes medians", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([7, 8])).toBe(7.5);
  });
});

describe("daily load", () => {
  it("fills rest days with 0 and splits run/gym", () => {
    const d = dailyLoads(
      [
        { date: "2026-09-02", type: "run", minutes: 1, rpe: 1, rpeSource: "entered", load: 100 },
        { date: "2026-09-02", type: "gym", minutes: 1, rpe: 1, rpeSource: "entered", load: 50 },
        { date: "2026-09-09", type: "run", minutes: 1, rpe: 1, rpeSource: "entered", load: 999 }, // out of range
      ],
      "2026-09-01",
      "2026-09-03",
    );
    expect(d).toEqual([
      { date: "2026-09-01", run: 0, gym: 0, total: 0 },
      { date: "2026-09-02", run: 100, gym: 50, total: 150 },
      { date: "2026-09-03", run: 0, gym: 0, total: 0 },
    ]);
  });
});

describe("ACWR", () => {
  it("is 1.0 for perfectly steady training", () => {
    const daily = flatDays("2026-08-01", Array(35).fill(100));
    const s = acwrSeries(daily, "2026-08-01");
    expect(s[26].ratio).toBeNull(); // only 27 days of history
    expect(s[27].ratio).toBeCloseTo(1); // 700 / (2800/4)
    expect(s.at(-1)!.ratio).toBeCloseTo(1);
  });

  it("detects a spike: 3 easy weeks then a doubled week", () => {
    const daily = flatDays("2026-08-01", [...Array(21).fill(100), ...Array(7).fill(200)]);
    const last = acwrSeries(daily, "2026-08-01").at(-1)!;
    // acute 1400; chronic (2100 + 1400) / 4 = 875 → 1.6
    expect(last.acute).toBe(1400);
    expect(last.chronic).toBe(875);
    expect(last.ratio).toBeCloseTo(1.6);
  });

  it("stays null without 28 days since the first activity, or with zero chronic load", () => {
    const daily = flatDays("2026-08-01", Array(40).fill(0));
    expect(acwrSeries(daily, null).every((p) => p.ratio === null)).toBe(true);
    expect(acwrSeries(daily, "2026-08-01").every((p) => p.ratio === null)).toBe(true);
    const withLateStart = acwrSeries(flatDays("2026-08-01", Array(40).fill(50)), "2026-08-10");
    expect(withLateStart[35].ratio).toBeNull(); // 26 days after historyStart
    expect(withLateStart[36].ratio).toBeCloseTo(1); // 27 days after → 28-day window
  });
});

describe("monotony & strain (Foster)", () => {
  it("computes mean / population SD and strain", () => {
    // loads 0,100,0,100,0,100,0 → mean 300/7, SD = sqrt(mean·(100-mean))
    const m = monotony([0, 100, 0, 100, 0, 100, 0]);
    const mean = 300 / 7;
    const sd = Math.sqrt(mean * (100 - mean));
    expect(m.mean).toBeCloseTo(mean);
    expect(m.sd).toBeCloseTo(sd);
    expect(m.monotony).toBeCloseTo(mean / sd);
    expect(m.strain).toBeCloseTo(300 * (mean / sd));
  });

  it("is null when every day is identical (SD = 0)", () => {
    expect(monotony([0, 0, 0, 0, 0, 0, 0]).monotony).toBeNull();
    expect(monotony([60, 60, 60, 60, 60, 60, 60]).strain).toBeNull();
  });

  it("groups by ISO week and cuts the current week at today", () => {
    // 2026-09-21 is a Monday.
    const daily = flatDays("2026-09-21", Array(14).fill(10).map((v, i) => (i % 2 ? v : 0)));
    const weeks = weeklyMonotony(daily, "2026-09-29");
    expect(weeks.map((w) => [w.week, w.days])).toEqual([
      ["2026-09-21", 7],
      ["2026-09-28", 2],
    ]);
  });
});

describe("weekly running volume & long-run share", () => {
  it("returns N ISO weeks ending with the current one", () => {
    expect(weekStarts("2026-09-30", 3)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("sums km, finds the longest run and its share", () => {
    const acts = [
      act({ date: "2026-09-21", distance_km: 8 }),
      act({ date: "2026-09-24", distance_km: 10 }),
      act({ date: "2026-09-27", distance_km: 14 }), // Sunday, same week
      act({ date: "2026-09-27", type: "gym", duration_min: 60 }), // ignored
      act({ date: "2026-09-28", distance_km: 5 }), // next week
      act({ date: "2026-01-01", distance_km: 30 }), // out of range
    ];
    const weeks = weeklyRunning(acts, "2026-09-28", 3);
    expect(weeks).toEqual([
      { week: "2026-09-14", km: 0, runs: 0, longestKm: 0, longRunShare: null },
      { week: "2026-09-21", km: 32, runs: 3, longestKm: 14, longRunShare: 14 / 32 },
      { week: "2026-09-28", km: 5, runs: 1, longestKm: 5, longRunShare: 1 },
    ]);
  });
});

describe("aerobic trend (easy runs)", () => {
  it("classifies easy runs by RPE first, then by HR reserve", () => {
    expect(isEasyRun(act({ date: "x", distance_km: 10, duration_min: 60, avg_hr: 190, rpe: 3 }), anchors)).toBe(true);
    expect(isEasyRun(act({ date: "x", distance_km: 10, duration_min: 60, avg_hr: 140, rpe: 6 }), anchors)).toBe(false);
    expect(isEasyRun(act({ date: "x", distance_km: 10, duration_min: 60, avg_hr: 162 }), anchors)).toBe(true); // HRR .747
    expect(isEasyRun(act({ date: "x", distance_km: 10, duration_min: 60, avg_hr: 163 }), anchors)).toBe(false); // HRR .753
    expect(isEasyRun(act({ date: "x", distance_km: 10, duration_min: 60 }), anchors)).toBe(false); // no HR
  });

  it("computes efficiency factor and the equivalent pace", () => {
    // 10 km in 60 min = 166.67 m/min at 150 bpm → EF 1.111
    const ef = efficiencyFactor(10, 60, 150);
    expect(ef).toBeCloseTo(1.1111, 3);
    expect(paceAtHr(ef, 150)).toBeCloseTo(360); // 6:00/km back at the same HR
    expect(referenceHr(anchors)).toBe(148); // 50 + 0.65 × 150 = 147.5 → 148
  });

  it("weights weekly values by duration and leaves empty weeks null", () => {
    const acts = [
      act({ date: "2026-09-22", distance_km: 10, duration_min: 60, avg_hr: 150 }),
      act({ date: "2026-09-24", distance_km: 4, duration_min: 30, avg_hr: 120 }),
    ];
    const [empty, week] = weeklyAerobic(acts, anchors, "2026-09-27", 2);
    expect(empty).toEqual({ week: "2026-09-14", easyRuns: 0, avgHr: null, ef: null, paceAtRefHr: null });
    expect(week.easyRuns).toBe(2);
    expect(week.avgHr).toBeCloseTo((150 * 60 + 120 * 30) / 90);
    const ef = (efficiencyFactor(10, 60, 150) * 60 + efficiencyFactor(4, 30, 120) * 30) / 90;
    expect(week.ef).toBeCloseTo(ef);
    expect(week.paceAtRefHr).toBeCloseTo(paceAtHr(ef, 148));
  });
});

describe("training summary", () => {
  it("returns today's headline numbers", () => {
    const acts: ActivityInput[] = [];
    for (let i = 0; i < 28; i++) {
      const date = new Date(Date.parse("2026-09-01") + i * 86_400_000).toISOString().slice(0, 10);
      acts.push(act({ date, distance_km: 5, duration_min: 30, rpe: 4 }));
    }
    const s = trainingSummary(acts, anchors, "2026-09-28");
    expect(s.acwr).toBeCloseTo(1);
    expect(s.acuteLoad).toBe(7 * 120);
    expect(s.monotony7d).toBeNull(); // identical days → SD 0
    expect(s.weekKm).toBe(5); // Mon 28 Sep only
    expect(s.estimatedLoadShare).toBe(0);
  });
});
