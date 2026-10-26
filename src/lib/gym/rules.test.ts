import { describe, expect, it } from "vitest";
import { applyRules, describeRules, parseRules, type PlanExercise } from "./rules";
import { blockAdjustments, blockContext, weekRules, withCoachRules, DEFAULT_RULES } from "./periodization";
import { withBlock, type Advice } from "./progression";

// Full body B (real): box jumps, military press, bent-over row, hip thrust, curl, overhead ext, calves.
const B: PlanExercise[] = [
  { id: "box", exerciseId: "x-box", block: "main", sets: 3, rir: null, repMin: 5, repMax: 5, mechanic: "compound", primaryMuscles: ["quads", "glutes"] },
  { id: "press", exerciseId: "x-press", block: "main", sets: 4, rir: 2, repMin: 6, repMax: 8, mechanic: "compound", primaryMuscles: ["shoulders"] },
  { id: "row", exerciseId: "x-row", block: "main", sets: 4, rir: 2, repMin: 6, repMax: 8, mechanic: "compound", primaryMuscles: ["back"] },
  { id: "thrust", exerciseId: "x-thrust", block: "main", sets: 3, rir: 3, repMin: 8, repMax: 10, mechanic: "compound", primaryMuscles: ["glutes"] },
  { id: "curl", exerciseId: "x-curl", block: "main", sets: 3, rir: 1, repMin: 8, repMax: 10, mechanic: "isolation", primaryMuscles: ["biceps"] },
  { id: "calf", exerciseId: "x-calf", block: "main", sets: 3, rir: 2, repMin: 12, repMax: 15, mechanic: "isolation", primaryMuscles: ["calves"] },
  { id: "twist", exerciseId: "x-twist", block: "finisher", sets: 3, rir: null, mechanic: "isolation", primaryMuscles: ["core"] },
];

describe("parseRules", () => {
  it("accepts the documented shape", () => {
    const { rules, errors } = parseRules([
      { match: { mechanic: "compound", region: "upper", limit: 2 }, sets_delta: 1, rep_min: 4, rep_max: 6, rir: 2, note: "wave 1" },
      { match: { region: "lower" }, min_rir: 2 },
      { sets_factor: 0.5, weight: "keep" },
    ]);
    expect(errors).toEqual([]);
    expect(rules).toHaveLength(3);
  });

  it("reports typos and bad values instead of guessing", () => {
    const { rules, errors } = parseRules([{ rirr: 2 }, { match: { region: "legs" }, rep_min: 8, rep_max: 6 }, { weight: "heavier" }]);
    expect(rules).toEqual([]);
    expect(errors).toEqual(['rule 1: unknown "rirr"', 'rule 2: rep_min > rep_max, bad match "region"', 'rule 3: bad "weight"']);
    expect(parseRules({}).errors).toEqual(["rules must be a list"]);
  });
});

describe("applyRules", () => {
  it("matches by group, keeps finishers out unless asked, and rules stack in order", () => {
    const adj = applyRules(B, [
      { match: { mechanic: "compound" }, rep_min: 4, rep_max: 6, rir: 3 },
      { match: { region: "lower" }, min_rir: 2, rir_delta: -2 },
    ]);
    expect([...adj.keys()]).toEqual(["box", "press", "row", "thrust", "calf"]);
    expect(adj.get("press")).toMatchObject({ sets: 4, rir: 3, repMin: 4, repMax: 6, weight: null });
    // thrust: compound → RIR 3, then lower: 3 − 2 = 1, floored at 2
    expect(adj.get("thrust")).toMatchObject({ rir: 2, repMin: 4, repMax: 6 });
    // calf: only the lower rule (2 − 2 = 0 → floor 2)
    expect(adj.get("calf")).toMatchObject({ rir: 2, repMin: null });
    // box jumps have no RIR: the min_rir floor gives them one
    expect(adj.get("box")?.rir).toBe(2);
    expect(adj.has("curl")).toBe(false);
    expect(adj.has("twist")).toBe(false);
  });

  it("limit, exercise and template targeting, set maths", () => {
    const adj = applyRules(
      B,
      [
        { match: { mechanic: "compound", region: "upper", limit: 1 }, sets: 5 },
        { match: { exercise_ids: ["x-curl"] }, sets_factor: 0.5, last_set_rir: 0, weight: "add" },
        { match: { template_ids: ["other"] }, sets: 1 },
        { match: { block: "finisher" }, sets_delta: -5 },
      ],
      "tpl-b",
    );
    expect(adj.get("press")?.sets).toBe(5);
    expect(adj.has("row")).toBe(false);
    expect(adj.get("curl")).toMatchObject({ sets: 2, lastSetRir: 0, weight: "add" });
    expect(adj.get("twist")?.sets).toBe(1); // never below 1 set
    expect(adj.get("curl")?.note).toBe("half the sets, last set RIR 0, add weight");
  });

  it("the default rules only deload", () => {
    expect(blockAdjustments(B, "base").size).toBe(0);
    expect(blockAdjustments(B, "deload").get("press")).toMatchObject({ sets: 2, rir: 3, weight: "keep" });
    expect(blockAdjustments(B, "deload").get("box")).toMatchObject({ sets: 2, rir: 3 });
  });
});

