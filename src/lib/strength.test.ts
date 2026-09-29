import { describe, expect, it } from "vitest";
import {
  adherence,
  bestE1rm,
  e1rm,
  isHardSet,
  liftHistory,
  liftTrendPctPerWeek,
  muscleSets,
  personalRecords,
  tonnage,
  trainedMainLifts,
  unlinkedWorkoutActivities,
  weeklyGym,
  weeklyLift,
  type ExerciseIndex,
  type StrengthSession,
  type StrengthSet,
} from "./strength";
import {
  assessAdherence,
  assessGymFrequency,
  assessMuscleVolume,
  assessStrengthTrend,
} from "./assess";

const set = (w: number, reps: number, rir: number | null = 1, warm = false): StrengthSet => ({
  weight_kg: w,
  reps,
  duration_s: null,
  rir,
  is_warmup: warm,
});

const index: ExerciseIndex = {
  squat: { name: "Squat", primary_muscles: ["quads", "glutes"], secondary_muscles: ["core"], measure: "reps", is_main_lift: true },
  bench: { name: "Bench", primary_muscles: ["chest"], secondary_muscles: ["triceps", "shoulders"], measure: "reps", is_main_lift: true },
  curl: { name: "Curl", primary_muscles: ["biceps"], secondary_muscles: [], measure: "reps", is_main_lift: false },
  plank: { name: "Plank", primary_muscles: ["core"], secondary_muscles: [], measure: "time", is_main_lift: false },
};

function session(p: Partial<StrengthSession> & { date: string; slots: StrengthSession["slots"] }): StrengthSession {
  return { id: p.date, minutes: 60, session_rpe: 7, activity_id: null, template_id: "A", ...p };
}

describe("e1rm (RIR-adjusted Epley)", () => {
  it("adds RIR to reps before applying Epley", () => {
    expect(e1rm(100, 5, 0)).toBeCloseTo(116.67, 2);
    expect(e1rm(100, 5, 2)).toBeCloseTo(123.33, 2); // same as 7 reps to failure
    expect(e1rm(100, 5, null)).toBeCloseTo(116.67, 2); // unrated = RIR 0, lower bound
  });

  it("a true single is the weight itself", () => {
    expect(e1rm(140, 1, 0)).toBe(140);
  });

  it("refuses estimates beyond 12 reps to failure and empty sets", () => {
    expect(e1rm(50, 10, 3)).toBeNull();
    expect(e1rm(50, 0, 0)).toBeNull();
    expect(e1rm(0, 10, 0)).toBeNull(); // bodyweight with no added load
  });

  it("best e1RM ignores warm-ups", () => {
    expect(bestE1rm([set(120, 3, 0, true), set(100, 5, 1)])).toBeCloseTo(120, 5);
  });
});

describe("hard sets & muscle volume", () => {
  it("counts only main-block working rep sets at RIR ≤ 4", () => {
    expect(isHardSet(set(60, 8, 2), "main", "reps")).toBe(true);
    expect(isHardSet(set(60, 8, null), "main", "reps")).toBe(true);
    expect(isHardSet(set(60, 8, 5), "main", "reps")).toBe(false);
    expect(isHardSet(set(60, 8, 1, true), "main", "reps")).toBe(false);
    expect(isHardSet(set(0, 15, 1), "finisher", "reps")).toBe(false);
    expect(isHardSet(set(0, 30, null), "main", "time")).toBe(false);
  });

  it("primary muscles count 1, secondary 0.5", () => {
    const w = session({
      date: "2026-09-29",
      slots: [
        { exercise_id: "bench", block: "main", target: null, sets: [set(60, 8), set(60, 8), set(60, 7), set(40, 10, null, true)] },
        { exercise_id: "curl", block: "main", target: null, sets: [set(12, 10), set(12, 9)] },
      ],
    });
    const m = muscleSets([w], index);
    expect(m.chest).toBe(3);
    expect(m.triceps).toBe(1.5);
    expect(m.shoulders).toBe(1.5);
    expect(m.biceps).toBe(2);
    expect(m.quads).toBe(0);
  });

  it("tonnage sums working sets only", () => {
    const w = session({ date: "2026-09-29", slots: [{ exercise_id: "squat", block: "main", target: null, sets: [set(40, 10, null, true), set(70, 8), set(70, 6)] }] });
    expect(tonnage([w])).toBe(70 * 8 + 70 * 6);
  });
});

describe("adherence", () => {
  it("caps each exercise at its prescription and compares RIR within ±1", () => {
    const w = session({
      date: "2026-09-29",
      slots: [
        { exercise_id: "squat", block: "main", target: { sets: 4, rir: 1 }, sets: [set(70, 8, 1), set(70, 8, 2), set(70, 7, 3), set(70, 6, 1), set(70, 6, 1)] },
        { exercise_id: "curl", block: "main", target: { sets: 3, rir: null }, sets: [set(12, 10)] },
        { exercise_id: "bench", block: "main", target: null, sets: [set(60, 8)] }, // added: not prescribed
        { exercise_id: "plank", block: "finisher", target: { sets: 3, rir: null }, sets: [] }, // finisher ignored
      ],
    });
    const a = adherence(w);
    expect(a.prescribed).toBe(7);
    expect(a.done).toBe(5); // 4 (capped) + 1
    expect(a.setShare).toBeCloseTo(5 / 7);
    expect(a.rirShare).toBeCloseTo(4 / 5); // RIR 3 is 2 away from target 1
  });

  it("is null without a prescription", () => {
    expect(adherence(session({ date: "2026-09-29", template_id: null, slots: [] })).setShare).toBeNull();
  });
});

