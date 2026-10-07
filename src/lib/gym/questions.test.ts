import { describe, expect, it } from "vitest";
import type { StrengthSession } from "@/lib/strength";
import { plannedSets, stallQuestions, volumeQuestions, type QuestionExercise, type QuestionTemplate } from "./questions";
import { describeProposal, type ProposalContext } from "@/lib/coach/proposals";

const ex = (id: string, primary: string[], secondary: string[] = [], mechanic = "compound", equipment = "barbell", measure = "reps"): QuestionExercise => ({
  id, name: id, primary_muscles: primary, secondary_muscles: secondary, mechanic, equipment, measure,
});

// Real library subset and the real Base templates A/B/C (sets @ target RIR).
const library: QuestionExercise[] = [
  ex("Squat", ["quads", "glutes"], ["core"]),
  ex("Incline DB press", ["chest"], ["shoulders", "triceps"], "compound", "dumbbell"),
  ex("Lat pulldown", ["back"], ["biceps"], "compound", "cable"),
  ex("Lateral raise", ["shoulders"], [], "isolation", "machine"),
  ex("EZ curl", ["biceps"], [], "isolation"),
  ex("Pushdown", ["triceps"], [], "isolation", "cable"),
  ex("Box jump", ["quads", "glutes"], ["calves"], "compound", "bodyweight"),
  ex("Military press", ["shoulders"], ["triceps"]),
  ex("Barbell row", ["back"], ["biceps", "shoulders"]),
  ex("Hip thrust", ["glutes"], ["hamstrings"], "compound", "machine"),
  ex("Incline curl", ["biceps"], [], "isolation", "dumbbell"),
  ex("OH triceps ext", ["triceps"], [], "isolation", "cable"),
  ex("Chest press", ["chest"], ["triceps", "shoulders"], "compound", "machine"),
  ex("Seated row", ["back"], ["biceps", "shoulders"], "compound", "machine"),
  ex("Chest fly", ["chest"], [], "isolation", "machine"),
  ex("Preacher curl", ["biceps"], [], "isolation", "machine"),
  ex("Face pull", ["shoulders"], ["back"], "isolation", "cable"),
  ex("Dumbbell row", ["back"], ["biceps"], "compound", "dumbbell"),
];
const item = (id: string, exercise_id: string, sets: number, target_rir: number | null, block = "main") => ({ id, exercise_id, block, sets, target_rir });
const templates: QuestionTemplate[] = [
  { id: "A", name: "Full body A", items: [item("a1", "Squat", 3, 3), item("a2", "Incline DB press", 4, 2), item("a3", "Lat pulldown", 4, 1), item("a4", "Lateral raise", 3, 1), item("a5", "EZ curl", 3, 1), item("a6", "Pushdown", 3, 1)] },
  { id: "B", name: "Full body B", items: [item("b1", "Box jump", 3, null), item("b2", "Military press", 4, 2), item("b3", "Barbell row", 4, 2), item("b4", "Hip thrust", 3, 3), item("b5", "Incline curl", 3, 1), item("b6", "OH triceps ext", 3, 1)] },
  { id: "C", name: "Full body C", items: [item("c1", "Chest press", 4, 2), item("c2", "Seated row", 4, 2), item("c5", "Chest fly", 3, 1), item("c6", "Preacher curl", 2, 1), item("c7", "Pushdown", 2, 1)] },
];

describe("volume questions", () => {
  it("the real Base templates give every upper-body muscle ≥ 10 hard sets: no question", () => {
    const byId = new Map(library.map((e) => [e.id, e]));
    const p = plannedSets(templates, byId);
    expect(Object.fromEntries(["chest", "back", "shoulders", "biceps", "triceps"].map((m) => [m, p.get(m)]))).toEqual({
      chest: 11, back: 12, shoulders: 15, biceps: 14, triceps: 14,
    });
    expect(volumeQuestions({ templates, library, gymFocus: "hypertrophy" })).toEqual([]);
  });

  it("asks to add an isolation exercise to the lightest template when a muscle drops under 10", () => {
    const noLaterals = templates.map((t) => ({ ...t, items: t.items.filter((i) => i.exercise_id !== "Lateral raise" && i.exercise_id !== "Military press") }));
    const q = volumeQuestions({ templates: noLaterals, library, gymFocus: "hypertrophy" });
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({
      key: "volume:shoulders",
      kind: "template_exercise_add",
      title: "Add Face pull 3×10–15 to Full body B?",
      payload: { template_id: "B", exercise_id: "Face pull", sets: 3, rep_min: 10, rep_max: 15, target_rir: 1 },
    });
    expect(q[0].rationale).toBe("Shoulders: 8 hard sets planned a week, Base target ≥ 10.");
  });

  it("stays quiet outside hypertrophy blocks", () => {
    expect(volumeQuestions({ templates: [], library, gymFocus: "hypertrophy" })).toEqual([]);
    expect(volumeQuestions({ templates: templates.slice(0, 1), library, gymFocus: "strength" })).toEqual([]);
  });
});

