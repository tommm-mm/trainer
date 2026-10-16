import { cardCls } from "@/components/ui";
import { addDays, formatLongDate, formatShortDate } from "@/lib/dates";
import { formatDuration, formatPace } from "@/lib/format";
import { SHAPE_TARGET, type Prediction } from "@/lib/race-predict";
import { bands, type MpWeek, type Segment } from "@/lib/race-pace";
import { RACE_HISTORY_DAYS } from "@/lib/sync";
import { ImportHistory } from "@/app/analytics/import-history";

export type RaceForecast = {
  target: number;
  /** Goal marathon pace, s/km. */
  mp: number;
  prediction: Prediction;
  segments: Segment[];
  mpWeeks: MpWeek[];
  /** bpm per week; negative = fitter. */
  mpSlope: number | null;
  oldestRun: string | null;
};

/** 3:31 (minutes rounded) */
const hm = (s: number) => formatDuration(Math.round(s / 60) * 60).slice(0, -3);
const mins = (s: number) => `${Math.round(Math.abs(s) / 60)}′`;

/** Season page: predicted marathon time vs the target, how it's built, and the race-pace work. */
export function RaceCard({ f, race, today }: { f: RaceForecast; race: string; today: string }) {
  const p = f.prediction;
  const gap = p.seconds !== null ? p.seconds - f.target : null;
  const b = bands(f.mp);
  // The 12-month import can only help if history doesn't already reach back that far.
  const canImport = !f.oldestRun || f.oldestRun > addDays(today, -(RACE_HISTORY_DAYS - 30));

  return (
    <section className={`${cardCls} flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-neutral-500">{race} · predicted</p>
        <span className="text-xs text-neutral-500">target {hm(f.target)} · {formatPace(f.mp)}/km</span>
      </div>

      {p.seconds !== null && p.low !== null && p.high !== null ? (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums">{hm(p.seconds)}</span>
            <span className="text-sm text-neutral-400 tabular-nums">
              {hm(p.low)}–{hm(p.high)}
            </span>
            {p.trend !== null && Math.abs(p.trend) >= 60 && (
              <span className={`text-sm ${p.trend < 0 ? "text-emerald-400" : "text-amber-400"}`}>
                {p.trend < 0 ? "−" : "+"}
                {mins(p.trend)} in 4 weeks
              </span>
            )}
          </div>
          <TargetBar seconds={p.seconds} low={p.low} high={p.high} target={f.target} />
          <p className="text-sm text-neutral-300">
            {gap! <= 0
              ? `On track: ${mins(gap!)} inside ${hm(f.target)}.`
              : p.potential !== null && p.potential <= f.target
                ? `Fitness is there (${hm(p.potential)}); endurance is what's missing today: ${Math.round(p.shape.pct * 100)}% marathon shape.`
                : `${mins(gap!)} off ${hm(f.target)} today.`}
          </p>
        </>
      ) : (
        <p className="text-sm text-neutral-300">
          No prediction yet: it needs a race or time trial (≥ 5 km, last 12 months; planned ones in the plan count) to
          calibrate your heart-rate data.
        </p>
      )}

      {!p.anchor && canImport && (
        <ImportHistory days={RACE_HISTORY_DAYS} since={f.oldestRun ? formatLongDate(f.oldestRun) : null} title="Find your last race">
          Your runs here go back to {f.oldestRun ? formatShortDate(f.oldestRun) : "—"}. Import 12 months from Garmin once,
          so a past race (your March half marathon) can anchor the prediction.
        </ImportHistory>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-neutral-400">How it&apos;s built</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-neutral-500">Latest race / test</dt>
          <dd>
            {p.anchor
              ? `${p.anchor.name ?? "Race"} · ${formatShortDate(p.anchor.date)} · ${p.anchor.km.toFixed(1)} km in ${formatDuration(p.anchor.seconds)} → VDOT ${p.anchor.vdot.toFixed(1)} ≈ ${hm(p.anchor.marathon)} marathon`
              : "none found in the last 12 months"}
          </dd>
          {p.best && (
            <>
              <dt className="text-neutral-500">Best in 12 months</dt>
              <dd className="text-neutral-400">
                {`${p.best.name ?? "Race"} · ${formatShortDate(p.best.date)} · VDOT ${p.best.vdot.toFixed(1)} ≈ ${hm(p.best.marathon)} (older: context, not the prediction)`}
              </dd>
            </>
          )}
          <dt className="text-neutral-500">Fitness now</dt>
          <dd>
            {p.fitness
              ? `VDOT ${p.fitness.vdot.toFixed(1)} from your last 6 weeks (median of ${p.fitness.runs} easy runs, pace vs heart rate; ×${p.fitness.factor.toFixed(2)} calibrated on the latest race / test)`
              : p.anchor
                ? "not enough runs with heart rate around the race or now (≥ 3 each): using the race alone"
                : "needs a race to calibrate"}
          </dd>
          <dt className="text-neutral-500">Marathon shape</dt>
          <dd>
            {Math.round(p.shape.pct * 100)}% · {Math.round(p.shape.weeklyKm)} km/week (of {SHAPE_TARGET.weeklyKm}) · longest{" "}
            {p.shape.longRunKm.toFixed(0)} km (of {SHAPE_TARGET.longRunKm}), last 6 weeks
          </dd>
          {p.potential !== null && (
            <>
              <dt className="text-neutral-500">With full shape</dt>
              <dd>{hm(p.potential)}</dd>
            </>
          )}
        </dl>
        <p className="mt-2 text-[11px] text-neutral-500">
          Daniels&apos; VDOT formulas. Fitness = pace vs heart rate on your easy runs (Runalyze&apos;s method), calibrated
          on your latest race or test. Shape &lt; 100% slows the prediction (up to ~10% of VDOT). Range = spread of your best runs.
        </p>
      </details>

      <div className="border-t border-neutral-800 pt-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Race pace · last 12 weeks</p>
        <p className="mb-2 text-[11px] text-neutral-500">
          MP {formatPace(b.mp[0])}–{formatPace(b.mp[1])}/km · threshold {formatPace(b.threshold[0])}–{formatPace(b.threshold[1])}
          /km, from laps (else km splits)
        </p>
        {f.segments.length === 0 ? (
          <p className="text-xs text-neutral-400">No laps or km at these paces yet: they come with the MP blocks of the plan.</p>
        ) : (
          <>
            {f.mpWeeks.length > 0 && (
              <p className="mb-2 text-sm">
                Heart rate at MP:{" "}
                {f.mpWeeks.map((w) => `${w.hr}`).join(" → ")} bpm
                {f.mpSlope !== null && (
                  <span className={f.mpSlope < 0 ? "text-emerald-400" : "text-amber-400"}>
                    {" "}
                    ({f.mpSlope > 0 ? "+" : ""}
                    {f.mpSlope} bpm/week)
                  </span>
                )}
              </p>
            )}
            <ul className="flex flex-col gap-1 text-xs text-neutral-300">
              {f.segments.slice(-6).reverse().map((s, i) => (
                <li key={`${s.date}-${i}`} className="flex justify-between gap-2 tabular-nums">
                  <span>
                    {formatShortDate(s.date)} · {s.band === "mp" ? "MP" : "threshold"} · {s.km.toFixed(1)} km
                  </span>
                  <span className="text-neutral-400">
                    {formatPace(s.pace)}/km{s.hr !== null ? ` · ${s.hr} bpm` : ""}
                    {s.hrr !== null ? ` (${Math.round(s.hrr * 100)}%)` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

/** A 3:00–4:00 scale with the target line and the predicted range. */
function TargetBar({ seconds, low, high, target }: { seconds: number; low: number; high: number; target: number }) {
  const lo = Math.min(target, low) - 10 * 60;
  const hi = Math.max(target, high) + 10 * 60;
  const x = (s: number) => `${((s - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="relative h-3 rounded-full bg-neutral-800" aria-hidden>
      <div className="absolute inset-y-0 rounded-full bg-sky-500/30" style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})` }} />
      <div className="absolute inset-y-[-3px] w-1 rounded bg-sky-400" style={{ left: x(seconds) }} />
      <div className="absolute inset-y-[-5px] w-0.5 bg-emerald-400" style={{ left: x(target) }} title="target" />
    </div>
  );
}
