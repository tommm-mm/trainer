import { formatPace, formatDuration } from "@/lib/format";
import { DECOUPLING_GOOD, paceOf, type Lap, type RunDetail, type Split } from "@/lib/run-detail";

/** Splits, laps and HR drift of a run (Week View), folded by default. */
export function RunDetailView({ detail }: { detail: unknown }) {
  const d = detail as Partial<RunDetail> | null;
  const splits: Split[] = Array.isArray(d?.splits) ? d.splits : [];
  const laps: Lap[] = Array.isArray(d?.laps) ? d.laps : [];
  const drift = typeof d?.decoupling === "number" ? d.decoupling : null;
  if (!splits.length && !laps.length && drift === null) return null;
  // Laps worth showing: more than one, and not just the auto 1 km laps that repeat the splits.
  const showLaps = laps.length > 1 && !laps.every((l) => l.km != null && Math.abs(l.km - 1) < 0.02);
  const pace = (s: number | null) => (s ? formatPace(s) : "–");

  return (
    <details className="mt-1 text-[11px] text-neutral-400">
      <summary className="cursor-pointer select-none">
        Splits{showLaps ? " · laps" : ""}
        {drift !== null && (
          <span className={drift >= DECOUPLING_GOOD ? "text-amber-300" : "text-emerald-300"}>
            {" "}
            · HR drift {drift}%
          </span>
        )}
      </summary>
      {drift !== null && (
        <p className="mt-1 text-neutral-500">
          Drift = how much more heartbeat each metre cost in the second half (Friel). Under {DECOUPLING_GOOD}%: your
          aerobic base held for this run.
        </p>
      )}
      {showLaps && (
        <table className="mt-1 w-full tabular-nums">
          <thead className="text-neutral-500">
            <tr><th className="text-left font-normal">Lap</th><th className="text-right font-normal">Dist</th><th className="text-right font-normal">Time</th><th className="text-right font-normal">Pace</th><th className="text-right font-normal">HR</th></tr>
          </thead>
          <tbody>
            {laps.map((l) => (
              <tr key={l.n} className={l.work === false ? "text-neutral-500" : ""}>
                <td>{l.label ?? (l.work === true ? `Rep ${l.n}` : l.work === false ? "rest" : l.n)}</td>
                <td className="text-right">{l.km != null ? `${l.km} km` : "–"}</td>
                <td className="text-right">{formatDuration(l.s)}</td>
                <td className="text-right">{pace(paceOf(l))}</td>
                <td className="text-right">{l.hr ?? "–"}{l.max_hr ? ` / ${l.max_hr}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {splits.length > 0 && (
        <table className="mt-1 w-full tabular-nums">
          <thead className="text-neutral-500">
            <tr><th className="text-left font-normal">Km</th><th className="text-right font-normal">Pace</th><th className="text-right font-normal">HR</th></tr>
          </thead>
          <tbody>
            {splits.map((s, i) => {
              const len = Math.round((s.km - (i > 0 ? splits[i - 1].km : 0)) * 100) / 100;
              return (
                <tr key={i}>
                  <td>{s.km}</td>
                  <td className="text-right">{pace(paceOf({ km: len, s: s.s }))}</td>
                  <td className="text-right">{s.hr ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </details>
  );
}
