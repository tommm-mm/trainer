import { describe, expect, it } from "vitest";
import {
  addExercise,
  currentExerciseIndex,
  deleteSet,
  discardWorkout,
  finishWorkout,
  formatSet,
  isDirty,
  lastTimeByExercise,
  logSet,
  markSynced,
  moveExercise,
  removeExercise,
  restSecondsFor,
  startWorkout,
  suggestNextSet,
  swapExercise,
  toRows,
  updateSet,
  type ExerciseInfo,
  type HistoryRow,
  type Store,
  type TemplateInput,
  acceptAllAdvice,
  decideAdvice,
  editTarget,
} from "./workout";
import type { Advice } from "./progression";

const NOW = "2026-09-29T17:00:00.000Z";

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

const template: TemplateInput = {
  id: "tpl-a",
  name: "Full body A",
  items: [
    { id: "te-1", exercise_id: "squat", block: "main", sets: 4, rep_min: 6, rep_max: 8, target_rir: 1, rest_seconds: null },
    { id: "te-2", exercise_id: "curl", block: "main", sets: 3, rep_min: null, rep_max: null, target_rir: null, rest_seconds: 60 },
    { id: "te-3", exercise_id: "swing", block: "finisher", sets: 3, rep_min: null, rep_max: null, target_rir: null, rest_seconds: null },
  ],
};

function started(): Store {
  return startWorkout({ id: "w1", date: "2026-09-29", now: NOW, template, newId: ids() });
}

const set = { weightKg: 60, reps: 8, durationS: null, rir: 1, isWarmup: false };

const pressInfo: ExerciseInfo = {
  id: "press",
  name: "Press",
  primary_muscles: ["shoulders"],
  secondary_muscles: [],
  equipment: "barbell",
  mechanic: "compound",
  is_main_lift: true,
  weight_step_kg: 2.5,
  measure: "reps",
  user_id: null,
};

describe("startWorkout", () => {
  it("copies the template in order with its targets", () => {
    const s = started();
    expect(s.doc.exercises.map((e) => e.exerciseId)).toEqual(["squat", "curl", "swing"]);
    expect(s.doc.exercises[0].target).toEqual({ sets: 4, repMin: 6, repMax: 8, rir: 1, restSeconds: null });
    expect(s.doc.exercises[2].block).toBe("finisher");
    expect(s.doc.templateName).toBe("Full body A");
    expect(isDirty(s)).toBe(true); // a new workout must reach the server
  });

  it("starts empty without a template", () => {
    const s = startWorkout({ id: "w", date: "2026-09-29", now: NOW, template: null, newId: ids() });
    expect(s.doc.exercises).toEqual([]);
    expect(s.doc.templateId).toBeNull();
  });
});

describe("sets", () => {
  it("logs, edits and deletes, bumping rev each time", () => {
    let s = started();
    const we = s.doc.exercises[0].id;
    s = logSet(s, we, set, "s1", NOW);
    s = logSet(s, we, { ...set, reps: 7 }, "s2", NOW);
    expect(s.rev).toBe(3);
    s = updateSet(s, we, "s1", { weightKg: 62.5 });
    expect(s.doc.exercises[0].sets[0].weightKg).toBe(62.5);
    s = deleteSet(s, we, "s2");
    expect(s.doc.exercises[0].sets.map((x) => x.id)).toEqual(["s1"]);
    expect(s.deleted.sets).toEqual(["s2"]); // tombstone so the server copy goes too
    expect(s.rev).toBe(5);
  });

  it("ignores edits to unknown exercises", () => {
    const s = started();
    expect(logSet(s, "nope", set, "x", NOW)).toBe(s);
    expect(deleteSet(s, "nope", "x")).toBe(s);
  });
});

