// Verdicts on top of metrics.ts: turns numbers into "on point / watch / off"
// plus a plain-language message. Pure and deterministic (no AI), so the Stats
// page and the Phase D coach read exactly the same judgement.

import {
  ACWR_SAFE,
  LONG_RUN_MIN_WEEK_KM,
  LONG_RUN_SHARE,
  MONOTONY_HIGH,
  linearFit,
  type AerobicWeek,
  type RunningWeek,
} from "@/lib/metrics";
import { formatPace } from "@/lib/format";

export type Status = "good" | "watch" | "off" | "na";

export type Verdict = {
  status: Status;
  /** Short value shown next to the badge, e.g. "1.42" or "+18%". */
  value: string | null;
  /** One sentence: what the number means right now and what to do. */
  message: string;
};

export const STATUS_LABEL: Record<Status, string> = {
  good: "On point",
  watch: "Watch",
  off: "Off",
  na: "Not enough data",
};

const SEVERITY: Record<Status, number> = { off: 3, watch: 2, good: 1, na: 0 };

const na = (message: string): Verdict => ({ status: "na", value: null, message });
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%`;

/**
 * ACWR bands (Gabbett 2016, "training–injury prevention paradox"):
 * 0.8–1.3 sweet spot, 1.3–1.5 caution, > 1.5 spike (injury risk rises
 * sharply), < 0.8 under-loading.
 */
export const ACWR_SPIKE = 1.5;

export function assessAcwr(ratio: number | null): Verdict {
  if (ratio === null) return na("Needs 28 days of history before it means anything.");
  const value = ratio.toFixed(2);
  if (ratio > ACWR_SPIKE) {
    return {
      status: "off",
      value,
      message: `Spike: your last 7 days are ${ratio.toFixed(1)}× your usual week. Injury risk rises here, so keep the next 2–3 days easy.`,
    };
  }
  if (ratio > ACWR_SAFE.high) {
    return {
      status: "watch",
      value,
      message: "Load is climbing faster than you're used to. Fine for one week; don't stack another hard one.",
    };
  }
  if (ratio < ACWR_SAFE.low) {
    return {
      status: "watch",
      value,
      message: "You're training less than you're used to. Good for a recovery week; if it lasts, fitness fades.",
    };
  }
  return { status: "good", value, message: "Your load matches what your body is used to. Keep building gradually." };
}

/**
 * Monotony (Foster 1998): > 2.0 was associated with illness/overtraining;
 * I treat 1.5–2.0 as an early warning.
 */
export const MONOTONY_WATCH = 1.5;

export function assessMonotony(monotony: number | null): Verdict {
  if (monotony === null) return na("Needs a week with some variation to compute.");
  const value = monotony.toFixed(2);
  if (monotony > MONOTONY_HIGH) {
    return {
      status: "off",
      value,
      message: "Every day looks the same. Make easy days truly easy, or add a full rest day.",
    };
  }
  if (monotony > MONOTONY_WATCH) {
    return {
      status: "watch",
      value,
      message: "Days are getting similar. Keep hard days hard and easy days easy.",
    };
  }
  return { status: "good", value, message: "Good mix of hard, easy and rest days." };
}

/**
 * Week-over-week ramp: the last complete week vs the average of the 3 before.
 * The "10% rule" is a conservative heuristic, not a law: I flag > 10% as
 * watch and > 30% as off; a > 30% drop is flagged as a (possibly planned) dip.
 */
export const RAMP_WATCH = 0.1;
export const RAMP_OFF = 0.3;

export function assessVolumeRamp(completeWeeks: RunningWeek[]): Verdict {
  const last = completeWeeks.at(-1);
  const prev = completeWeeks.slice(-4, -1);
  if (!last || prev.length < 3) return na("Needs 4 complete weeks.");
  const base = prev.reduce((s, w) => s + w.km, 0) / prev.length;
  if (base < 5) return na("Not enough running in the previous 3 weeks to compare.");
  const ramp = last.km / base - 1;
  const value = signedPct(ramp);
  const detail = `${Math.round(last.km)} km last week vs ${Math.round(base)} km average of the 3 before.`;
  if (ramp > RAMP_OFF) {
    return { status: "off", value, message: `Big jump: ${detail} Hold this volume for a week before adding more.` };
  }
  if (ramp > RAMP_WATCH) {
    return { status: "watch", value, message: `Above the ~10% guideline: ${detail} OK once; don't repeat it next week.` };
  }
  if (ramp < -RAMP_OFF) {
    return { status: "watch", value, message: `Big drop: ${detail} Fine if it was a planned lighter week.` };
  }
  return { status: "good", value, message: `Steady progression: ${detail}` };
}

