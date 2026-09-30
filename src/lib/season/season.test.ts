import { describe, expect, it } from "vitest";
import {
  diffWeeks,
  flattenWeeks,
  guardrails,
  summarize,
  validateSeasonDraft,
  type BlockDraft,
  type SeasonDraft,
} from "./model";
import { currentPosition, judgeWeek, weeklyActuals } from "./progress";
import { effortTable, hrAt } from "./efforts";
import { PADOVA_2027 } from "./drafts/padova-2027";

const block = (name: string, focus: BlockDraft["focus"], weeks: BlockDraft["weeks"]): BlockDraft => ({
  name,
  focus,
  weeks,
});

const draft = (blocks: BlockDraft[]): SeasonDraft => ({ title: "Test", source: "manual", blocks });

describe("validateSeasonDraft", () => {
  it("accepts a well-formed draft", () => {
    const d = draft([
      block("Base", "base", [
        { week_start: "2026-09-28", run_km: 30, long_run_km: 12 },
        { week_start: "2026-10-05", run_km: 32, long_run_km: 13 },
      ]),
    ]);
    expect(validateSeasonDraft(d).errors).toEqual([]);
  });

  it("rejects non-Mondays, gaps, bad ranges and long > week", () => {
    const d = draft([
      block("Base", "base", [
        { week_start: "2026-09-29", run_km: 30 },
        { week_start: "2026-10-12", run_km: 400 },
        { week_start: "2026-10-19", run_km: 20, long_run_km: 25 },
      ]),
    ]);
    const { errors, warnings } = validateSeasonDraft(d);
    expect(errors.some((e) => e.includes("must be a Monday"))).toBe(true);
    expect(errors.some((e) => e.includes("run_km must be 0–300"))).toBe(true);
    expect(errors.some((e) => e.includes("longer than the whole week"))).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("flags a gap between weeks", () => {
    const d = draft([
      block("A", "base", [{ week_start: "2026-09-28" }]),
      block("B", "build", [{ week_start: "2026-10-12" }]),
    ]);
    expect(validateSeasonDraft(d).errors.join()).toContain("no gaps or overlaps");
  });

  it("rejects unknown focus, empty blocks and blocks over 8 weeks", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      week_start: new Date(Date.UTC(2026, 8, 28 + 7 * i)).toISOString().slice(0, 10),
    }));
    const d = draft([
      { name: "X", focus: "bulk" as never, weeks: [] },
      block("Long", "base", nine),
    ]);
    const errors = validateSeasonDraft(d).errors.join("\n");
    expect(errors).toContain('unknown focus "bulk"');
    expect(errors).toContain("needs 1–8 weeks");
  });

  it("locks past weeks against the approved version", () => {
    const approved = [{ week_start: "2026-09-21", run_km: 29 }];
    const d = draft([
      block("A", "base", [
        { week_start: "2026-09-21", run_km: 35 },
        { week_start: "2026-09-28", run_km: 31 },
      ]),
    ]);
    const res = validateSeasonDraft(d, { approved, today: "2026-09-30" });
    expect(res.errors).toEqual(["Week 2026-09-21 is in the past and can't change."]);
    const same = draft([block("A", "base", [{ week_start: "2026-09-21", run_km: 29 }])]);
    expect(validateSeasonDraft(same, { approved, today: "2026-09-30" }).errors).toEqual([]);
  });
});