describe("exercises", () => {
  it("adds main exercises before the finisher", () => {
    const s = addExercise(started(), { id: "we-x", exercise: pressInfo });
    expect(s.doc.exercises.map((e) => e.exerciseId)).toEqual(["squat", "curl", "press", "swing"]);
    expect(s.doc.newExercises).toEqual([]);
  });

  it("remembers exercises created mid-workout so they sync first", () => {
    const s = addExercise(started(), { id: "we-x", exercise: pressInfo, block: "finisher", isNew: true });
    expect(s.doc.exercises.at(-1)!.exerciseId).toBe("press");
    expect(toRows(s, NOW).newExercises).toEqual([pressInfo]);
  });

  it("swaps only before any set is logged", () => {
    let s = started();
    const we = s.doc.exercises[0].id;
    s = swapExercise(s, we, "front-squat");
    expect(s.doc.exercises[0].exerciseId).toBe("front-squat");
    expect(s.doc.exercises[0].target?.sets).toBe(4); // slot keeps its target
    s = logSet(s, we, set, "s1", NOW);
    expect(swapExercise(s, we, "leg-press")).toBe(s);
  });

  it("moves within bounds", () => {
    let s = started();
    const [a, b] = s.doc.exercises.map((e) => e.id);
    s = moveExercise(s, b, -1);
    expect(s.doc.exercises.map((e) => e.id).slice(0, 2)).toEqual([b, a]);
    expect(moveExercise(s, b, -1)).toBe(s);
  });

  it("removing an exercise tombstones it and its sets", () => {
    let s = started();
    const we = s.doc.exercises[0].id;
    s = logSet(s, we, set, "s1", NOW);
    s = removeExercise(s, we);
    expect(s.doc.exercises).toHaveLength(2);
    expect(s.deleted).toEqual({ sets: ["s1"], exercises: [we] });
  });
});

describe("sync bookkeeping", () => {
  it("toRows numbers positions in screen order", () => {
    let s = started();
    const [a, b] = s.doc.exercises.map((e) => e.id);
    s = logSet(s, b, set, "s1", NOW);
    s = logSet(s, b, set, "s2", NOW);
    s = moveExercise(s, b, -1);
    const rows = toRows(s, NOW);
    expect(rows.exercises.map((e) => [e.id, e.position])).toEqual([[b, 1], [a, 2], ["id-3", 3]]);
    expect(rows.sets.map((x) => [x.id, x.position, x.workout_exercise_id])).toEqual([
      ["s1", 1, b],
      ["s2", 2, b],
    ]);
    expect(rows.workout).toMatchObject({ id: "w1", status: "in_progress", template_id: "tpl-a" });
  });

  it("markSynced keeps edits and tombstones made during the push", () => {
    let s = started();
    const we = s.doc.exercises[0].id;
    s = logSet(s, we, set, "s1", NOW);
    s = deleteSet(s, we, "s1");
    const pushedRev = s.rev;
    const pushed = s.deleted;
    // While the request is in flight, another set is logged and deleted.
    s = logSet(s, we, set, "s2", NOW);
    s = deleteSet(s, we, "s2");
    s = markSynced(s, pushedRev, pushed);
    expect(isDirty(s)).toBe(true);
    expect(s.deleted.sets).toEqual(["s2"]);
    s = markSynced(s, s.rev, s.deleted);
    expect(isDirty(s)).toBe(false);
    expect(s.deleted.sets).toEqual([]);
  });

  it("markSynced never moves syncedRev backwards (out-of-order responses)", () => {
    let s = started();
    s = markSynced(s, 5, { sets: [], exercises: [] });
    s = markSynced(s, 3, { sets: [], exercises: [] });
    expect(s.syncedRev).toBe(5);
  });
});

describe("finish / discard", () => {
  it("finish sets status, RPE and trims notes", () => {
    const s = finishWorkout(started(), { now: "2026-09-29T18:10:00.000Z", sessionRpe: 8, notes: "  good  " });
    expect(s.doc).toMatchObject({ status: "completed", sessionRpe: 8, notes: "good", finishedAt: "2026-09-29T18:10:00.000Z" });
  });

  it("finish never ends before the start (clock changes)", () => {
    const s = finishWorkout(started(), { now: "2026-09-29T16:00:00.000Z", sessionRpe: null, notes: "" });
    expect(s.doc.finishedAt).toBe(NOW);
    expect(s.doc.notes).toBeNull();
  });

  it("discard marks the workout for deletion", () => {
    expect(discardWorkout(started(), "2026-09-29T17:05:00.000Z").doc.status).toBe("discarded");
  });
});