describe("stall questions", () => {
  const session = (date: string, kg: number, reps = 8, rir = 2): StrengthSession => ({
    id: date, date, minutes: 60, session_rpe: 7, activity_id: null, template_id: "A",
    slots: [{ exercise_id: "Lat pulldown", block: "main", target: { sets: 4, rir: 1 }, sets: [{ weight_kg: kg, reps, duration_s: null, rir, is_warmup: false }] }],
  });

  it("asks to swap a lift whose best e1RM hasn't risen in 4 sessions over 3+ weeks", () => {
    const q = stallQuestions({ templates, library, sessions: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"].map((d) => session(d, 66)) });
    expect(q).toEqual([
      expect.objectContaining({
        key: "stall:a3",
        kind: "template_exercise_swap",
        payload: { template_exercise_id: "a3", exercise_id: "Dumbbell row" },
        title: "Swap Lat pulldown for Dumbbell row in Full body A?",
      }),
    ]);
  });

  it("is quiet while the lift still improves, or with too few / too recent sessions", () => {
    expect(stallQuestions({ templates, library, sessions: [66, 66, 68, 66].map((kg, i) => session(`2026-09-${String(1 + i * 7).padStart(2, "0")}`, kg)) })).toEqual([]);
    expect(stallQuestions({ templates, library, sessions: ["2026-09-01", "2026-09-08", "2026-09-15"].map((d) => session(d, 66)) })).toEqual([]);
    expect(stallQuestions({ templates, library, sessions: ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-08"].map((d) => session(d, 66)) })).toEqual([]);
  });
});

describe("describeProposal", () => {
  const ctx: ProposalContext = {
    plans: new Map([["p1", { day: "2026-10-15", session_type: "tempo", target_distance_km: 9, template_id: null }]]),
    templates: new Map([["B", "Full body B"]]),
    templateExercises: new Map([["b2", { template: "Full body B", exercise: "Military press", sets: 4, rep_min: 6, rep_max: 8, target_rir: 2 }]]),
    exercises: new Map([["fp", "Face pull"], ["db", "Dumbbell press"]]),
  };

  it("reads as before → after for each kind", () => {
    expect(describeProposal("session_update", { plan_id: "p1", day: "2026-10-16", notes: "5×1 km" }, ctx)).toEqual({
      before: "Thu 15 Oct · Tempo 9 km",
      after: "Fri 16 Oct · Tempo 9 km · 5×1 km",
    });
    expect(describeProposal("session_cancel", { plan_id: "p1" }, ctx).after).toBe("cancelled");
    const gym = { ...ctx, plans: new Map([["g", { day: "2026-10-09", session_type: "gym_full", target_distance_km: null, template_id: "C" }]]), templates: new Map([["B", "Full body B"], ["C", "Full body C"]]) };
    expect(describeProposal("session_update", { plan_id: "g", day: "2026-10-08" }, gym)).toEqual({
      before: "Fri 9 Oct · Full body C",
      after: "Thu 8 Oct · Full body C",
    });
    expect(describeProposal("template_exercise_add", { template_id: "B", exercise_id: "fp", sets: 3, rep_min: 12, rep_max: 15, target_rir: 1 }, ctx).after).toBe(
      "Full body B: + Face pull 3×12–15 @ RIR 1",
    );
    expect(describeProposal("template_exercise_update", { template_exercise_id: "b2", sets: 3, rep_min: 4, rep_max: 6 }, ctx)).toEqual({
      before: "Full body B: Military press 4×6–8 @ RIR 2",
      after: "Military press 3×4–6 @ RIR 2",
    });
    expect(describeProposal("template_exercise_swap", { template_exercise_id: "b2", exercise_id: "db" }, ctx).after).toBe("Dumbbell press");
    expect(describeProposal("template_create", { name: "Strength A", items: [{ exercise_id: "db", sets: 3, rep_min: 4, rep_max: 6, target_rir: 2 }] }, ctx).after).toBe(
      'New template "Strength A": Dumbbell press 3×4–6 @ RIR 2',
    );
  });

  it("flags proposals whose target is gone (can only be rejected)", () => {
    expect(describeProposal("session_cancel", { plan_id: "gone" }, ctx).error).toBe("The session no longer exists.");
    expect(describeProposal("template_archive", { template_id: "gone" }, ctx).error).toBe("The template no longer exists.");
    expect(describeProposal("bogus", {}, ctx).error).toBe('Unknown change "bogus".');
  });
});
