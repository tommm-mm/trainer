// Run detail from the intervals.icu streams and laps. Pure.
//
// - Splits: pace and avg HR per full km (the last partial km is kept if
//   ≥ 200 m), from the time / distance / heartrate streams.
// - Decoupling (Friel's aerobic decoupling, "Pa:HR"): Efficiency Factor
//   (speed ÷ HR) of the first half vs the second half of the moving time,
//   as % lost. < 5% = aerobically coupled (the base holds for that
//   duration); ≥ 5% = HR drifted up for the same pace. Only judged on runs of
//   ≥ 40 moving minutes, where it means something.
// - Laps: the watch laps / intervals as intervals.icu reports them (the 8×1′
//   reps, time-trial splits), parsed defensively: every field may be missing.

export type Split = { km: number; s: number; hr: number | null };
export type Lap = { n: number; km: number | null; s: number; hr: number | null; max_hr: number | null; label: string | null; work: boolean | null };
export type RunDetail = { splits: Split[]; decoupling: number | null; laps: Lap[] | null };

/** Samples further apart than this are a pause, not running. */
const MAX_GAP_S = 10;
/** Slower than this (m/s ≈ 16:40 /km) counts as stopped. */
const MIN_SPEED = 1;
export const DECOUPLING_MIN_S = 40 * 60;
export const DECOUPLING_GOOD = 5;
const PARTIAL_KM_MIN_M = 200;

type Num = number | null | undefined;
const ok = (v: Num): v is number => v != null && Number.isFinite(v);

/** Moving segments between consecutive samples: seconds, metres, HR (start sample). */
function segments(time: Num[], dist: Num[], hr: Num[]) {
  const out: { dt: number; dd: number; hr: number | null }[] = [];
  for (let i = 0; i + 1 < time.length; i++) {
    const [t0, t1, d0, d1] = [time[i], time[i + 1], dist[i], dist[i + 1]];
    if (!ok(t0) || !ok(t1) || !ok(d0) || !ok(d1)) continue;
    const dt = t1 - t0;
    const dd = d1 - d0;
    if (dt <= 0 || dt > MAX_GAP_S || dd < 0 || dd / dt < MIN_SPEED) continue;
    const h = hr[i];
    out.push({ dt, dd, hr: ok(h) && h >= 30 && h <= 250 ? h : null });
  }
  return out;
}

export function kmSplits(time: Num[], dist: Num[], hr: Num[]): Split[] {
  const out: Split[] = [];
  let s = 0, m = 0, hrS = 0, hrT = 0;
  const push = (km: number) => {
    out.push({ km, s: Math.round(s), hr: hrT > 0 ? Math.round(hrS / hrT) : null });
    s = m = hrS = hrT = 0;
  };
  for (const g of segments(time, dist, hr)) {
    let { dt, dd } = g;
    // A segment can cross a km boundary: split it proportionally.
    while (m + dd >= 1000) {
      const part = (1000 - m) / dd;
      s += dt * part;
      if (g.hr != null) { hrS += g.hr * dt * part; hrT += dt * part; }
      m = 1000;
      push(out.length + 1);
      dt *= 1 - part;
      dd *= 1 - part;
    }
    s += dt;
    m += dd;
    if (g.hr != null) { hrS += g.hr * dt; hrT += dt; }
  }
  if (m >= PARTIAL_KM_MIN_M) {
    const km = Math.round((out.length + m / 1000) * 100) / 100;
    out.push({ km, s: Math.round(s), hr: hrT > 0 ? Math.round(hrS / hrT) : null });
  }
  return out;
}

/** % of Efficiency Factor lost from the first to the second half (moving time). Null when too short or no HR. */
export function decoupling(time: Num[], dist: Num[], hr: Num[]): number | null {
  const segs = segments(time, dist, hr).filter((g) => g.hr != null);
  const total = segs.reduce((a, g) => a + g.dt, 0);
  if (total < DECOUPLING_MIN_S) return null;
  const half = [{ t: 0, d: 0, hb: 0 }, { t: 0, d: 0, hb: 0 }];
  let elapsed = 0;
  for (const g of segs) {
    const h = half[elapsed + g.dt / 2 < total / 2 ? 0 : 1];
    h.t += g.dt; h.d += g.dd; h.hb += g.hr! * g.dt;
    elapsed += g.dt;
  }
  const ef = half.map((h) => (h.t > 0 && h.hb > 0 ? h.d / h.t / (h.hb / h.t) : null));
  if (ef[0] == null || ef[1] == null) return null;
  return Math.round(((ef[0] - ef[1]) / ef[0]) * 1000) / 10;
}

type RawInterval = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** intervals.icu `/activity/{id}/intervals` (or a bare list) → laps. Null when nothing usable. */
export function parseLaps(raw: unknown): Lap[] | null {
  const list: unknown =
    Array.isArray(raw) ? raw : raw && typeof raw === "object" ? (raw as { icu_intervals?: unknown }).icu_intervals : null;
  if (!Array.isArray(list)) return null;
  const laps = (list as RawInterval[])
    .filter((x) => x && typeof x === "object")
    .map((x, i): Lap | null => {
      const s = num(x.moving_time) ?? num(x.elapsed_time);
      if (!s || s <= 0) return null;
      const m = num(x.distance);
      const hr = num(x.average_heartrate);
      const max = num(x.max_heartrate);
      const type = typeof x.type === "string" ? x.type.toUpperCase() : null;
      return {
        n: i + 1,
        km: m != null && m > 0 ? Math.round(m / 10) / 100 : null,
        s: Math.round(s),
        hr: hr != null ? Math.round(hr) : null,
        max_hr: max != null ? Math.round(max) : null,
        label: typeof x.label === "string" && x.label.trim() ? x.label.trim().slice(0, 40) : null,
        work: type === "WORK" ? true : type === "RECOVERY" || type === "REST" ? false : null,
      };
    })
    .filter((l): l is Lap => l !== null);
  return laps.length ? laps.map((l, i) => ({ ...l, n: i + 1 })) : null;
}

/** Pace of a split or lap in s/km (null without distance). */
export const paceOf = (x: { km: number | null; s: number }, kmLen?: number) => {
  const km = kmLen ?? x.km;
  return km && km > 0 ? Math.round(x.s / km) : null;
};
