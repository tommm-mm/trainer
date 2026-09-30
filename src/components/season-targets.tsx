import { formatNumber } from "@/lib/format";
import { KM_TOLERANCE, type WeekActual } from "@/lib/season/progress";
import type { WeekTargets } from "@/lib/season/model";

// This week's targets vs done, as four meters. Shared by the Season page and
// the Week View. A week is judged on totals, not on which day a run happened.

type Meter = { label: string; done: number; target: number | null | undefined; unit?: string; gym?: boolean };

export function TargetMeters({
  targets,
  actual,
  finished,
}: {
  targets: WeekTargets;
  actual: WeekActual | undefined;
  finished: boolean;
}) {
  const a = actual ?? { run_km: 0, runs: 0, long_run_km: 0, gym_sessions: 0, cross_sessions: 0 };
  const meters: Meter[] = [
    { label: "Run km", done: a.run_km, target: targets.run_km },
    { label: "Runs", done: a.runs, target: targets.runs },
    { label: "Long run", done: a.long_run_km, target: targets.long_run_km, unit: "km" },
    { label: "Gym", done: a.gym_sessions, target: targets.gym_sessions, gym: true },
    ...(targets.cross_sessions
      ? [{ label: "Easy bike (optional)", done: a.cross_sessions, target: targets.cross_sessions, gym: true }]
      : []),
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {meters.map((m) => {
        const pct = m.target ? Math.min(100, (m.done / m.target) * 100) : 0;
        const hit = !!m.target && m.done >= m.target * (1 - KM_TOLERANCE);
        const color = hit
          ? m.gym
            ? "bg-sky-400"
            : "bg-emerald-400"
          : finished
            ? "bg-amber-400"
            : m.gym
              ? "bg-sky-400/70"
              : "bg-emerald-400/70";
        return (
          <div key={m.label}>
            <div className="flex justify-between text-xs text-neutral-400">
              <span>{m.label}</span>
              <span className="tabular-nums">
                {m.done ? formatNumber(m.done) : "–"} / {formatNumber(m.target ?? null)}
                {m.unit ? ` ${m.unit}` : ""}
                {hit && <span className="ml-1 text-emerald-400">✓</span>}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-neutral-800">
              <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
