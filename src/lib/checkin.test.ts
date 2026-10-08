import { describe, expect, it } from "vitest";
import { isNiggle, niggleFlag } from "./checkin";

describe("niggleFlag", () => {
  it("flags a calf score from 2 and any niggle", () => {
    expect(niggleFlag(0, null)).toBeNull();
    expect(niggleFlag(1, null)).toBeNull();
    expect(niggleFlag(null, null)).toBeNull();
    expect(niggleFlag(2, null)).toBe("Calves 2/3 (tight / sore)");
    expect(niggleFlag(3, "achilles", " left side ")).toBe("Calves 3/3 (it limits me) · niggle: Achilles. left side");
    expect(niggleFlag(0, "knee")).toBe("niggle: Knee");
  });
  it("knows the areas", () => {
    expect(isNiggle("lower_back")).toBe(true);
    expect(isNiggle("neck")).toBe(false);
  });
});
