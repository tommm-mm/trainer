import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import { formatDay } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { RunDetailView } from "@/components/run-detail";

type Activity = Pick<
  Tables<"activities">,
  "id" | "date" | "type" | "name" | "distance_km" | "avg_pace" | "avg_hr" | "duration_min" | "rpe" | "feeling_score" | "run_detail"
>;

const KIND: Record<string, string> = { run: "Run", gym: "Gym", cardio: "HIIT", cross: "Cross-training" };

/** The most recent session in numbers; tap for splits / laps and the two before it. */
export function LastSessionCard({ sessions }: { sessions: Activity[] }) {
  const [last, ...before] = sessions;
  if (!last) return null;
  const tiles = [
    last.avg_pace ? { label: "Pace", value: last.avg_pace } : last.duration_min ? { label: "Time", value: `${formatNumber(last.duration_min, 0)}′` } : null,
    last.avg_hr ? { label: "Avg HR", value: `${last.avg_hr}` } : null,
    last.rpe !== null ? { label: "RPE", value: `${last.rpe}` } : null,
    last.feeling_score !== null ? { label: "Feel", value: `${last.feeling_score}/10` } : null,
  ].filter((t): t is { label: string; value: string } => t !== null);
  return (
    <details className="group mb-4 rounded-2xl bg-neutral-900 p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-neutral-400">Last session · {formatDay(last.date)}</p>
          <p className="mt-1 truncate text-lg font-semibold">
            {last.name ?? KIND[last.type] ?? last.type}
            {last.distance_km ? ` · ${formatNumber(last.distance_km)} km` : ""}
          </p>
        </div>
        <span aria-hidden className="text-neutral-400 group-open:rotate-180">▾</span>
      </summary>
      {tiles.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-neutral-950 p-2">
              <p className="text-[11px] text-neutral-400">{t.label}</p>
              <p className="text-base font-semibold tabular-nums">{t.value}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2 border-t border-neutral-800 pt-3 text-sm">
        {last.type === "run" && <RunDetailView detail={last.run_detail} />}
        {before.map((a) => (
          <p key={a.id} className="flex justify-between gap-2 text-neutral-300">
            <span className="truncate">
              {formatDay(a.date)} · {a.name ?? KIND[a.type] ?? a.type}
            </span>
            <span className="shrink-0 text-neutral-400">
              {[a.distance_km ? `${formatNumber(a.distance_km)} km` : null, a.avg_pace, a.duration_min && !a.distance_km ? `${formatNumber(a.duration_min, 0)}′` : null, a.avg_hr ? `${a.avg_hr} bpm` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
        ))}
      </div>
    </details>
  );
}

export type Ring = { label: string; done: number; target: number; text: string; color: string };

/** This week as three rings; tap for the day-by-day dots (children) and a link to Plan. */
export function WeekRingsCard({ title, rings, children }: { title: string; rings: Ring[]; children: React.ReactNode }) {
  const C = 2 * Math.PI * 32;
  return (
    <details className="group mb-4 rounded-2xl bg-neutral-900 p-5">
      <summary className="flex cursor-pointer list-none flex-col gap-4">
        <span className="flex justify-between text-[11px] uppercase tracking-wider text-neutral-400">
          <span>{title}</span>
          <span aria-hidden className="group-open:rotate-180">▾</span>
        </span>
        <span className="grid grid-cols-3 gap-2 text-center">
          {rings.map((r) => (
            <span key={r.label} className="flex flex-col items-center gap-1.5">
              <span className="relative h-[76px] w-[76px]">
                <svg aria-hidden viewBox="0 0 76 76" className="h-[76px] w-[76px]">
                  <circle cx="38" cy="38" r="32" fill="none" stroke="#262626" strokeWidth="7" />
                  <circle
                    cx="38" cy="38" r="32" fill="none" stroke={r.color} strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={C * (1 - (r.target > 0 ? Math.min(1, r.done / r.target) : 0))}
                    transform="rotate(-90 38 38)"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">{r.text}</span>
              </span>
              <span className="text-xs text-neutral-300">{r.label}</span>
            </span>
          ))}
        </span>
      </summary>
      <div className="mt-4 flex flex-col gap-3 border-t border-neutral-800 pt-4">
        {children}
        <Link href="/plan" className="text-sm font-semibold text-emerald-400">
          Open the week on Plan ›
        </Link>
      </div>
    </details>
  );
}
