import { formatNumber } from "@/lib/format";
import { LOAD_TYPES, LOAD_TYPE_LABELS, type WeekLoad } from "@/lib/metrics";
import { LOAD_TOLERANCE, type PlannedLoad } from "@/lib/load";
import { judgeIntensity, type ZoneWeek } from "@/lib/zones";
import { COLORS } from "@/app/analytics/theme";

// A week's load: done vs planned, split by type, and the 80/20 split of
// time in HR zones. Shared by the Season page and the Week View. Server
// component: hover titles carry the exact numbers.

// Intensity bands: one hue, lighter = harder (stands out on the dark card).
export const BAND_COLORS = { easy: "#2f6db5", moderate: "#6fa5ea", hard: "#bcd7fa" } as const;
const BAND_LABELS = { easy: "Easy", moderate: "MP", hard: "Hard" } as const;
const VERDICT = {
  good: { icon: "✓", cls: "text-emerald-400" },
  watch: { icon: "!", cls: "text-amber-300" },
  off: { icon: "✕", cls: "text-red-400" },
} as const;

const au = (n: number) => formatNumber(Math.round(n), 0);

function hours(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m}′`;
}

export function LoadMeters({
  done,
  planned,
  zones,
  focus,
  finished,
}: {
  done: WeekLoad | undefined;
  planned: PlannedLoad | null;
  zones: ZoneWeek | undefined;
  focus?: string | null;
  finished: boolean;
}) {
  const total = done?.total ?? 0;
  const target = planned?.total ?? null;
  const pct = target ? Math.min(100, (total / target) * 100) : 0;
  const onPlan = !!target && total >= target * (1 - LOAD_TOLERANCE) && total <= target * (1 + LOAD_TOLERANCE);
  const above = !!target && total > target * (1 + LOAD_TOLERANCE);
  const color = onPlan ? "bg-emerald-400" : above || finished ? "bg-amber-400" : "bg-emerald-400/70";
  const parts = LOAD_TYPES.map((t) => ({ t, v: done?.[t] ?? 0 })).filter((p) => p.v > 0);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex justify-between text-xs text-neutral-400">
          <span>Load</span>
          <span className="tabular-nums">
            {total ? au(total) : "–"} / {target === null ? "–" : `${planned?.source === "estimate" ? "~" : ""}${au(target)}`} AU
            {onPlan && <span className="ml-1 text-emerald-400">✓</span>}
            {above && <span className="ml-1 text-amber-300">above plan</span>}
          </span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-neutral-800">
          <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {parts.length > 0 && (
        <div>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Load by type">
            {parts.map(({ t, v }) => (
              <div key={t} style={{ width: `${(v / total) * 100}%`, background: COLORS[t] }} title={`${LOAD_TYPE_LABELS[t]}: ${au(v)} AU`} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-400">
            {LOAD_TYPES.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 tabular-nums">
                <i className="inline-block h-2 w-2 rounded-sm" style={{ background: COLORS[t] }} />
                {LOAD_TYPE_LABELS[t]} {au(done?.[t] ?? 0)}
                {planned && <span className="text-neutral-600">/{au(planned.estimate[t])}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <IntensityBar zones={zones} focus={focus} />
    </div>
  );
}

export function IntensityBar({ zones, focus }: { zones: ZoneWeek | undefined; focus?: string | null }) {
  if (!zones) return null;
  const { bands, minutes, missing } = zones;
  if (minutes === 0) {
    return missing ? (
      <p className="text-[11px] text-neutral-500">
        Time in zones: {missing} session{missing === 1 ? "" : "s"} waiting for the HR stream (next Garmin sync).
      </p>
    ) : null;
  }
  const verdict = judgeIntensity(bands, focus);
  const keys = ["easy", "moderate", "hard"] as const;
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-400">
        <span>Intensity · runs + bike/swim · {hours(minutes)}</span>
        {verdict && (
          <span className={VERDICT[verdict.status].cls}>
            {VERDICT[verdict.status].icon} 80/20
          </span>
        )}
      </div>
      <div className="mt-1 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Time by intensity">
        {keys
          .filter((k) => bands[k] > 0)
          .map((k) => (
            <div
              key={k}
              style={{ width: `${(bands[k] / minutes) * 100}%`, background: BAND_COLORS[k] }}
              title={`${BAND_LABELS[k]}: ${hours(bands[k])} (${Math.round((bands[k] / minutes) * 100)}%)`}
            />
          ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-neutral-400">
        {keys.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 tabular-nums">
            <i className="inline-block h-2 w-2 rounded-sm" style={{ background: BAND_COLORS[k] }} />
            {BAND_LABELS[k]} {Math.round((bands[k] / minutes) * 100)}%
          </span>
        ))}
      </div>
      {verdict && <p className={`mt-1 text-[11px] ${VERDICT[verdict.status].cls}`}>{verdict.message}</p>}
      {missing > 0 && (
        <p className="text-[11px] text-neutral-500">
          {missing} session{missing === 1 ? "" : "s"} without an HR stream yet.
        </p>
      )}
    </div>
  );
}
