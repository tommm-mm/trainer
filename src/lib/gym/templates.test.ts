import { describe, expect, it } from "vitest";
import { focusLabel, forFocus } from "./templates";

const A = { id: "A", gym_focus: ["hypertrophy"] };
const S = { id: "S", gym_focus: ["strength", "maintenance"] };
const any = { id: "any", gym_focus: null };

describe("forFocus", () => {
  it("keeps the block's templates and the untagged ones", () => {
    expect(forFocus([A, S, any], "strength").map((t) => t.id)).toEqual(["S", "any"]);
    expect(forFocus([A, S, any], "hypertrophy").map((t) => t.id)).toEqual(["A", "any"]);
  });
  it("falls back to everything: outside the season, or when nothing matches", () => {
    expect(forFocus([A, S], null)).toHaveLength(2);
    expect(forFocus([A, S], "power")).toHaveLength(2);
    expect(forFocus([{ id: "e", gym_focus: [] }, A], "power").map((t) => t.id)).toEqual(["e"]);
  });
  it("labels", () => {
    expect(focusLabel(null)).toBe("every block");
    expect(focusLabel(["strength", "maintenance"])).toBe("strength, maintenance");
  });
});
