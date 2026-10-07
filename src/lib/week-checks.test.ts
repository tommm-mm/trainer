import { describe, expect, it } from "vitest";
import type { WeekTargets } from "@/lib/season/model";
import { checkWeek, legHeaviest, legSets, type PlanInput, type TemplateLegs } from "./week-checks";

// Real templates: loaded leg sets A = 3 (squat), B = 3 (hip thrust; box jumps have no RIR), C = 6 (RDL + split squat).
const templates: TemplateLegs[] = [
  { id: "A", name: "Full body A", legSets: 3 },
  { id: "B", name: "Full body B", legSets: 3 },
  { id: "C", name: "Full body C", legSets: 6 },
];
const p = (day: string, session_type: string, km: number | null = null, template_id: string | null = null): PlanInput => ({
  day,
  session_type,
  target_distance_km: km,
  template_id,
});

// The agreed week from 12 Oct: gym Mon C / Wed A / Fri B, runs Tue/Thu/Sat/Sun.
const standard = [
  p("2026-10-11", "long_run", 13), // previous Sunday
  p("2026-10-12", "gym_full", null, "C"),
  p("2026-10-13", "easy_run", 7),
  p("2026-10-14", "gym_full", null, "A"),
  p("2026-10-15", "tempo", 9),
  p("2026-10-16", "gym_full", null, "B"),
  p("2026-10-17", "easy_run", 6),
  p("2026-10-18", "long_run", 14),
  p("2026-10-19", "gym_full", null, "C"), // next Monday
];
const target = { week_start: "2026-10-12", run_km: 36, long_run_km: 14, runs: 4, quality_sessions: 1, gym_sessions: 3 };
const check = (plans: PlanInput[], t: WeekTargets | null = target) => checkWeek({ monday: "2026-10-12", plans, templates, target: t });

describe("legSets / legHeaviest", () => {
  it("counts loaded leg sets only", () => {
    expect(
      legSets([
        { block: "main", sets: 3, target_rir: null, primary_muscles: ["quads", "glutes"] }, // box jump
        { block: "main", sets: 3, target_rir: 3, primary_muscles: ["glutes"] }, // hip thrust
        { block: "main", sets: 3, target_rir: 2, primary_muscles: ["calves"] },
        { block: "finisher", sets: 3, target_rir: 2, primary_muscles: ["glutes", "hamstrings"] }, // swings
      ]),
    ).toBe(3);
  });

  it("picks C as the leg-heaviest of the real templates", () => {
    expect([...legHeaviest(templates)]).toEqual(["C"]);
    expect(legHeaviest([{ id: "x", name: "Upper", legSets: 0 }]).size).toBe(0);
  });
});

describe("checkWeek", () => {
  it("passes the agreed week with no warnings", () => {
    expect(check(standard)).toEqual([]);
  });

  it("red: gym and a hard run on the same day", () => {
    const c = check([...standard.filter((x) => x.day !== "2026-10-14"), p("2026-10-15", "gym_full", null, "A")]);
    expect(c.map((x) => [x.severity, x.code])).toContainEqual(["red", "gym_hard_same_day"]);
    expect(c[0].message).toBe("Thu: Full body A and a tempo on the same day. Keep gym and hard runs on separate days.");
  });

  it("red: hard runs back to back, including across the week boundary", () => {
    const c = check([p("2026-10-10", "long_run", 13), p("2026-10-11", "intervals", 8), p("2026-10-12", "tempo", 8)], null);
    // Sat → Sun is entirely last week: not reported; Sun → Mon touches this week
    expect(c.filter((x) => x.code === "hard_back_to_back").map((x) => x.days)).toEqual([["2026-10-11", "2026-10-12"]]);
  });

  it("red the day before, amber two days before: leg-heaviest session and a key run", () => {
    const before = check([...standard.filter((x) => x.day !== "2026-10-12"), p("2026-10-14", "gym_full", null, "C")].filter((x) => !(x.day === "2026-10-14" && x.template_id === "A")));
    expect(before.find((x) => x.code === "legs_before_hard")).toMatchObject({ severity: "red", days: ["2026-10-14", "2026-10-15"] });
    const twoDays = check([...standard.filter((x) => x.template_id !== "B"), p("2026-10-16", "gym_full", null, "C")]);
    expect(twoDays.find((x) => x.code === "legs_before_hard")).toMatchObject({ severity: "amber", days: ["2026-10-16", "2026-10-18"] });
  });

  it("A the day before the tempo is fine (not the leg-heaviest)", () => {
    expect(check(standard).some((x) => x.code === "legs_before_hard")).toBe(false);
  });

  it("amber: gym on consecutive days", () => {
    const c = check([...standard.filter((x) => x.template_id !== "A"), p("2026-10-13", "gym_full", null, "A")]);
    expect(c.find((x) => x.code === "gym_back_to_back")).toMatchObject({ severity: "amber", days: ["2026-10-12", "2026-10-13"] });
  });

  it("amber totals: gym count, runs, quality, long run, km", () => {
    const plans = [
      p("2026-10-12", "gym_full", null, "C"),
      p("2026-10-13", "tempo", 9),
      p("2026-10-15", "intervals", 8),
      p("2026-10-17", "fartlek", 8),
      p("2026-10-18", "easy_run", 8),
      p("2026-10-16", "easy_run", 12),
    ];
    const codes = check(plans).map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["gym_count", "runs_count", "quality_count", "long_run", "km"]));
    expect(check(plans).find((x) => x.code === "gym_count")?.message).toBe(
      "1 gym session planned, the block calls for 3. Reschedule rather than drop.",
    );
  });

  it("orders red before amber, ignores rest and mobility", () => {
    const c = check([...standard, p("2026-10-15", "gym_full", null, "A"), p("2026-10-16", "mobility"), p("2026-10-16", "rest")]);
    expect(c[0].severity).toBe("red");
    expect(c.at(-1)!.severity).toBe("amber");
  });
});