describe("history & prefill", () => {
  const rows: HistoryRow[] = [
    {
      exercise_id: "squat",
      date: "2026-09-22",
      started_at: "2026-09-22T17:00:00Z",
      sets: [
        { weight_kg: 60, reps: 8, duration_s: null, rir: 2, is_warmup: false, position: 2 },
        { weight_kg: 40, reps: 10, duration_s: null, rir: null, is_warmup: true, position: 1 },
      ],
    },
    {
      exercise_id: "squat",
      date: "2026-09-25",
      started_at: "2026-09-25T17:00:00Z",
      sets: [{ weight_kg: 62.5, reps: 8, duration_s: null, rir: 1, is_warmup: false, position: 1 }],
    },
    { exercise_id: "curl", date: "2026-09-26", started_at: "2026-09-26T17:00:00Z", sets: [] },
  ];

  it("keeps the latest session per exercise, sets in order, skips empty ones", () => {
    const last = lastTimeByExercise(rows);
    expect(last.squat.date).toBe("2026-09-25");
    expect(last.curl).toBeUndefined();
    const older = lastTimeByExercise(rows.slice(0, 1));
    expect(older.squat.sets.map((s) => s.position)).toEqual([1, 2]);
  });

  it("prefills from the previous set today first", () => {
    let s = started();
    const we = s.doc.exercises[0].id;
    s = logSet(s, we, { ...set, weightKg: 65, reps: 6, rir: 0 }, "s1", NOW);
    expect(suggestNextSet(s.doc.exercises[0], lastTimeByExercise(rows).squat, "reps")).toEqual({
      weightKg: 65,
      reps: 6,
      durationS: null,
      rir: 0,
      isWarmup: false,
    });
  });

  it("then from last time's first working set, with the template RIR", () => {
    const s = started();
    const last = lastTimeByExercise(rows.slice(0, 1)).squat;
    expect(suggestNextSet(s.doc.exercises[0], last, "reps")).toMatchObject({ weightKg: 60, reps: 8, rir: 1 });
  });

  it("then from the template, else defaults", () => {
    const s = started();
    expect(suggestNextSet(s.doc.exercises[0], undefined, "reps")).toMatchObject({ weightKg: 0, reps: 8, rir: 1 });
    expect(suggestNextSet(s.doc.exercises[1], undefined, "reps")).toMatchObject({ reps: 8, rir: null });
    expect(suggestNextSet(s.doc.exercises[1], undefined, "time")).toMatchObject({ reps: null, durationS: 30 });
  });
});

describe("rest & progress", () => {
  it("uses the template rest, else compound/isolation defaults, none for finishers", () => {
    const s = started();
    expect(restSecondsFor(s.doc.exercises[1], { mechanic: "isolation" })).toBe(60);
    expect(restSecondsFor(s.doc.exercises[0], { mechanic: "compound" })).toBe(150);
    expect(restSecondsFor({ block: "main", target: null }, { mechanic: "isolation" })).toBe(90);
    expect(restSecondsFor(s.doc.exercises[2], { mechanic: "compound" })).toBe(0);
  });

  it("current exercise = first with target sets left; warm-ups don't count", () => {
    let s = started();
    const we = s.doc.exercises[0].id;
    expect(currentExerciseIndex(s.doc)).toBe(0);
    s = logSet(s, we, { ...set, isWarmup: true }, "w", NOW);
    for (const id of ["a", "b", "c"]) s = logSet(s, we, set, id, NOW);
    expect(currentExerciseIndex(s.doc)).toBe(0);
    s = logSet(s, we, set, "d", NOW);
    expect(currentExerciseIndex(s.doc)).toBe(1);
  });
});

describe("formatSet", () => {
  it("formats reps, bodyweight and time sets", () => {
    expect(formatSet({ weightKg: 62.5, reps: 8, rir: 1 }, "reps")).toBe("62.5 × 8 @1");
    expect(formatSet({ weight_kg: 0, reps: 12, rir: null }, "reps")).toBe("BW × 12");
    expect(formatSet({ weightKg: 0, reps: null, durationS: 75, rir: null }, "time")).toBe("1:15");
  });
});

