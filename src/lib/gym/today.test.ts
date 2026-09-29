import { describe, expect, it } from "vitest";
import { nextTemplate, todayAction, type TodayInput } from "./today";

const templates = [
  { id: "A", name: "Full body A" },
  { id: "B", name: "Full body B" },
  { id: "C", name: "Full body C" },
];

const base: TodayInput = {
  today: "2026-10-01", // Thursday
  inProgress: false,
  plannedToday: [],
  gymDoneToday: false,
  runDoneToday: false,
  gymDatesThisWeek: ["2026-09-29"],
  lastGymDate: "2026-09-29",
  gymTarget: 3,
  templates,
  lastTemplateId: "B",
};

describe("nextTemplate", () => {
  it("rotates after the last one done, wrapping around", () => {
    expect(nextTemplate(templates, "B")?.id).toBe("C");
    expect(nextTemplate(templates, "C")?.id).toBe("A");
    expect(nextTemplate(templates, null)?.id).toBe("A");
    expect(nextTemplate([], "A")).toBeNull();
  });
});

describe("todayAction", () => {
  it("an open workout comes first, then today's plan", () => {
    expect(todayAction({ ...base, inProgress: true }).kind).toBe("resume");
    const plan = { id: "p", label: "Long run", kind: "run" as const, templateId: null };
    expect(todayAction({ ...base, plannedToday: [plan] })).toMatchObject({ kind: "plan", planId: "p" });
  });

  it("suggests the next template when gym sessions are due and 48 h have passed", () => {
    const a = todayAction(base);
    expect(a).toMatchObject({ kind: "gym", templateId: "C" });
    // 2 left, Thu–Sun = 4 days → exactly enough room: flagged as urgent.
    expect(a.kind === "gym" && a.reason).toContain("running out");
  });

  it("respects 48 h between full-body sessions", () => {
    const a = todayAction({ ...base, lastGymDate: "2026-09-30", gymDatesThisWeek: ["2026-09-30"] });
    expect(a.kind).toBe("run-or-rest");
  });

  it("gym done today / target met", () => {
    expect(todayAction({ ...base, gymDoneToday: true }).kind).toBe("done");
    const met = todayAction({ ...base, gymDatesThisWeek: ["a", "b", "c"], lastGymDate: "2026-09-28" });
    expect(met).toMatchObject({ kind: "run-or-rest" });
    expect(met.kind === "run-or-rest" && met.reason).toContain("target met");
  });
});
