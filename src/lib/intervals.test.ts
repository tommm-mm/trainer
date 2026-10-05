import { describe, expect, it } from "vitest";
import { classifyActivity, mapActivity } from "./intervals";

describe("classifyActivity", () => {
  it("keeps runs and weight training", () => {
    expect(classifyActivity("Run", "Rotterdam Running")).toBe("run");
    expect(classifyActivity("TrailRun", null)).toBe("run");
    expect(classifyActivity("WeightTraining", "Pesi")).toBe("gym");
  });

  it("splits HIIT finishers from strength", () => {
    expect(classifyActivity("Workout", "Cardio")).toBe("cardio");
    expect(classifyActivity("HIIT", null)).toBe("cardio");
    // Strength that intervals.icu types as a generic workout.
    expect(classifyActivity("Workout", "Pesi")).toBe("gym");
    expect(classifyActivity("Workout", "Strength")).toBe("gym");
  });

  it("keeps bike and swim as cross-training", () => {
    expect(classifyActivity("Ride", "Bike")).toBe("cross");
    expect(classifyActivity("VirtualRide", "Cyclette")).toBe("cross");
    expect(classifyActivity("Swim", null)).toBe("cross");
    expect(classifyActivity("OpenWaterSwim", null)).toBe("cross");
  });

  it("skips other sports", () => {
    expect(classifyActivity("Walk", null)).toBeNull();
    expect(classifyActivity("Golf", null)).toBeNull();
  });
});

describe("mapActivity", () => {
  it("stores the raw intervals.icu type", () => {
    const row = mapActivity({
      id: "i1",
      type: "Workout",
      name: "Cardio",
      start_date_local: "2026-09-25T18:40:00",
      moving_time: 726,
      average_heartrate: 129,
    });
    expect(row).toMatchObject({ type: "cardio", sport_type: "Workout", date: "2026-09-25", duration_min: 12.1 });
  });
});