describe("lifts over time", () => {
  const sessions = [
    session({ date: "2026-09-08", slots: [{ exercise_id: "squat", block: "main", target: null, sets: [set(60, 8, 1)] }] }),
    session({ date: "2026-09-15", slots: [{ exercise_id: "squat", block: "main", target: null, sets: [set(62.5, 8, 1), set(65, 5, 0)] }] }),
    session({ date: "2026-09-22", slots: [{ exercise_id: "squat", block: "main", target: null, sets: [set(65, 8, 1)] }] }),
    session({ date: "2026-09-29", slots: [{ exercise_id: "bench", block: "main", target: null, sets: [set(50, 8, 1)] }] }),
  ];

  it("history keeps the best set per session", () => {
    const h = liftHistory(sessions, "squat");
    expect(h.map((p) => p.date)).toEqual(["2026-09-08", "2026-09-15", "2026-09-22"]);
    expect(h[1].topSet.weight_kg).toBe(62.5); // 62.5×(1+9/30)=81.25 > 65×(1+5/30)=75.8
  });

  it("weekly series and trend", () => {
    const weekly = weeklyLift(sessions, "squat", "2026-09-29", 4).map((w) => w.e1rm);
    expect(weekly[3]).toBeNull();
    const trend = liftTrendPctPerWeek(weekly)!;
    expect(trend.points).toBe(3);
    expect(trend.pct).toBeGreaterThan(0.03);
  });

  it("main lifts with data, most trained first", () => {
    expect(trainedMainLifts(sessions, index)).toEqual(["squat", "bench"]);
  });

  it("PRs: first session is the baseline, later bests are records", () => {
    const prs = personalRecords(sessions, index);
    expect(prs.map((p) => [p.date, p.kind])).toEqual([
      ["2026-09-15", "e1rm"],
      ["2026-09-15", "weight"],
      ["2026-09-22", "e1rm"],
    ]);
    expect(prs[0].previous).toBeCloseTo(60 * (1 + 9 / 30));
  });
});

describe("weekly summary & load", () => {
  it("aggregates a week", () => {
    const w = session({
      date: "2026-09-29",
      slots: [{ exercise_id: "squat", block: "main", target: { sets: 2, rir: 1 }, sets: [set(40, 10, null, true), set(70, 8, 1), set(70, 8, 1)] }],
    });
    const [week] = weeklyGym([w], index, "2026-09-30", 1);
    expect(week).toMatchObject({ week: "2026-09-28", sessions: 1, workingSets: 2, hardSets: 2, tonnage: 1120, setAdherence: 1, rirAdherence: 1 });
    expect(week.muscles.quads).toBe(2);
  });

  it("only unlinked workouts become load rows (no double counting)", () => {
    const rows = unlinkedWorkoutActivities([
      session({ date: "2026-09-29", slots: [], minutes: 73, session_rpe: 7 }),
      session({ date: "2026-09-28", slots: [], activity_id: "garmin-1" }),
      session({ date: "2026-09-27", slots: [], minutes: null }),
    ]);
    expect(rows).toEqual([
      { date: "2026-09-29", type: "gym", distance_km: null, duration_min: 73, avg_hr: null, max_hr: null, rpe: 7 },
    ]);
  });
});

describe("gym verdicts", () => {
  const zero = { chest: 0, back: 0, shoulders: 0, biceps: 0, triceps: 0, quads: 0, hamstrings: 0, glutes: 0, calves: 0, core: 0 };

  it("muscle volume: ranges, ceiling, not enough data", () => {
    expect(assessMuscleVolume(null).status).toBe("na");
    expect(assessMuscleVolume(zero).status).toBe("na");
    const ok = { ...zero, chest: 11, back: 12, shoulders: 13, biceps: 12, triceps: 12, quads: 10, hamstrings: 8, glutes: 16 };
    expect(assessMuscleVolume(ok)).toMatchObject({ status: "good", value: "7/8 in range" });
    expect(assessMuscleVolume({ ...ok, glutes: 24 }).status).toBe("watch");
    expect(assessMuscleVolume({ ...ok, quads: 6, hamstrings: 5, calves: 0, chest: 4 }).message).toContain("hamstrings");
  });

  it("strength trend", () => {
    expect(assessStrengthTrend([]).status).toBe("na");
    expect(assessStrengthTrend([{ name: "Squat", pct: 0.02 }, { name: "Bench", pct: 0.01 }]).status).toBe("good");
    expect(assessStrengthTrend([{ name: "Squat", pct: -0.02 }, { name: "Bench", pct: 0.01 }]).status).toBe("off");
    expect(assessStrengthTrend([{ name: "Squat", pct: 0 }, { name: "Bench", pct: 0.001 }, { name: "Row", pct: 0.02 }]).status).toBe("watch");
  });

  it("frequency and adherence", () => {
    expect(assessGymFrequency([3, 3, 2], 3).status).toBe("good");
    expect(assessGymFrequency([2, 1], 3).status).toBe("watch");
    expect(assessAdherence(0.95).status).toBe("good");
    expect(assessAdherence(0.8).status).toBe("watch");
    expect(assessAdherence(0.5).status).toBe("off");
    expect(assessAdherence(null).status).toBe("na");
  });
});
