// Race-pace tracker: the work you did at goal marathon pace (and threshold), and
// what it cost in heart rate. Pure.
//
// Segments come from the watch laps (≥ 0.8 km), else from the km splits
// (consecutive full km in the same band merge; the last, partial km is skipped).
// Bands: MP ± 10 s/km; threshold = Daniels' offset from MP in `EFFORTS`
// (18–26 s/km faster). Weekly "HR at MP" = km-weighted mean HR of the MP
// segments: at the same pace, falling HR = fitter.

import { EFFORTS } from "@/lib/season/efforts";
import { mondayOf } from "@/lib/dates";
import type { Lap, Split } from "@/lib/run-detail";

export type Band = "mp" | "threshold";
export type Segment = { date: string; band: Band; km: number; pace: number; hr: number | null; hrr: number | null };
export type RunWithDetail = { date: string; run_detail: { laps?: Lap[] | null; splits?: Split[] | null } | null };

export const MP_TOLERANCE = 10;
export const MIN_SEGMENT_KM = 0.8;

const threshold = EFFORTS.find((e) => e.key === "threshold")!.paceFromMp!;

/** Pace band (s/km) for each kind of work around goal marathon pace `mp`. */
export function bands(mp: number): Record<Band, [number, number]> {
  // [fastest, slowest]
  return { mp: [mp - MP_TOLERANCE, mp + MP_TOLERANCE], threshold: [mp + threshold[1], mp + threshold[0]] };
}

function bandOf(pace: number, b: Record<Band, [number, number]>): Band | null {
  if (pace >= b.mp[0] && pace <= b.mp[1]) return "mp";
  if (pace >= b.threshold[0] && pace <= b.threshold[1]) return "threshold";
  return null;
}

export function segmentsOf(
  runs: RunWithDetail[],
  mp: number,
  anchors: { rest: number; max: number },
): Segment[] {
  const b = bands(mp);
  const hrrOf = (hr: number | null) =>
    hr === null ? null : Math.round(((hr - anchors.rest) / (anchors.max - anchors.rest)) * 1000) / 1000;
  const out: Segment[] = [];
  for (const r of runs) {
    const laps = (r.run_detail?.laps ?? []).filter((l) => l.km !== null && l.km >= MIN_SEGMENT_KM && l.s > 0);
    if (laps.length) {
      for (const l of laps) {
        const pace = l.s / l.km!;
        const band = bandOf(pace, b);
        if (band) out.push({ date: r.date, band, km: l.km!, pace: Math.round(pace), hr: l.hr, hrr: hrrOf(l.hr) });
      }
      continue;
    }
    // Splits: full km only (each split is 1 km; the last one may be partial).
    const splits = (r.run_detail?.splits ?? []).slice(0, -1);
    let cur: { band: Band; km: number; s: number; hrS: number; hrKm: number } | null = null;
    const flush = () => {
      if (cur && cur.km >= 1) {
        const hr = cur.hrKm > 0 ? Math.round(cur.hrS / cur.hrKm) : null;
        out.push({ date: r.date, band: cur.band, km: cur.km, pace: Math.round(cur.s / cur.km), hr, hrr: hrrOf(hr) });
      }
      cur = null;
    };
    for (const sp of splits) {
      const band = sp.s > 0 ? bandOf(sp.s, b) : null;
      if (!band) { flush(); continue; }
      if (cur && cur.band !== band) flush();
      cur ??= { band, km: 0, s: 0, hrS: 0, hrKm: 0 };
      cur.km += 1;
      cur.s += sp.s;
      if (sp.hr !== null) { cur.hrS += sp.hr; cur.hrKm += 1; }
    }
    flush();
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

export type MpWeek = { week: string; km: number; hr: number; pace: number };

/** Km-weighted HR and pace of the MP segments per ISO week (weeks with HR only). */
export function mpWeeks(segments: Segment[]): MpWeek[] {
  const by = new Map<string, { km: number; hrKm: number; hrS: number; s: number }>();
  for (const s of segments) {
    if (s.band !== "mp" || s.hr === null) continue;
    const w = mondayOf(s.date);
    const acc = by.get(w) ?? { km: 0, hrKm: 0, hrS: 0, s: 0 };
    acc.km += s.km;
    acc.hrKm += s.km;
    acc.hrS += s.hr * s.km;
    acc.s += s.pace * s.km;
    by.set(w, acc);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, a]) => ({ week, km: Math.round(a.km * 10) / 10, hr: Math.round(a.hrS / a.hrKm), pace: Math.round(a.s / a.km) }));
}

/** Least-squares slope of HR at MP in bpm per week; null under 3 weeks. Negative = fitter. */
export function mpHrSlope(weeks: MpWeek[]): number | null {
  if (weeks.length < 3) return null;
  const t0 = Date.parse(`${weeks[0].week}T00:00:00Z`);
  const xs = weeks.map((w) => (Date.parse(`${w.week}T00:00:00Z`) - t0) / (7 * 86_400_000));
  const ys = weeks.map((w) => w.hr);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (den === 0) return null;
  return Math.round((xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den) * 10) / 10;
}
