import { HARD_SET_RANGE, MUSCLES, VERDICT_MUSCLES, type Muscle } from "@/lib/strength";

// Weekly hard sets per muscle as horizontal meters with the 10–20 reference
// band. Plain markup (no hooks), so server pages and the live logger share it.
// Status is icon + text, never colour alone.

const SCALE_MAX = 24;
const FILL = "#d95926"; // gym series colour (charts theme)

const LABEL: Record<Muscle, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
};

export function MuscleMeters({ sets, title = "Hard sets this week" }: { sets: Record<Muscle, number>; title?: string }) {
  const bandLeft = (HARD_SET_RANGE.low / SCALE_MAX) * 100;
  const bandWidth = ((HARD_SET_RANGE.high - HARD_SET_RANGE.low) / SCALE_MAX) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">{title}</p>
        <p className="text-[11px] text-neutral-500">band = 10–20 sets</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {MUSCLES.map((m) => {
          const v = sets[m] ?? 0;
          const judged = VERDICT_MUSCLES.includes(m);
          const icon = !judged ? "·" : v > HARD_SET_RANGE.high ? "↑" : v >= HARD_SET_RANGE.low ? "✓" : "";
          return (
            <li key={m} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-xs">
              <span className={judged ? "text-neutral-300" : "text-neutral-500"}>{LABEL[m]}</span>
              <span className="relative h-3 rounded-sm bg-neutral-800" aria-hidden>
                <span
                  className="absolute inset-y-0 rounded-sm bg-neutral-600/40 ring-1 ring-inset ring-neutral-500/60"
                  style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
                />
                <span
                  className="absolute inset-y-0.5 left-0 rounded-r-sm"
                  style={{
                    width: `${(Math.min(v, SCALE_MAX) / SCALE_MAX) * 100}%`,
                    backgroundColor: FILL,
                    opacity: judged ? 1 : 0.5,
                  }}
                />
              </span>
              <span className="text-right tabular-nums text-neutral-300">
                {Number.isInteger(v) ? v : v.toFixed(1)}
                <span className="ml-1 inline-block w-3 text-neutral-400">{icon}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-neutral-500">
        Working sets at RIR ≤ 4 in the main block; secondary muscles count half. Calves and core aren&apos;t judged
        (running and finishers train them).
      </p>
    </div>
  );
}