describe("coach week rules", () => {
  const season = [
    { name: "Build 1", focus: "build", gym_focus: "strength", weeks: [{ week_start: "2026-11-30" }, { week_start: "2026-12-21", is_deload: true }] },
  ];

  it("replace the defaults for that week only, also outside the season", () => {
    const rules = [{ match: { region: "upper" as const }, rir: 3 }];
    const ctx = withCoachRules(blockContext(season, "2026-12-21"), "2026-12-21", { rules, note: "wave" });
    expect(ctx).toMatchObject({ block: "Build 1", step: "deload", coach: { note: "wave" } });
    expect(weekRules(ctx!)).toBe(rules);
    expect(weekRules(blockContext(season, "2026-12-21")!)).toBe(DEFAULT_RULES.deload);
    expect(withCoachRules(null, "2027-06-07", { rules: [], note: null })).toMatchObject({ block: null, step: "base" });
    expect(withCoachRules(null, "2027-06-07", null)).toBeNull();
  });

  it("describes rules in words for the proposal card", () => {
    expect(
      describeRules(
        [
          { match: { mechanic: "compound", region: "upper", limit: 2 }, sets_delta: 1 },
          { match: { exercise_ids: ["x-curl"] }, rir: 0, note: "go hard" },
        ],
        { exercises: new Map([["x-curl", "EZ Bar Biceps Curl"]]) },
      ),
    ).toBe("Upper-body compounds (first 2): +1 set; EZ Bar Biceps Curl: RIR 0 · go hard");
    expect(describeRules([])).toBe("templates as written");
  });
});

describe("withBlock with week rules", () => {
  const advice: Advice = {
    weight: "same", sets: 4, repMin: 6, repMax: 8, rir: 2, aimReps: 7, basisKg: 85, reason: "in range", basedOn: "2026-11-26", repsOnly: false,
  };
  const base = { sets: 3, rir: 2, lastSetRir: null, note: "wave" };

  it("takes the week's rep range and clamps the reps to aim for", () => {
    const a = withBlock(advice, { ...base, repMin: 4, repMax: 6, weight: null }, null)!;
    expect(a).toMatchObject({ sets: 3, repMin: 4, repMax: 6, aimReps: 6, weight: "same", blockNote: "wave" });
  });

  it("an explicit add / lower wins; keep never overrides lower", () => {
    expect(withBlock(advice, { ...base, weight: "add" }, null)).toMatchObject({ weight: "add", aimReps: 6 });
    expect(withBlock({ ...advice, weight: "lower" }, { ...base, weight: "add" }, null)?.weight).toBe("add");
    expect(withBlock({ ...advice, weight: "lower" }, { ...base, weight: "keep" }, null)?.weight).toBe("lower");
    expect(withBlock(advice, { ...base, weight: "keep" }, null)).toMatchObject({ weight: "keep", aimReps: 6 });
  });

  it("no history: the week's prescription alone, never a weight change", () => {
    const a = withBlock(null, { ...base, repMin: 3, repMax: 5, weight: "add" }, { sets: 3, repMin: 6, repMax: 8, rir: 2, restSeconds: null })!;
    expect(a).toMatchObject({ weight: "keep", repMin: 3, repMax: 5, aimReps: 3, basedOn: null });
  });
});