describe("progression advice", () => {
  const advice: Advice = {
    weight: "add",
    sets: 4,
    repMin: 6,
    repMax: 8,
    rir: 1,
    aimReps: 6,
    reason: "8·8·8·8 @ RIR 1: top of the range on every set",
    basedOn: "2026-09-25",
    repsOnly: false,
    basisKg: 60,
  };
  const last = {
    date: "2026-09-25",
    sets: [{ weight_kg: 62.5, reps: 8, duration_s: null, rir: 1, is_warmup: false, position: 1 }],
  };

  it("accepting sets the target, the reps to aim for and starts from the judged weight", () => {
    let s = started();
    const we = s.doc.exercises[0].id;
    s = decideAdvice(s, we, { ...advice, sets: 5 }, "accepted");
    expect(s.doc.exercises[0].target).toMatchObject({ sets: 5, repMin: 6, repMax: 8, rir: 1 });
    expect(suggestNextSet(s.doc.exercises[0], last, "reps")).toMatchObject({ weightKg: 60, reps: 6 });
    expect(isDirty(s)).toBe(true);
  });

  it("ignoring keeps the template target and the usual prefill", () => {
    let s = started();
    const we = s.doc.exercises[0].id;
    s = decideAdvice(s, we, { ...advice, sets: 5 }, "ignored");
    expect(s.doc.exercises[0].target?.sets).toBe(4);
    expect(suggestNextSet(s.doc.exercises[0], last, "reps")).toMatchObject({ reps: 8 });
    expect(toRows(s, NOW).targets).toEqual([]);
  });

  it("accept all skips decided exercises and bumps the revision once", () => {
    let s = started();
    const [a, b] = s.doc.exercises.map((e) => e.id);
    s = decideAdvice(s, a, advice, "ignored");
    const rev = s.rev;
    s = acceptAllAdvice(s, { [a]: advice, [b]: { ...advice, repMin: 10, repMax: 12 } });
    expect(s.doc.exercises[0].advice?.status).toBe("ignored");
    expect(s.doc.exercises[1].advice?.status).toBe("accepted");
    expect(s.rev).toBe(rev + 1);
    expect(acceptAllAdvice(s, { [a]: advice })).toBe(s);
  });

  it("syncs accepted advice as an approved target for that week", () => {
    let s = started();
    s = decideAdvice(s, s.doc.exercises[0].id, advice, "accepted");
    expect(toRows(s, NOW).targets).toEqual([
      {
        template_exercise_id: "te-1",
        week_start: "2026-09-28",
        sets: 4,
        rep_min: 6,
        rep_max: 8,
        target_rir: 1,
        source: "engine",
        status: "approved",
        rationale: "add weight · 8·8·8·8 @ RIR 1: top of the range on every set",
      },
    ]);
  });
});

describe("editTarget (your hand edits)", () => {
  it("changes sets / reps / RIR within sane bounds and keeps min ≤ max", () => {
    let s = started();
    const id = s.doc.exercises[0].id; // squat 4 × 6–8 @ RIR 1
    s = editTarget(s, id, { sets: 5 });
    expect(s.doc.exercises[0].target).toMatchObject({ sets: 5, repMin: 6, repMax: 8, rir: 1 });
    s = editTarget(s, id, { repMin: 10 }); // above max: max follows
    expect(s.doc.exercises[0].target).toMatchObject({ repMin: 10, repMax: 10 });
    s = editTarget(s, id, { sets: 0, rir: 9 });
    expect(s.doc.exercises[0].target).toMatchObject({ sets: 1, rir: 5 });
    expect(s.doc.exercises[0].targetEdited).toBe(true);
  });

  it("saves the edit as this week's manual target, next to what was suggested", () => {
    let s = started();
    const id = s.doc.exercises[0].id;
    const advice: Advice = {
      sets: 4, repMin: 6, repMax: 8, rir: 1, weight: "same", aimReps: 8, reason: "in the range", basedOn: "2026-09-22",
      basisKg: 100, repsOnly: false, lastSetRir: null, blockNote: null,
    } as Advice;
    s = decideAdvice(s, id, advice, "accepted");
    s = editTarget(s, id, { sets: 5 });
    const row = toRows(s, NOW).targets.find((t) => t.template_exercise_id === "te-1")!;
    expect(row).toMatchObject({ sets: 5, rep_min: 6, rep_max: 8, source: "manual", week_start: "2026-09-28" });
    expect(row.rationale).toMatch(/^set by you · suggested 4 × 6–8 @ RIR 1/);
  });

  it("accepting a suggestion after an edit takes the suggestion again", () => {
    let s = started();
    const id = s.doc.exercises[0].id;
    s = editTarget(s, id, { sets: 6 });
    const advice = { sets: 4, repMin: 6, repMax: 8, rir: 1, weight: "same", aimReps: 8, reason: "", basedOn: null } as unknown as Advice;
    s = decideAdvice(s, id, advice, "accepted");
    expect(s.doc.exercises[0].targetEdited).toBe(false);
    expect(toRows(s, NOW).targets[0]).toMatchObject({ sets: 4, source: "engine" });
  });
});
