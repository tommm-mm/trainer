// Padova Marathon 2027 (18 Apr, goal 3:30), written by Claude Code on
// 30 Sep 2026 from your data: last 4 full weeks 24.2 km average (29.1 km the
// week of 21 Sep), long run 12 km, every run easy (66–72% HRR). It is loaded
// as a proposal; nothing applies until you approve it on the Season page.
//
// Shape: 29 weeks, 3 build weeks + 1 lighter week, +1.7 km per build week on
// average (~4–6%, under the 10% guide), peak 63 km, longest run 30 km (≈ 3 h,
// done twice: Bologna and 21 Mar), 3-week taper (−20/−40/−60%).

import type { SeasonDraft } from "../model";

export const PADOVA_2027_LIMITS = {
  max_runs_per_week: 6,
  max_week_km: 65,
  max_long_run_km: 30,
  max_gym_per_week: 3,
};

export const PADOVA_2027: SeasonDraft = {
  title: "Padova Marathon 2027 · 3:30",
  source: "claude_code",
  limits: PADOVA_2027_LIMITS,
  rationale:
    "29 weeks is enough time: getting from 31 to a 63 km peak only needs about +1.7 km per build week " +
    "(≈4–6%), well under the 10% guide, which leaves roughly 2 weeks of slack for illness or busy weeks. " +
    "Base grows frequency before distance (4 → 5 runs) and keeps one light quality session a week. " +
    "Build adds threshold work and marathon-pace finishes, Specific makes marathon pace the main work, " +
    "and Bologna (7 Mar) is a B race inside that block. The longest run is capped at 30 km (≈ 3 h at easy pace): " +
    "at a 63 km peak that is already ~48% of the week, and longer runs add injury risk more than fitness. " +
    "Gym stays at 3× full body in Base, moves to heavier strength work in Build and to maintenance (≈⅓ of the " +
    "volume keeps strength, Bickel 2011) from February. Pace targets get reset by the tests on 31 Oct and 14 Nov " +
    "and by a 10 km in late January.",
  blocks: [
    {
      name: "Base 1",
      focus: "base",
      gym_focus: "hypertrophy",
      purpose: "Build the habit and the aerobic floor: 4 → 5 runs, long run 12 → 15 km, nearly everything easy.",
      key_sessions: "1 light quality session (tempo 20–25′ or fartlek) · strides 4×20″ twice a week · gym 3× full body",
      weeks: [
        { week_start: "2026-09-28", run_km: 31, long_run_km: 12, runs: 4, quality_sessions: 1, gym_sessions: 3, key_session: "Tempo 20′ (Wed) · long run 12 km easy" },
        { week_start: "2026-10-05", run_km: 32, long_run_km: 13, runs: 4, quality_sessions: 1, gym_sessions: 3, key_session: "Tempo 2×10′ with 2′ jog · strides 4×20″" },
        { week_start: "2026-10-12", run_km: 35, long_run_km: 14, runs: 5, quality_sessions: 1, gym_sessions: 3, key_session: "Fartlek 8×1′ fast / 1′ easy · 5th run: 5 km recovery" },
        { week_start: "2026-10-19", run_km: 37, long_run_km: 15, runs: 5, quality_sessions: 1, gym_sessions: 3, key_session: "Tempo 25′ continuous · strides" },
        { week_start: "2026-10-26", is_deload: true, run_km: 28, long_run_km: 10, runs: 4, quality_sessions: 1, gym_sessions: 2, key_session: "Easy week, then the 5 km time trial", milestone: "5 km time trial · Sat 31 Oct" },
      ],
    },
    {
      name: "Base 2",
      focus: "base",
      gym_focus: "hypertrophy",
      purpose: "5 runs a week becomes normal. Hills add strength to the legs, threshold gets measured.",
      key_sessions: "Hill repeats or tempo · strides · gym 3×",
      weeks: [
        { week_start: "2026-11-02", run_km: 37, long_run_km: 15, runs: 5, quality_sessions: 1, gym_sessions: 3, key_session: "Hills 8×45″ uphill hard, jog down · strides" },
        { week_start: "2026-11-09", run_km: 39, long_run_km: 16, runs: 5, quality_sessions: 1, gym_sessions: 3, key_session: "30′ solo threshold test (avg HR of last 20′ = threshold HR)", milestone: "30′ threshold test · Sat 14 Nov" },
        { week_start: "2026-11-16", run_km: 41, long_run_km: 17, runs: 5, quality_sessions: 1, gym_sessions: 3, key_session: "Hills 10×45″ · long run with last 2 km steady" },
        { week_start: "2026-11-23", is_deload: true, run_km: 31, long_run_km: 12, runs: 4, quality_sessions: 1, gym_sessions: 2, key_session: "Easy week · strides 6×20″" },
      ],
    },
    {
      name: "Build 1",
      focus: "build",
      gym_focus: "strength",
      purpose: "Raise threshold: cruise intervals at the pace from the November test. Gym gets heavier with fewer sets.",
      key_sessions: "Threshold cruise intervals · occasional VO₂ repeats · long run easy · gym 2–3× strength",
      weeks: [
        { week_start: "2026-11-30", run_km: 42, long_run_km: 18, runs: 5, quality_sessions: 1, gym_sessions: 3, key_session: "Cruise intervals 3×8′ @ threshold, 2′ jog" },
        { week_start: "2026-12-07", run_km: 45, long_run_km: 19, runs: 5, quality_sessions: 2, gym_sessions: 2, key_session: "Cruise 3×10′ @ threshold · VO₂ 5×3′ @ 5 km effort" },
        { week_start: "2026-12-14", run_km: 47, long_run_km: 20, runs: 5, quality_sessions: 1, gym_sessions: 2, key_session: "Tempo 30′ continuous @ threshold" },
        { week_start: "2026-12-21", is_deload: true, run_km: 36, long_run_km: 14, runs: 4, quality_sessions: 1, gym_sessions: 2, key_session: "Easy week · strides" },
      ],
    },
    {
      name: "Build 2",
      focus: "build",
      gym_focus: "strength",
      purpose: "First marathon-pace work at the end of long runs. The 10 km in late January checks that 3:30 is realistic.",
      key_sessions: "Threshold + MP finishes in long runs · gym 2× strength",
      weeks: [
        { week_start: "2026-12-28", run_km: 48, long_run_km: 21, runs: 5, quality_sessions: 1, gym_sessions: 2, key_session: "Long run 21 km with the last 4 km @ MP" },
        { week_start: "2027-01-04", run_km: 51, long_run_km: 22, runs: 5, quality_sessions: 2, gym_sessions: 2, key_session: "Cruise 4×8′ @ threshold · long run with last 5 km @ MP" },
        { week_start: "2027-01-11", run_km: 53, long_run_km: 24, runs: 5, quality_sessions: 2, gym_sessions: 2, key_session: "MP 2×5 km with 3′ jog · long run 24 km easy" },
        { week_start: "2027-01-18", is_deload: true, run_km: 42, long_run_km: 16, runs: 4, quality_sessions: 1, gym_sessions: 2, key_session: "Easy week, then the 10 km. ≈ 45:15 means 3:30 shape (Daniels VDOT 45)", milestone: "10 km race or time trial · Sun 24 Jan (swap in a real race if you find one)" },
      ],
    },
    {
      name: "Specific",
      focus: "specific",
      gym_focus: "maintenance",
      purpose: "Marathon pace becomes the main work. Long runs reach 28–30 km. Bologna is a B race at the end.",
      key_sessions: "MP runs · threshold · long runs with MP blocks · gym 2× maintenance",
      weeks: [
        { week_start: "2027-01-25", run_km: 54, long_run_km: 24, runs: 5, quality_sessions: 2, gym_sessions: 2, key_session: "MP 3×4 km with 2′ jog · long run 24 km" },
        { week_start: "2027-02-01", run_km: 57, long_run_km: 26, runs: 6, quality_sessions: 2, gym_sessions: 2, key_session: "Threshold 2×15′ · long run 26 km, last 6 km @ MP" },
        { week_start: "2027-02-08", run_km: 60, long_run_km: 28, runs: 6, quality_sessions: 2, gym_sessions: 2, key_session: "MP 12 km continuous · long run 28 km easy" },
        { week_start: "2027-02-15", is_deload: true, run_km: 46, long_run_km: 18, runs: 5, quality_sessions: 1, gym_sessions: 2, key_session: "Easy week · 6 km @ MP inside a mid-week run" },
        { week_start: "2027-02-22", run_km: 60, long_run_km: 28, runs: 6, quality_sessions: 2, gym_sessions: 2, key_session: "Threshold 3×10′ · long run 28 km with the last 8 km @ MP" },
        { week_start: "2027-03-01", run_km: 52, long_run_km: 30, runs: 5, quality_sessions: 1, gym_sessions: 1, key_session: "3 easy days before Bologna. Race plan to decide together", milestone: "Bologna 30 km · Sun 7 Mar (B race)" },
      ],
    },
    {
      name: "Peak",
      focus: "peak",
      gym_focus: "maintenance",
      purpose: "Recover from Bologna, then the biggest week of the season and the last 30 km run.",
      key_sessions: "MP 14 km · last 30 km long run · 6 runs",
      weeks: [
        { week_start: "2027-03-08", is_deload: true, run_km: 45, long_run_km: 16, runs: 5, quality_sessions: 1, gym_sessions: 2, key_session: "Recovery: easy only until Thu, strides Fri" },
        { week_start: "2027-03-15", run_km: 63, long_run_km: 30, runs: 6, quality_sessions: 2, gym_sessions: 2, key_session: "MP 14 km · long run 30 km with the last 10 km @ MP (Sun 21 Mar)" },
        { week_start: "2027-03-22", run_km: 58, long_run_km: 24, runs: 6, quality_sessions: 2, gym_sessions: 1, key_session: "Threshold 3×10′ · long run 24 km with 12 km @ MP" },
      ],
    },
    {
      name: "Taper",
      focus: "taper",
      gym_focus: "maintenance",
      purpose: "Cut volume 20% → 40% → 60% and keep the intensity, so you arrive fresh and sharp (Bosquet 2007).",
      key_sessions: "Short MP sessions · last gym session 10 days out · race",
      weeks: [
        { week_start: "2027-03-29", run_km: 50, long_run_km: 22, runs: 5, quality_sessions: 2, gym_sessions: 1, key_session: "MP 2×6 km · long run 22 km" },
        { week_start: "2027-04-05", run_km: 38, long_run_km: 16, runs: 5, quality_sessions: 1, gym_sessions: 1, key_session: "MP 8 km · last gym session (Wed, light)" },
        { week_start: "2027-04-12", run_km: 60, long_run_km: 42.2, runs: 5, quality_sessions: 1, gym_sessions: 0, key_session: "3–4 short easy runs with strides, carb-load from Fri", milestone: "Padova Marathon · Sun 18 Apr (A race)" },
      ],
    },
  ],
};
