import { describe, expect, it } from "vitest";
import { mondayOf } from "@/lib/dates";
import { effortTable } from "@/lib/season/efforts";
import {
  bands,
  histogramFromStream,
  judgeIntensity,
  MAX_SAMPLE_GAP_S,
  weeklyZones,
  zoneCuts,
  zoneOf,
  zoneScale,
  zoneSeconds,
} from "./zones";

// Tommaso's anchors today: rest 46, max 195.
const a = { rest: 46, max: 195 };

describe("zone cuts", () => {
  it("match the Efforts table bpm (65 / 75 / 84 / 90% HRR)", () => {
    expect(zoneCuts(a)).toEqual([143, 158, 171, 180]);
    const table = effortTable(a, null);
    expect(table.slice(1).map((r) => r.hrLow)).toEqual(zoneCuts(a));
  });

  it("re-centre on a measured threshold HR: the 84% edge lands on it", () => {
    const t = { ...a, threshold: 175 };
    expect(zoneScale(t)).toBeCloseTo((175 - 46) / 149 / 0.84);
    const cuts = zoneCuts(t);
    expect(cuts[2]).toBe(175);
    // every edge moves the same way, so the zones keep their proportions
    expect(cuts[0]).toBeGreaterThan(143);
    expect(cuts[1]).toBeGreaterThan(158);
    // the Efforts table shows the same re-centred bands
    expect(effortTable(t, null)[3].hrLow).toBe(175);
  });

  it("round exact halves up, like the SQL views (148 × 0.65 × 1.0135 = 97.5 → 145.5 → 146)", () => {
    expect(zoneCuts({ rest: 48, max: 196, threshold: 174 })).toEqual([146, 161, 174, 183]);
  });

  it("ignore an implausible threshold", () => {
    expect(zoneScale({ ...a, threshold: 40 })).toBe(1);
    expect(zoneScale({ ...a, threshold: 200 })).toBe(1);
    expect(zoneScale({ ...a, threshold: null })).toBe(1);
  });

  it("place a bpm in zone 0–4", () => {
    const cuts = zoneCuts(a);
    expect(zoneOf(120, cuts)).toBe(0);
    expect(zoneOf(143, cuts)).toBe(1);
    expect(zoneOf(157, cuts)).toBe(1);
    expect(zoneOf(158, cuts)).toBe(2);
    expect(zoneOf(175, cuts)).toBe(3);
    expect(zoneOf(190, cuts)).toBe(4);
  });
});

describe("HR histogram", () => {
  it("counts seconds per bpm, 1 s per sample without a time stream", () => {
    expect(histogramFromStream([150, 150, 151, null, 149])).toEqual({ min: 149, counts: [1, 2, 1] });
  });

  it("weights samples by the time to the next one, capping pauses", () => {
    // 0→2 s: 2 s at 140; 2→60 s pause: capped; last sample: 1 s
    const h = histogramFromStream([140, 160, 170], [0, 2, 60]);
    expect(h).toEqual({ min: 140, counts: [2, ...Array(19).fill(0), MAX_SAMPLE_GAP_S, ...Array(9).fill(0), 1] });
  });

  it("skips implausible readings and returns null with nothing usable", () => {
    expect(histogramFromStream([0, 10, 300, null])).toBeNull();
    expect(histogramFromStream([])).toBeNull();
  });

  it("rounds fractional HR to whole bpm", () => {
    expect(histogramFromStream([150.4, 150.6])).toEqual({ min: 150, counts: [1, 1] });
  });
});

describe("zones and bands", () => {
  it("bin a tempo run: warm-up easy, 20′ threshold, cool-down", () => {
    const hr = [...Array(900).fill(150), ...Array(1200).fill(174), ...Array(600).fill(145)];
    const z = zoneSeconds(histogramFromStream(hr)!, zoneCuts(a));
    expect(z).toEqual([0, 1500, 0, 1200, 0]);
    expect(bands(z)).toEqual({ easy: 1500, moderate: 0, hard: 1200 });
  });

  it("re-bin the same histogram when the threshold changes", () => {
    const h = histogramFromStream(Array(600).fill(172))!;
    expect(zoneSeconds(h, zoneCuts(a))[3]).toBe(600); // threshold at the default 171
    expect(zoneSeconds(h, zoneCuts({ ...a, threshold: 175 }))[2]).toBe(600); // marathon pace after the test
  });
});

describe("80/20 verdict", () => {
  it("is good at ≥ 80% easy", () => {
    expect(judgeIntensity({ easy: 160, moderate: 20, hard: 20 })?.status).toBe("good");
  });

  it("is amber at 70–80%, expected in Specific / Peak", () => {
    const b = { easy: 150, moderate: 30, hard: 20 };
    expect(judgeIntensity(b, "base")).toMatchObject({ status: "watch", message: expect.stringContaining("intense") });
    expect(judgeIntensity(b, "specific")).toMatchObject({ status: "watch", message: expect.stringContaining("expected") });
  });

  it("is red under 70% and silent under an hour of zoned time", () => {
    expect(judgeIntensity({ easy: 60, moderate: 30, hard: 30 })?.status).toBe("off");
    expect(judgeIntensity({ easy: 30, moderate: 10, hard: 10 })).toBeNull();
  });
});

describe("weekly zones", () => {
  it("sums runs and bike/swim per week, ignores gym, counts missing streams", () => {
    const easy = histogramFromStream(Array(3000).fill(150))!;
    const hard = histogramFromStream(Array(600).fill(185))!;
    const weeks = weeklyZones(
      [
        { date: "2026-09-29", type: "run", hr_hist_min: easy.min, hr_hist: easy.counts },
        { date: "2026-10-01", type: "cross", hr_hist_min: hard.min, hr_hist: hard.counts },
        { date: "2026-10-02", type: "gym", hr_hist_min: hard.min, hr_hist: hard.counts },
        { date: "2026-10-03", type: "run", hr_hist_min: null, hr_hist: null },
        { date: "2026-10-04", type: "run", hr_hist_min: 100, hr_hist: [] }, // stream had no HR
      ],
      a,
      ["2026-09-28"],
      mondayOf,
    );
    expect(weeks[0]).toMatchObject({
      week: "2026-09-28",
      zones: [0, 50, 0, 0, 10],
      bands: { easy: 50, moderate: 0, hard: 10 },
      minutes: 60,
      missing: 2,
    });
    expect(weeks[0].easyShare).toBeCloseTo(50 / 60);
  });
});
