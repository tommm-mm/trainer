import { describe, expect, it } from "vitest";
import { adviseNext } from "./progression";
import type { HistorySet, LastTime, Target } from "./workout";

// Bench in Base: 4 × 6–10 @ RIR 2
const bench: Target = { sets: 4, repMin: 6, repMax: 10, rir: 2, restSeconds: 150 };

const last = (sets: [number | null, number | null][], warmup = 0): LastTime => ({
  date: "2026-10-05",
  sets: [
    ...Array.from({ length: warmup }, (_, i): HistorySet => ({ weight_kg: 40, reps: 8, duration_s: null, rir: 5, is_warmup: true, position: i })),
    ...sets.map(([reps, rir], i): HistorySet => ({ weight_kg: 60, reps, duration_s: null, rir, is_warmup: false, position: warmup + i })),
  ],
});

describe("adviseNext", () => {
  it("adds weight when every set hit the top of the range at target RIR", () => {
    const a = adviseNext(bench, last([[10, 2], [10, 2], [10, 2], [10, 1]], 1), "reps");
    expect(a).toMatchObject({ weight: "add", aimReps: 6, sets: 4, repMin: 6, repMax: 10, rir: 2, basedOn: "2026-10-05" });
    expect(a!.reason).toBe("60 kg × 10·10·10·10 @ RIR 1–2: top of the range on every set");
  });

  it("holds the weight when the top was reached by grinding (≥ 2 RIR harder)", () => {
    expect(adviseNext(bench, last([[10, 0], [10, 0], [10, 0], [10, 0]]), "reps")).toMatchObject({
      weight: "same",
      aimReps: 10,
      reason: "60 kg × 10·10·10·10 @ RIR 0: harder than RIR 2, keep the weight and stop at RIR 2",
    });
  });

  it("doesn't add weight with fewer sets than the target", () => {
    expect(adviseNext(bench, last([[10, 2], [10, 2], [10, 2]]), "reps")?.weight).toBe("same");
  });

  it("adds weight when clearly easier than the target RIR", () => {
    expect(adviseNext(bench, last([[8, 4], [8, 4], [8, 5], [8, 4]]), "reps")).toMatchObject({
      weight: "add",
      reason: "60 kg × 8·8·8·8 @ RIR 4–5: easier than RIR 2",
    });
  });

  it("keeps the weight and aims for +1 rep when in the range", () => {
    expect(adviseNext(bench, last([[8, 2], [8, 2], [7, 2], [7, 1]]), "reps")).toMatchObject({
      weight: "same",
      aimReps: 8,
      reason: "60 kg × 8·8·7·7 @ RIR 1–2: in the range, aim for 8+ reps per set",
    });
  });

  it("lowers the weight when half the sets fell under the range", () => {
    expect(adviseNext(bench, last([[7, 1], [6, 1], [5, 0], [4, 0]]), "reps")).toMatchObject({
      weight: "lower",
      aimReps: 6,
      reason: "60 kg × 7·6·5·4 @ RIR 0–1: under 6 reps on 2 of 4 sets",
    });
  });

  it("judges on reps only when no RIR was logged", () => {
    const a = adviseNext(bench, last([[10, null], [10, null], [10, null], [10, null]]), "reps");
    expect(a).toMatchObject({ weight: "add", repsOnly: true, reason: "60 kg × 10·10·10·10: top of the range on every set" });
  });

  it("gives no advice without a rep range, history, or for timed exercises", () => {
    expect(adviseNext({ ...bench, repMin: null }, last([[10, 2]]), "reps")).toBeNull();
    expect(adviseNext(bench, undefined, "reps")).toBeNull();
    expect(adviseNext(bench, last([[10, 2]]), "time")).toBeNull();
    expect(adviseNext(bench, last([], 2), "reps")).toBeNull(); // warm-ups only
  });

  it("caps the aim at the top of the range", () => {
    expect(adviseNext(bench, last([[10, 2], [10, 2], [10, 2], [9, 2]]), "reps")?.aimReps).toBe(10);
  });

  // Cases from real sessions (Full body A/B/C, 4–7 Oct 2026).
  const sets = (rows: [number, number, number | null][]): LastTime => ({
    date: "2026-10-05",
    sets: rows.map(([w, r, rir], i) => ({ weight_kg: w, reps: r, duration_s: null, rir, is_warmup: false, position: i })),
  });

  it("judges a top set + back-offs on the back-off weight (squat 100×5, 90×7·7·8)", () => {
    const squat: Target = { sets: 4, repMin: 6, repMax: 8, rir: 3, restSeconds: null };
    expect(adviseNext(squat, sets([[100, 5, 3], [90, 7, 2], [90, 7, 2], [90, 8, 2]]), "reps")).toMatchObject({
      weight: "same",
      aimReps: 8,
      reason: "90 kg × 7·7·8 @ RIR 2: in the range, aim for 8+ reps per set",
    });
  });

  it("under the range but easier than target → push to the target RIR, not lower (lateral raise)", () => {
    const lateral: Target = { sets: 3, repMin: 12, repMax: 15, rir: 1, restSeconds: null };
    expect(adviseNext(lateral, sets([[50, 11, 2], [50, 11, 2], [50, 11, 2]]), "reps")).toMatchObject({
      weight: "same",
      aimReps: 12,
      reason: "50 kg × 11·11·11 @ RIR 2: under 12 reps but easier than RIR 1, push to RIR 1",
    });
  });

  it("lowers when under the range at or past the target effort (incline DB press)", () => {
    const incline: Target = { sets: 4, repMin: 8, repMax: 10, rir: 2, restSeconds: null };
    expect(adviseNext(incline, sets([[30, 8, 1], [30, 7, 1], [30, 7, 1], [30, 6, 0]]), "reps")?.weight).toBe("lower");
  });

  it("never aims under the bottom of the range (chest fly 12·12·8)", () => {
    const fly: Target = { sets: 4, repMin: 12, repMax: 15, rir: 1, restSeconds: null };
    expect(adviseNext(fly, sets([[59, 12, 2], [66, 12, 2], [66, 12, 2], [66, 8, 2]]), "reps")?.aimReps).toBe(12);
  });

  it("adds weight when well above the range and easy (RDL 24×12 @ RIR 4, range 8–10)", () => {
    const rdl: Target = { sets: 3, repMin: 8, repMax: 10, rir: 3, restSeconds: null };
    expect(adviseNext(rdl, sets([[24, 12, 4], [24, 12, 4], [24, 12, 4]]), "reps")?.weight).toBe("add");
  });

  it("skips finishers and fixed reps without a target RIR (box jumps, swings)", () => {
    const jumps: Target = { sets: 3, repMin: 5, repMax: 5, rir: null, restSeconds: null };
    expect(adviseNext(jumps, sets([[0, 5, null], [0, 5, null], [0, 5, null]]), "reps")).toBeNull();
    const swings: Target = { sets: 4, repMin: 12, repMax: 15, rir: 2, restSeconds: null };
    expect(adviseNext(swings, sets([[20, 15, 2], [20, 15, 2]]), "reps", "finisher")).toBeNull();
  });

  it("on a weight tie, judges the weight you finished on (lat pulldown 73×8·6 → 66×8·8)", () => {
    const pulldown: Target = { sets: 4, repMin: 8, repMax: 12, rir: 1, restSeconds: null };
    expect(adviseNext(pulldown, sets([[73, 8, 2], [73, 6, 0], [66, 8, 1], [66, 8, 1]]), "reps")).toMatchObject({
      weight: "same",
      reason: "66 kg × 8·8 @ RIR 1: in the range, aim for 9+ reps per set",
    });
  });
});
