import { describe, expect, it } from "vitest";
import { decoupling, kmSplits, paceOf, parseLaps } from "./run-detail";

/** A stream at 1 Hz: `paces` in s/km per segment of `secs` seconds, HR per segment. */
function stream(parts: { secs: number; pace: number; hr: number }[]) {
  const time = [0], dist = [0], hr = [parts[0].hr];
  for (const p of parts) {
    for (let i = 0; i < p.secs; i++) {
      time.push(time.at(-1)! + 1);
      dist.push(dist.at(-1)! + (p.pace ? 1000 / p.pace : 0)); // pace 0 = standing still
      hr.push(p.hr);
    }
  }
  return { time, dist, hr };
}

describe("kmSplits", () => {
  it("cuts full kms and keeps a final partial ≥ 200 m", () => {
    // 2.5 km: 1 km at 5:00, 1.5 km at 6:00
    const s = stream([{ secs: 300, pace: 300, hr: 150 }, { secs: 540, pace: 360, hr: 140 }]);
    const out = kmSplits(s.time, s.dist, s.hr);
    expect(out.map((x) => x.km)).toEqual([1, 2, 2.5]);
    expect(out[0]).toMatchObject({ s: 300, hr: 150 });
    expect(out[1]).toMatchObject({ s: 360, hr: 140 });
    expect(paceOf(out[2], 0.5)).toBe(360);
  });

  it("ignores pauses (gaps and standing still)", () => {
    // a 2-minute stop at a traffic light mid-km, then a 30 s gap in the recording
    const s = stream([{ secs: 150, pace: 300, hr: 150 }, { secs: 120, pace: 0, hr: 120 }, { secs: 150, pace: 300, hr: 150 }]);
    for (let i = 200; i < s.time.length; i++) s.time[i] += 30;
    s.dist.splice(200, 1, s.dist[199]); // no distance over the gap
    const [km1] = kmSplits(s.time, s.dist, s.hr);
    expect(km1.hr).toBe(150);
    expect(Math.abs(km1.s - 300)).toBeLessThanOrEqual(1);
  });
});

describe("decoupling", () => {
  it("is ~0 for a steady run and positive when HR drifts up at the same pace", () => {
    const steady = stream([{ secs: 3000, pace: 360, hr: 145 }]);
    expect(decoupling(steady.time, steady.dist, steady.hr)).toBe(0);
    const drift = stream([{ secs: 1500, pace: 360, hr: 140 }, { secs: 1500, pace: 360, hr: 150 }]);
    // EF falls by 1 − 140/150 = 6.7%
    expect(decoupling(drift.time, drift.dist, drift.hr)).toBe(6.7);
  });

  it("isn't judged under 40 moving minutes or without HR", () => {
    const short = stream([{ secs: 1800, pace: 360, hr: 145 }]);
    expect(decoupling(short.time, short.dist, short.hr)).toBeNull();
    const noHr = stream([{ secs: 3000, pace: 360, hr: 145 }]);
    expect(decoupling(noHr.time, noHr.dist, noHr.hr.map(() => null))).toBeNull();
  });
});

describe("parseLaps", () => {
  it("reads intervals.icu intervals defensively", () => {
    const laps = parseLaps({
      icu_intervals: [
        { type: "WORK", moving_time: 60, distance: 280, average_heartrate: 171.4, max_heartrate: 178, label: "Rep 1" },
        { type: "RECOVERY", elapsed_time: 90, distance: 190, average_heartrate: 150 },
        { type: "WORK", moving_time: 0 },
        "junk",
      ],
    });
    expect(laps).toEqual([
      { n: 1, km: 0.28, s: 60, hr: 171, max_hr: 178, label: "Rep 1", work: true },
      { n: 2, km: 0.19, s: 90, hr: 150, max_hr: null, label: null, work: false },
    ]);
    expect(parseLaps([{ moving_time: 300, distance: 1000 }])?.[0]).toMatchObject({ km: 1, s: 300, work: null });
    expect(parseLaps({})).toBeNull();
    expect(parseLaps(null)).toBeNull();
    expect(parseLaps({ icu_intervals: [] })).toBeNull();
  });
});
