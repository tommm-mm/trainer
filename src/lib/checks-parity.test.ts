import { describe, expect, it } from "vitest";
import fixtures from "./checks.fixtures.json";
import { seasonResult, weekResult, type SeasonCase, type WeekCase } from "./checks-parity";

// The same cases are run against the SQL functions (check_season_draft,
// check_week) by scripts/sql-parity.mjs: if a rule changes in the app, this
// test fails until the fixtures (and the SQL) are updated too.
describe("draft checks: app side of the SQL parity cases", () => {
  for (const c of fixtures.season as unknown as SeasonCase[]) {
    it(`season: ${c.name}`, () => expect(seasonResult(c)).toEqual(c.expect));
  }
  for (const c of fixtures.week as unknown as WeekCase[]) {
    it(`week: ${c.name}`, () => expect(weekResult(c)).toEqual(c.expect));
  }
});