/** Long run share of the last complete week vs the 30–35% guideline. */
export function assessLongRunShare(week: RunningWeek | undefined): Verdict {
  if (!week || week.longRunShare === null || week.km < LONG_RUN_MIN_WEEK_KM) {
    return na(`Needs a complete week with at least ${LONG_RUN_MIN_WEEK_KM} km.`);
  }
  const share = week.longRunShare;
  const value = pct(share);
  if (share > 0.45) {
    return {
      status: "off",
      value,
      message: "Your long run carries almost half the week. Add km to the other runs rather than cutting it.",
    };
  }
  if (share > LONG_RUN_SHARE.high) {
    return {
      status: "watch",
      value,
      message: "Long run is a bit heavy for this weekly volume. Grow the other runs to balance it.",
    };
  }
  if (share < 0.2) {
    return {
      status: "watch",
      value,
      message: "Your long run is short compared to the week. For a marathon it should grow steadily.",
    };
  }
  return { status: "good", value, message: "Long run is well balanced with the rest of the week." };
}

/**
 * Aerobic fitness from easy runs: slope of the weekly pace at reference HR
 * (sec/km per week, negative = faster = fitter). Needs ≥ 4 weeks of data.
 */
export function assessAerobicTrend(weeks: AerobicWeek[]): Verdict {
  const fit = linearFit(weeks.map((w) => w.paceAtRefHr));
  if (!fit || fit.points < 4) return na("Needs easy runs in at least 4 different weeks.");
  const s = fit.slope; // sec/km per week
  const value = `${s <= 0 ? "−" : "+"}${Math.abs(s).toFixed(1)} s/km/wk`;
  const now = fit.fitted.at(-1)!;
  if (s <= -1) {
    return {
      status: "good",
      value,
      message: `Getting fitter: about ${Math.abs(s).toFixed(1)} s/km faster per week at the same heart rate (now ~${formatPace(now)}/km).`,
    };
  }
  if (s >= 2) {
    const first = fit.fitted[0];
    return {
      status: "off",
      value,
      message: `About ${Math.round(now - first)} s/km slower at the same heart rate than ${fit.fitted.length} weeks ago (~${formatPace(first)} → ~${formatPace(now)}/km). Usual causes: accumulated fatigue, poor sleep, stress or heat. A lighter week and a few check-ins will show which.`,
    };
  }
  if (s > 0.5) {
    return {
      status: "watch",
      value,
      message: "Slightly slower at the same heart rate. Often fatigue or heat; keep easy runs truly easy.",
    };
  }
  return {
    status: "watch",
    value,
    message: `Flat for now (~${formatPace(now)}/km). Normal early in a block; gains show after weeks of consistent easy volume.`,
  };
}

/**
 * Easy-run heart rate trend (bpm per week). Falling HR on easy runs usually
 * means a stronger aerobic base; a rising one points at fatigue or heat.
 */
export function assessEasyHrTrend(weeks: AerobicWeek[]): Verdict {
  const fit = linearFit(weeks.map((w) => w.avgHr));
  if (!fit || fit.points < 4) return na("Needs easy runs in at least 4 different weeks.");
  const s = fit.slope;
  const value = `${s <= 0 ? "−" : "+"}${Math.abs(s).toFixed(1)} bpm/wk`;
  if (s <= -0.3) {
    return { status: "good", value, message: "Easy-run heart rate is drifting down: your aerobic base is getting stronger." };
  }
  if (s >= 1) {
    return {
      status: "off",
      value,
      message: "Easy-run heart rate keeps rising. Slow the easy runs down and check sleep, stress and fatigue.",
    };
  }
  if (s > 0.3) {
    return { status: "watch", value, message: "Easy-run heart rate is creeping up. Keep easy runs conversational." };
  }
  return { status: "watch", value, message: "Easy-run heart rate is flat. Give it a few more weeks of consistent easy running." };
}

/** How much of the load uses estimated rather than rated RPE. */
export function assessRpeCoverage(estimatedShare: number | null): Verdict {
  if (estimatedShare === null) return na("No training load yet.");
  const value = pct(estimatedShare);
  if (estimatedShare > 0.5) {
    return {
      status: "watch",
      value,
      message: `${value} of your load uses an estimated effort. Rate sessions on the feedback card to make load, ACWR and monotony exact.`,
    };
  }
  return { status: "good", value, message: "Most of your load comes from your own effort ratings." };
}

// ---------------------------------------------------------------- coach's read

export type Insight = {
  id: string;
  title: string;
  verdict: Verdict;
};

/**
 * The top of the Stats page: problems first (off, then watch), then what's
 * going well, capped at `max`. "Not enough data" items are left out.
 */
export function coachRead(items: Insight[], max = 5): Insight[] {
  return items
    .filter((i) => i.verdict.status !== "na")
    .map((item, index) => ({ item, index }))
    .sort((a, b) => SEVERITY[b.item.verdict.status] - SEVERITY[a.item.verdict.status] || a.index - b.index)
    .slice(0, max)
    .map(({ item }) => item);
}
