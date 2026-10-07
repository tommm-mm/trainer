import { describe, expect, it } from "vitest";
import { blockAdjustments, blockContext, type PlanExercise, type SeasonBlockInput } from "./periodization";
import { adviseNext, pendingAdvice, withBlock } from "./progression";
import { decideAdvice, startWorkout, suggestNextSet, type LastTime } from "./workout";

// The approved Padova season, first blocks (real dates).
const w = (week_start: string, is_deload = false) => ({ week_start, is_deload });
const season: SeasonBlockInput[] = [
  { name: "Base 1", focus: "base", gym_focus: "hypertrophy", weeks: [w("2026-09-28"), w("2026-10-05"), w("2026-10-12"), w("2026-10-19"), w("2026-10-26", true)] },
  { name: "Base 2", focus: "base", gym_focus: "hypertrophy", weeks: [w("2026-11-02"), w("2026-11-09"), w("2026-11-16"), w("2026-11-23", true)] },
  { name: "Build 1", focus: "build", gym_focus: "strength", weeks: [w("2026-11-30"), w("2026-12-07"), w("2026-12-14"), w("2026-12-21", true)] },
  { name: "Taper", focus: "taper", gym_focus: "maintenance", weeks: [w("2027-03-29")] },
];

// Full body A (real): squat, incline DB press, lat pulldown, lateral raise, EZ curl, pushdown + finisher.
const A: PlanExercise[] = [
  { id: "squat", block: "main", sets: 3, rir: 3, mechanic: "compound", primaryMuscles: ["quads", "glutes"] },
  { id: "incline", block: "main", sets: 4, rir: 2, mechanic: "compound", primaryMuscles: ["chest"] },
  { id: "pulldown", block: "main", sets: 4, rir: 1, mechanic: "compound", primaryMuscles: ["back"] },
  { id: "lateral", block: "main", sets: 3, rir: 1, mechanic: "isolation", primaryMuscles: ["shoulders"] },
  { id: "curl", block: "main", sets: 3, rir: 1, mechanic: "isolation", primaryMuscles: ["biceps"] },
  { id: "pushdown", block: "main", sets: 3, rir: 1, mechanic: "isolation", primaryMuscles: ["triceps"] },
  { id: "swing", block: "finisher", sets: 3, rir: null, mechanic: "compound", primaryMuscles: ["glutes"] },
];

describe("blockContext", () => {
  it("follows the agreed Base pattern, counting back from each lighter week", () => {
    const steps = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]
      .map((m) => blockContext(season, m)?.step);
    expect(steps).toEqual(["base", "base", "plus_set", "last_set_rir0", "deload", "base", "plus_set", "last_set_rir0", "deload"]);
  });

  it("strength blocks keep the template, deload weeks deload, taper counts as lighter", () => {
    expect(blockContext(season, "2026-12-07")).toMatchObject({ block: "Build 1", gymFocus: "strength", step: "base" });
    expect(blockContext(season, "2026-12-21")?.step).toBe("deload");
    expect(blockContext(season, "2027-03-29")?.step).toBe("deload");
    expect(blockContext(season, "2027-06-07")).toBeNull();
  });
});

describe("blockAdjustments", () => {
  it("+1 set on the two upper-body compounds only (incline press, pulldown)", () => {
    const a = blockAdjustments(A, "plus_set");
    expect([...a.keys()]).toEqual(["incline", "pulldown"]);
    expect(a.get("incline")).toMatchObject({ sets: 5, rir: 2, weight: null });
  });

  it("last set to RIR 0 on the upper-body accessories", () => {
    const a = blockAdjustments(A, "last_set_rir0");
    expect([...a.keys()]).toEqual(["lateral", "curl", "pushdown"]);
    expect(a.get("curl")).toMatchObject({ sets: 3, lastSetRir: 0 });
  });

  it("deload: half the sets (rounded up), RIR ≥ 3, same weights, finishers untouched", () => {
    const a = blockAdjustments(A, "deload");
    expect(a.get("incline")).toMatchObject({ sets: 2, rir: 3, weight: "keep" });
    expect(a.get("squat")).toMatchObject({ sets: 2, rir: 3 });
    expect(a.has("swing")).toBe(false);
  });

  it("base week: nothing", () => {
    expect(blockAdjustments(A, "base").size).toBe(0);
  });
});

describe("advice with the block on top", () => {
  const target = { sets: 4, repMin: 8, repMax: 10, rir: 2, restSeconds: null };
  const last: LastTime = {
    date: "2026-10-05",
    sets: [10, 10, 10, 10].map((r, i) => ({ weight_kg: 30, reps: r, duration_s: null, rir: 2, is_warmup: false, position: i })),
  };
  const deload = blockAdjustments(A, "deload").get("incline")!;

  it("a deload holds the weight even when progression says add, and halves the sets", () => {
    expect(adviseNext(target, last, "reps")?.weight).toBe("add");
    expect(withBlock(adviseNext(target, last, "reps"), deload, target)).toMatchObject({
      weight: "keep",
      aimReps: 8,
      sets: 2,
      rir: 3,
      blockNote: "Lighter week: half the sets, same weights, RIR 3–4",
    });
  });

  it("a deload keeps a 'lower' from progression (incline press under the range)", () => {
    const under: LastTime = { ...last, sets: [8, 7, 7, 6].map((r, i) => ({ ...last.sets[0], reps: r, rir: 1, position: i })) };
    expect(withBlock(adviseNext(target, under, "reps"), deload, target)).toMatchObject({ weight: "lower", sets: 2 });
  });

  it("the block alone still suggests when there's no history", () => {
    expect(withBlock(null, deload, target)).toMatchObject({ weight: "keep", sets: 2, basedOn: null, basisKg: null, aimReps: 8 });
    expect(withBlock(null, deload, { ...target, repMin: null })).toBeNull();
  });

  it("accepting a RIR-0 week prefills RIR 0 on the last set only", () => {
    let n = 0;
    let s = startWorkout({
      id: "w",
      date: "2026-10-19",
      now: "2026-10-19T17:00:00Z",
      newId: () => `id${++n}`,
      template: { id: "t", name: "A", items: [{ id: "te", exercise_id: "curl", block: "main", sets: 3, rep_min: 8, rep_max: 12, target_rir: 1, rest_seconds: null }] },
    });
    const ex = s.doc.exercises[0];
    const adv = pendingAdvice(ex, undefined, "reps", blockAdjustments([{ ...A[4], id: ex.id }], "last_set_rir0").get(ex.id))!;
    s = decideAdvice(s, ex.id, adv, "accepted");
    const set = (rir: number, id: string, st: typeof s) => ({ ...st, doc: { ...st.doc, exercises: [{ ...st.doc.exercises[0], sets: [...st.doc.exercises[0].sets, { id, weightKg: 30, reps: 10, durationS: null, rir, isWarmup: false, loggedAt: "" }] }] } });
    s = set(1, "a", s);
    expect(suggestNextSet(s.doc.exercises[0], undefined, "reps").rir).toBe(1);
    s = set(1, "b", s);
    expect(suggestNextSet(s.doc.exercises[0], undefined, "reps").rir).toBe(0);
  });
});
