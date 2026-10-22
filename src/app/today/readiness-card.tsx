import { formatDay } from "@/lib/dates";
import type { Readiness, RecoveryStatus } from "@/lib/recovery";

// Ring colour and word per readiness level. The fill is only a visual cue
// for the level, not a score.
const LOOK: Record<Readiness, { color: string; word: string; fill: number }> = {
  ready: { color: "#34d399", word: "Ready", fill: 0.85 },
  easy: { color: "#fbbf24", word: "Easy", fill: 0.5 },
  rest: { color: "#f87171", word: "Rest", fill: 0.2 },
  unknown: { color: "#525252", word: "No data", fill: 0 },
};
const C = 2 * Math.PI * 48;

/** Top of Today: last night from Garmin as one colour, with the three inputs beside it. */
export function ReadinessCard({ level, status, today }: { level: Readiness; status: RecoveryStatus | null; today: string }) {
  const look = LOOK[level];
  const last = status?.last ?? null;
  const sleepH = last?.sleep_s != null ? `${Math.floor(last.sleep_s / 3600)}h ${String(Math.round((last.sleep_s % 3600) / 60)).padStart(2, "0")}` : "–";
  const rows = [
    { label: "HRV", value: last?.hrv != null ? String(Math.round(last.hrv)) : "–", base: status?.hrv ? `/ ${Math.round(status.hrv.base)} normal` : null },
    { label: "Resting HR", value: last?.resting_hr != null ? String(last.resting_hr) : "–", base: status?.rhr ? `/ ${Math.round(status.rhr.base)}` : null },
    { label: "Sleep", value: sleepH, base: null },
  ];
  return (
    <section className="mb-4 rounded-2xl bg-neutral-900 p-5">
      <div className="flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <svg role="img" aria-label={`Readiness: ${look.word}`} viewBox="0 0 112 112" className="h-28 w-28">
            <circle cx="56" cy="56" r="48" fill="none" stroke="#262626" strokeWidth="10" />
            <circle
              cx="56" cy="56" r="48" fill="none" stroke={look.color} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - look.fill)} transform="rotate(-90 56 56)"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xl font-bold uppercase tracking-wide" style={{ color: look.color }}>
            {look.word}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2.5">
          <p className="text-[11px] uppercase tracking-wider text-neutral-400">
            Recovery · {last ? (last.date === today ? "last night" : formatDay(last.date)) : "Garmin"}
          </p>
          {rows.map((r) => (
            <p key={r.label} className="flex justify-between text-sm">
              <span className="text-neutral-300">{r.label}</span>
              <span className="tabular-nums">
                <b>{r.value}</b> {r.base && <span className="text-neutral-400">{r.base}</span>}
              </span>
            </p>
          ))}
        </div>
      </div>
      {status && status.signals.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-amber-200">
          {status.signals.map((s) => (
            <li key={s.code}>{s.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
