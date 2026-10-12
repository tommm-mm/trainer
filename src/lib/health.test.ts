import { describe, expect, it } from "vitest";
import { ago, healthRows, pushRow, syncRow, tickRow, worst } from "./health";

const now = new Date("2026-10-12T10:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe("ago", () => {
  it("reads like a person", () => {
    expect(ago(hoursAgo(0.01), now)).toBe("just now");
    expect(ago(hoursAgo(0.5), now)).toBe("30 min ago");
    expect(ago(hoursAgo(5), now)).toBe("5 h ago");
    expect(ago(hoursAgo(80), now)).toBe("3 days ago");
  });
});

describe("syncRow", () => {
  it("is ok within 24 h, amber after, red after 72 h", () => {
    expect(syncRow({ lastSyncAt: hoursAgo(2), lastSyncError: null }, now).level).toBe("ok");
    expect(syncRow({ lastSyncAt: hoursAgo(25), lastSyncError: null }, now).level).toBe("amber");
    expect(syncRow({ lastSyncAt: hoursAgo(73), lastSyncError: null }, now).level).toBe("red");
  });
  it("a failed last attempt is amber even when recent, and shows why", () => {
    expect(syncRow({ lastSyncAt: hoursAgo(1), lastSyncError: "intervals.icu 401" }, now))
      .toMatchObject({ level: "amber", detail: "Last attempt failed: intervals.icu 401" });
  });
  it("never synced: amber, red when it only ever failed", () => {
    expect(syncRow({ lastSyncAt: null, lastSyncError: null }, now).level).toBe("amber");
    expect(syncRow({ lastSyncAt: null, lastSyncError: "boom" }, now).level).toBe("red");
  });
});

describe("tickRow", () => {
  const ok = { tickAt: hoursAgo(0.05), tickStatus: "succeeded", httpStatus: 200, cronActive: true };
  it("ok when the 5-minute job ran and the app answered 200", () => {
    expect(tickRow(ok, now).level).toBe("ok");
  });
  it("red when off, failed, never ran or silent > 15 min", () => {
    expect(tickRow({ ...ok, cronActive: false }, now).level).toBe("red");
    expect(tickRow({ ...ok, tickStatus: "failed" }, now).level).toBe("red");
    expect(tickRow({ ...ok, tickAt: null }, now).level).toBe("red");
    expect(tickRow({ ...ok, tickAt: hoursAgo(0.5) }, now).level).toBe("red");
  });
  it("amber when the app didn't answer 200", () => {
    expect(tickRow({ ...ok, httpStatus: 401 }, now)).toMatchObject({ level: "amber", detail: "The app answered 401." });
  });
});

describe("healthRows / worst", () => {
  it("the last notification is information only", () => {
    expect(pushRow({ lastPushAt: null }, now)).toMatchObject({ value: "none yet", level: "info" });
  });
  it("worst picks red over amber over ok", () => {
    const rows = healthRows({
      lastSyncAt: hoursAgo(30), lastSyncError: null,
      tickAt: hoursAgo(0.05), tickStatus: "succeeded", httpStatus: 200, cronActive: true, lastPushAt: null,
    }, now);
    expect(rows.map((r) => r.level)).toEqual(["amber", "ok", "info"]);
    expect(worst(rows)).toBe("amber");
    expect(worst([{ ...rows[0], level: "red" }, rows[1]])).toBe("red");
  });
});
