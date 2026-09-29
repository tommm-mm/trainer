import { describe, expect, it } from "vitest";
import {
  assessAcwr,
  assessAerobicTrend,
  assessEasyHrTrend,
  assessLongRunShare,
  assessMonotony,
  assessRpeCoverage,
  assessVolumeRamp,
  coachRead,
  type Insight,
} from "./assess";
import { isCompleteWeek, linearFit, rollingMean, type AerobicWeek, type RunningWeek } from "./metrics";

const week = (km: number, longestKm = 0): RunningWeek => ({
  week: "2026-09-21",
  km,
  runs: 3,
  longestKm,
  longRunShare: km > 0 ? longestKm / km : null,
});

describe("trend helpers", () => {
  it("rolling mean skips nulls and needs half a window", () => {
    expect(rollingMean([10, 20, 30, 40], 2)).toEqual([10, 15, 25, 35]);
    expect(rollingMean([null, null, 30, null], 4)).toEqual([null, null, null, null]);
    expect(rollingMean([10, null, 30, null], 4)).toEqual([null, null, 20, 20]);
  });

  it("fits a least-squares line and spans every index", () => {
    const fit = linearFit([1, null, 5, 7])!; // points (0,1) (2,5) (3,7): exact y = 2x + 1
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(1);
    expect(fit.fitted.map((v) => Math.round(v))).toEqual([1, 3, 5, 7]);
    expect(linearFit([1, null, 2])).toBeNull(); // < 3 points
  });

  it("knows when a week is complete", () => {
    expect(isCompleteWeek("2026-09-21", "2026-09-28")).toBe(true); // Monday after
    expect(isCompleteWeek("2026-09-21", "2026-09-27")).toBe(false); // still Sunday
  });
});

describe("ACWR verdict", () => {
  it.each([
    [null, "na"],
    [0.7, "watch"],
    [0.8, "good"],
    [1.3, "good"],
    [1.31, "watch"],
    [1.5, "watch"],
    [1.51, "off"],
  ] as const)("%s → %s", (ratio, status) => {
    expect(assessAcwr(ratio).status).toBe(status);
  });
});

describe("monotony verdict", () => {
  it.each([
    [null, "na"],
    [1.2, "good"],
    [1.5, "good"],
    [1.8, "watch"],
    [2.1, "off"],
  ] as const)("%s → %s", (m, status) => {
    expect(assessMonotony(m).status).toBe(status);
  });
});

describe("volume ramp verdict", () => {
  it("compares the last week with the 3 before", () => {
    expect(assessVolumeRamp([week(30), week(30), week(30), week(32)]).status).toBe("good"); // +7%
    expect(assessVolumeRamp([week(30), week(30), week(30), week(35)]).status).toBe("watch"); // +17%
    const off = assessVolumeRamp([week(30), week(30), week(30), week(40)]);
    expect(off.status).toBe("off"); // +33%
    expect(off.value).toBe("+33%");
    expect(assessVolumeRamp([week(30), week(30), week(30), week(18)]).status).toBe("watch"); // −40%
  });

  it("needs 4 weeks and a real base", () => {
    expect(assessVolumeRamp([week(30), week(30), week(30)]).status).toBe("na");
    expect(assessVolumeRamp([week(1), week(2), week(1), week(10)]).status).toBe("na");
  });
});

describe("long-run share verdict", () => {
  it.each([
    [30, 10, "good"], // 33%
    [30, 12, "watch"], // 40%
    [30, 15, "off"], // 50%
    [40, 7, "watch"], // 17.5%
    [10, 8, "na"], // under 15 km
  ] as const)("%s km with a %s km long run → %s", (km, longest, status) => {
    expect(assessLongRunShare(week(km, longest)).status).toBe(status);
  });
});

describe("aerobic trend verdict", () => {
  const weeks = (paces: (number | null)[]): AerobicWeek[] =>
    paces.map((p, i) => ({
      week: `w${i}`,
      easyRuns: p === null ? 0 : 1,
      avgHr: null,
      ef: null,
      paceAtRefHr: p,
    }));

  it("reads the slope of pace at reference HR", () => {
    expect(assessAerobicTrend(weeks([400, 397, 394, 391])).status).toBe("good"); // −3 s/km/wk
    expect(assessAerobicTrend(weeks([400, 400, 400, 400])).status).toBe("watch"); // flat
    expect(assessAerobicTrend(weeks([400, 401, 402, 403])).status).toBe("watch"); // +1
    expect(assessAerobicTrend(weeks([400, 403, 406, 409])).status).toBe("off"); // +3
    expect(assessAerobicTrend(weeks([400, null, 390])).status).toBe("na");
  });
});

describe("easy-run HR trend verdict", () => {
  const weeks = (hrs: (number | null)[]): AerobicWeek[] =>
    hrs.map((hr, i) => ({ week: `w${i}`, easyRuns: 1, avgHr: hr, ef: null, paceAtRefHr: null }));

  it("reads the slope in bpm per week", () => {
    expect(assessEasyHrTrend(weeks([150, 149, 148, 147])).status).toBe("good"); // −1
    expect(assessEasyHrTrend(weeks([150, 150, 150, 150])).status).toBe("watch"); // flat
    expect(assessEasyHrTrend(weeks([150, 151, 152, 153])).status).toBe("off"); // +1
    expect(assessEasyHrTrend(weeks([150, null, 151])).status).toBe("na");
  });
});

describe("RPE coverage verdict", () => {
  it("warns when most load is estimated", () => {
    expect(assessRpeCoverage(0.84).status).toBe("watch");
    expect(assessRpeCoverage(0.3).status).toBe("good");
    expect(assessRpeCoverage(null).status).toBe("na");
  });
});

describe("coach's read", () => {
  const item = (id: string, status: "good" | "watch" | "off" | "na"): Insight => ({
    id,
    title: id,
    verdict: { status, value: null, message: "" },
  });

  it("puts problems first, keeps order within a level, drops 'na' and caps", () => {
    const read = coachRead(
      [item("a", "good"), item("b", "watch"), item("c", "na"), item("d", "off"), item("e", "watch")],
      3,
    );
    expect(read.map((i) => i.id)).toEqual(["d", "b", "e"]);
  });
});
