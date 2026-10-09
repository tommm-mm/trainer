import { describe, expect, it } from "vitest";
import { buildMessages, proposalMessage } from "./messages";

describe("proposalMessage", () => {
  it("summarises everything open in one line", () => {
    expect(proposalMessage({ plans: 5, changes: 2, seasons: 1, first_week: "2026-10-12" })).toEqual({
      title: "Cowork has a proposal",
      body: "5 sessions, 2 changes and a new season version to approve. Tap to review.",
      url: "/",
      tag: "proposals",
    });
    expect(proposalMessage({ plans: 1, changes: 0, seasons: 0, first_week: "2026-10-12" })).toMatchObject({
      body: "1 session to approve. Tap to review.",
      url: "/?week=2026-10-12",
    });
    expect(proposalMessage({ plans: 0, changes: 0, seasons: 1, first_week: null })).toMatchObject({
      body: "A new season version to approve. Tap to review.",
      url: "/season?view=proposed",
    });
  });

  it("stays quiet when everything was already approved", () => {
    expect(proposalMessage({ plans: 0, changes: 0, seasons: 0, first_week: null })).toBeNull();
  });
});

describe("buildMessages", () => {
  it("proposals first, then the check-in reminder", () => {
    expect(buildMessages({ proposals: { plans: 0, changes: 1, seasons: 0, first_week: null }, checkin: true }).map((m) => m.tag))
      .toEqual(["proposals", "checkin"]);
    expect(buildMessages({ proposals: null, checkin: false })).toEqual([]);
  });
});
