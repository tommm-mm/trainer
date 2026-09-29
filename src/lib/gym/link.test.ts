import { describe, expect, it } from "vitest";
import { matchWorkouts } from "./link";

describe("matchWorkouts", () => {
  const acts = [
    { id: "hiit", date: "2026-09-25", duration_min: 12 },
    { id: "pesi", date: "2026-09-25", duration_min: 68 },
    { id: "other-day", date: "2026-09-23", duration_min: 60 },
  ];

  it("picks the longest same-day gym activity", () => {
    expect(matchWorkouts([{ id: "w", date: "2026-09-25" }], acts, new Set())).toEqual([
      { workoutId: "w", activityId: "pesi" },
    ]);
  });

  it("never reuses an activity (already linked or earlier in the batch)", () => {
    expect(
      matchWorkouts(
        [
          { id: "w1", date: "2026-09-25" },
          { id: "w2", date: "2026-09-25" },
          { id: "w3", date: "2026-09-25" },
        ],
        acts,
        new Set(["hiit"]),
      ),
    ).toEqual([{ workoutId: "w1", activityId: "pesi" }]);
  });

  it("leaves workouts without a same-day activity unlinked", () => {
    expect(matchWorkouts([{ id: "w", date: "2026-09-29" }], acts, new Set())).toEqual([]);
  });
});