describe("guardrails", () => {
  const weeks = (kms: (number | [number, boolean])[], start = "2026-09-28") =>
    flattenWeeks([
      block(
        "B",
        "build",
        kms.map((k, i) => {
          const [run_km, is_deload] = Array.isArray(k) ? k : [k, false];
          const d = new Date(`${start}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 7 * i);
          return { week_start: d.toISOString().slice(0, 10), run_km, is_deload };
        }),
      ),
    ]);

  it("warns on a ramp over 10% of the recent high, not on small steps", () => {
    const codes = guardrails(weeks([30, 32, 40])).map((g) => [g.week_start, g.code]);
    expect(codes).toEqual([["2026-10-12", "ramp"]]);
    // +3 km at 20 km is +15% but small in absolute terms.
    expect(guardrails(weeks([20, 23])).filter((g) => g.code === "ramp")).toEqual([]);
  });

  it("compares a post-deload week with the last build weeks, not the deload", () => {
    expect(guardrails(weeks([40, 42, [30, true], 44])).filter((g) => g.code === "ramp")).toEqual([]);
  });

  it("warns after more than 4 build weeks without a lighter week", () => {
    const g = guardrails(weeks([30, 31, 32, 33, 34, 35]));
    expect(g.filter((x) => x.code === "deload").map((x) => x.week_start)).toEqual(["2026-10-26"]);
  });

  it("projects ACWR from history and planned weeks", () => {
    const history = [20, 20, 20, 20].map((run_km, i) => ({ week_start: `h${i}`, run_km }));
    const g = guardrails(weeks([30]), { history });
    expect(g.map((x) => x.code)).toContain("acwr");
    expect(guardrails(weeks([24]), { history }).map((x) => x.code)).not.toContain("acwr");
  });

  it("checks long-run share and caps, but skips race weeks", () => {
    const w = flattenWeeks([
      block("B", "build", [
        { week_start: "2026-09-28", run_km: 30, long_run_km: 18, runs: 7 },
        { week_start: "2026-10-05", run_km: 30, long_run_km: 21, runs: 7 },
      ]),
    ]);
    const g = guardrails(w, { limits: { max_runs_per_week: 6 }, raceDates: ["2026-10-11"] });
    expect(g.map((x) => [x.week_start, x.code])).toEqual([
      ["2026-09-28", "long_share"],
      ["2026-09-28", "cap"],
    ]);
  });

  it("warns when the season doesn't end in the goal race week", () => {
    const g = guardrails(weeks([30, 30]), { goalDate: "2027-04-18" });
    expect(g.at(-1)?.code).toBe("race_week");
  });
});

describe("diffWeeks", () => {
  it("lists changed, added and removed weeks only", () => {
    const before = [
      { week_start: "2026-09-28", run_km: 31, key_session: "Tempo" },
      { week_start: "2026-10-05", run_km: 33 },
      { week_start: "2026-10-12", run_km: 35 },
    ];
    const after = [
      { week_start: "2026-09-28", run_km: 31, key_session: "Tempo" },
      { week_start: "2026-10-05", run_km: 30, is_deload: true },
      { week_start: "2026-10-19", run_km: 36 },
    ];
    const d = diffWeeks(before, after);
    expect(d.map((x) => [x.week_start, x.kind, x.fields])).toEqual([
      ["2026-10-05", "changed", ["run_km", "is_deload"]],
      ["2026-10-12", "removed", []],
      ["2026-10-19", "added", []],
    ]);
  });

  it("treats numeric strings from Postgres as numbers", () => {
    expect(diffWeeks([{ week_start: "2026-09-28", run_km: "31.0" as never }], [{ week_start: "2026-09-28", run_km: 31 }])).toEqual([]);
  });
});

describe("progress", () => {
  const blocks = [
    { name: "Base 1", focus: "base", weeks: [{ week_start: "2026-09-28" }, { week_start: "2026-10-05" }] },
    { name: "Base 2", focus: "base", weeks: [{ week_start: "2026-10-12" }] },
  ];

  it("finds the block and week for today", () => {
    expect(currentPosition(blocks, "2026-10-14")).toMatchObject({
      blockIndex: 1,
      weekInBlock: 1,
      blockWeeks: 1,
      seasonWeek: 3,
      seasonWeeks: 3,
    });
    expect(currentPosition(blocks, "2026-09-27")).toBeNull();
  });

  it("sums runs per week and counts gym days once", () => {
    const a = weeklyActuals(
      [
        { date: "2026-09-29", type: "run", distance_km: 6.23 },
        { date: "2026-09-30", type: "run", distance_km: 7 },
        { date: "2026-09-28", type: "gym", distance_km: null },
        { date: "2026-09-29", type: "gym", distance_km: null },
        { date: "2026-09-29", type: "cardio", distance_km: null },
      ],
      ["2026-09-29", "2026-10-01"],
    );
    expect(a.get("2026-09-28")).toEqual({ run_km: 13.2, runs: 2, long_run_km: 7, gym_sessions: 3 });
  });

  it("judges a week on the ±6% band", () => {
    expect(judgeWeek(31, 30, "2026-09-28", "2026-10-05")).toBe("on_target");
    expect(judgeWeek(31, 34, "2026-09-28", "2026-10-05")).toBe("ahead");
    expect(judgeWeek(31, 12, "2026-09-28", "2026-09-30")).toBe("open");
    expect(judgeWeek(31, 25, "2026-09-28", "2026-10-05")).toBe("short");
    expect(judgeWeek(31, 12, "2026-09-28", "2026-10-05")).toBe("missed");
  });
});

describe("efforts", () => {
  it("maps %HRR to bpm on your anchors and paces off marathon pace", () => {
    const anchors = { rest: 46, max: 195 };
    expect(hrAt(0.75, anchors)).toBe(158);
    const rows = effortTable(anchors, 299);
    const easy = rows.find((r) => r.key === "easy")!;
    expect([easy.hrLow, easy.hrHigh]).toEqual([143, 157]);
    expect(easy.pace).toEqual([374, 339]);
    expect(rows.find((r) => r.key === "marathon")!.pace).toEqual([304, 294]);
    expect(effortTable(anchors, null)[0].pace).toBeNull();
  });
});

describe("Padova 2027 draft", () => {
  it("is valid and passes its own guardrails from the current base", () => {
    // Actual run km, the 4 full weeks before the season (Garmin).
    const history = [
      { week_start: "2026-08-31", run_km: 26.3 },
      { week_start: "2026-09-07", run_km: 14.8 },
      { week_start: "2026-09-14", run_km: 26.4 },
      { week_start: "2026-09-21", run_km: 29.1 },
    ];
    const res = validateSeasonDraft(PADOVA_2027, {
      history,
      raceDates: ["2027-03-07"],
      goalDate: "2027-04-18",
    });
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
  });

  it("has the agreed headline numbers", () => {
    expect(summarize(PADOVA_2027.blocks, "2027-04-18")).toEqual({
      start: "2026-09-28",
      end: "2027-04-18",
      weeks: 29,
      blocks: 7,
      peakKm: 63,
      peakWeek: "2027-03-15",
      longestRun: 30,
      deloads: 6,
    });
    const runs = flattenWeeks(PADOVA_2027.blocks).map((w) => w.runs ?? 0);
    expect(Math.max(...runs)).toBe(6);
  });
});
