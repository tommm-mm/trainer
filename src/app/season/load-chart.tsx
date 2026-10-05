import { formatShortDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { LOAD_TYPES, LOAD_TYPE_LABELS, type WeekLoad } from "@/lib/metrics";
import type { PlannedLoad } from "@/lib/load";
import { FOCUS_COLORS, type PlanWeek } from "@/lib/season/model";
import { COLORS } from "@/app/analytics/theme";

// Planned load per week (block colour; dashed outline = the app's estimate,
// solid = a coach's target) with done load stacked by type on top.
// Server-rendered SVG like the km chart; hover titles carry the numbers.

const W = 340;
const H = 150;
const PAD_L = 30;
const PAD_R = 4;
const PAD_T = 8;
const PAD_B = 14;

export function LoadChart({
  weeks,
  planned,
  done,
  thisMonday,
}: {
  weeks: PlanWeek[];
  planned: Map<string, PlannedLoad>;
  done: Map<string, WeekLoad>;
  thisMonday: string;
}) {
  if (!weeks.length) return null;
  const n = weeks.length;
  const bw = (W - PAD_L - PAD_R) / n;
  const top = Math.max(
    1000,
    ...weeks.map((w) => planned.get(w.week_start)?.total ?? 0),
    ...weeks.map((w) => done.get(w.week_start)?.total ?? 0),
  );
  const step = top > 4000 ? 2000 : 1000;
  const max = Math.ceil((top * 1.05) / step) * step;
  const bottom = H - PAD_B;
  const y = (v: number) => PAD_T + (bottom - PAD_T) * (1 - Math.min(v, max) / max);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const au = (v: number) => formatNumber(Math.round(v), 0);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Planned and done load per week">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="#262626" />
            <text x={PAD_L - 5} y={y(t) + 3} fontSize="9" fill="#737373" textAnchor="end">
              {t ? `${t / 1000}k` : 0}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = PAD_L + i * bw + 1;
          const p = planned.get(w.week_start);
          const d = w.week_start <= thisMonday ? done.get(w.week_start) : undefined;
          const title =
            `${formatShortDate(w.week_start)} · ${w.block}${w.is_deload ? " (lighter)" : ""}` +
            (p ? ` · planned ${p.source === "estimate" ? "~" : ""}${au(p.total)} AU` : "") +
            (d ? ` · done ${au(d.total)} AU (${LOAD_TYPES.map((t) => `${LOAD_TYPE_LABELS[t]} ${au(d[t])}`).join(", ")})` : "");
          let acc = 0;
          return (
            <g key={w.week_start}>
              <title>{title}</title>
              {p && p.total > 0 && (
                <rect
                  x={x}
                  y={y(p.total)}
                  width={bw - 2}
                  height={bottom - y(p.total)}
                  rx={1.5}
                  fill={FOCUS_COLORS[w.focus]}
                  opacity={0.55}
                  stroke={FOCUS_COLORS[w.focus]}
                  strokeWidth={0.8}
                  strokeDasharray={p.source === "estimate" ? "2 1.5" : undefined}
                />
              )}
              {d &&
                LOAD_TYPES.map((t) => {
                  const v = d[t];
                  if (v <= 0) return null;
                  const y1 = y(acc + v);
                  const y0 = y(acc);
                  acc += v;
                  return (
                    <rect
                      key={t}
                      x={x + (bw - 2) * 0.2}
                      y={y1}
                      width={(bw - 2) * 0.6}
                      height={Math.max(0, y0 - y1 - 0.6)}
                      fill={COLORS[t]}
                    />
                  );
                })}
            </g>
          );
        })}
        {(() => {
          const i = weeks.findIndex((w) => w.week_start === thisMonday);
          if (i < 0) return null;
          const cx = PAD_L + i * bw + bw / 2;
          return <path d={`M${cx - 4} ${H - 1} L${cx + 4} ${H - 1} L${cx} ${H - 6}Z`} fill="#ededed" />;
        })()}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-400">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-sm border border-dashed border-neutral-400 bg-neutral-500/40" />
          planned (dashed = estimate)
        </span>
        {LOAD_TYPES.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm" style={{ background: COLORS[t] }} />
            {LOAD_TYPE_LABELS[t]}
          </span>
        ))}
        <span>▲ now</span>
      </div>
    </div>
  );
}
