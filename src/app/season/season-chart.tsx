import { formatShortDate } from "@/lib/dates";
import { FOCUS_COLORS, FOCUS_LABELS, type Focus, type PlanWeek } from "@/lib/season/model";

// The whole season in one picture: planned km per week coloured by block
// (lighter = deload), done km on top, long run as a line, a phase band under
// the axis, flags on tests and races. Server-rendered SVG, no client JS.

const W = 340;
const H = 190;
const PAD_L = 24;
const PAD_R = 4;
const PAD_T = 14;
const BAND = 5;
const PAD_B = 16 + BAND + 4;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A label on the first week of each month, skipped when too close to the previous one. */
function monthLabels(weeks: PlanWeek[]): { i: number; label: string }[] {
  const out: { i: number; label: string }[] = [];
  weeks.forEach((w, i) => {
    const month = w.week_start.slice(5, 7);
    if (i > 0 && weeks[i - 1].week_start.slice(5, 7) === month) return;
    if (out.length && i - out.at(-1)!.i < 3) return;
    out.push({ i, label: MONTHS[Number(month) - 1] });
  });
  return out;
}

export function SeasonChart({
  weeks,
  done,
  thisMonday,
  goalMonday,
}: {
  weeks: PlanWeek[];
  done: Map<string, number>;
  thisMonday: string;
  goalMonday: string | null;
}) {
  if (!weeks.length) return null;
  const n = weeks.length;
  const bw = (W - PAD_L - PAD_R) / n;
  const top = Math.max(...weeks.map((w) => w.run_km ?? 0), ...done.values(), 10);
  const max = Math.ceil((top + 4) / 10) * 10;
  const plotBottom = H - PAD_B;
  const y = (v: number) => PAD_T + (plotBottom - PAD_T) * (1 - v / max);
  const cx = (i: number) => PAD_L + i * bw + bw / 2;
  const ticks = [0, 20, 40, 60, 80].filter((t) => t <= max);

  const longPath = weeks
    .map((w, i) => (w.long_run_km != null ? `${cx(i).toFixed(1)} ${y(Math.min(w.long_run_km, max)).toFixed(1)}` : null))
    .filter(Boolean)
    .map((p, i) => (i ? "L" : "M") + p)
    .join("");
  const todayIdx = weeks.findIndex((w) => w.week_start === thisMonday);
  const focuses = [...new Set(weeks.map((w) => w.focus))] as Focus[];

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Planned and done kilometres per week">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="#262626" />
            <text x={PAD_L - 5} y={y(t) + 3} fontSize="9" fill="#737373" textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        {weeks.map((w, i) => {
          const x = PAD_L + i * bw + 1;
          const planned = w.run_km ?? 0;
          const future = w.week_start > thisMonday;
          const actual = done.get(w.week_start);
          const opacity = (future ? 0.55 : 0.85) * (w.is_deload ? 0.55 : 1);
          const flag = w.week_start === goalMonday ? "★" : w.milestone ? "⚑" : null;
          return (
            <g key={w.week_start}>
              <rect x={x} y={y(planned)} width={bw - 2} height={plotBottom - y(planned)} rx={1.5} fill={FOCUS_COLORS[w.focus]} opacity={opacity}>
                <title>
                  {`${formatShortDate(w.week_start)} · ${w.block}${w.is_deload ? " (lighter)" : ""} · ${planned} km planned` +
                    (actual != null ? ` · ${actual} km done` : "") +
                    (w.long_run_km ? ` · long ${w.long_run_km} km` : "") +
                    (w.milestone ? ` · ${w.milestone}` : "")}
                </title>
              </rect>
              {actual != null && !future && (
                <rect
                  x={x + (bw - 2) * 0.2}
                  y={y(Math.min(actual, max))}
                  width={(bw - 2) * 0.6}
                  height={plotBottom - y(Math.min(actual, max))}
                  rx={1}
                  fill="#34d399"
                />
              )}
              {flag && (
                <text x={cx(i)} y={y(planned) - 3} fontSize="8.5" fill="#ededed" textAnchor="middle">
                  {flag}
                </text>
              )}
              <rect x={PAD_L + i * bw} y={plotBottom + 2} width={bw + 0.3} height={BAND} fill={FOCUS_COLORS[w.focus]} />
            </g>
          );
        })}

        {longPath && <path d={longPath} fill="none" stroke="#38bdf8" strokeWidth={1.4} opacity={0.9} />}

        {todayIdx >= 0 && (
          <path
            d={`M${cx(todayIdx) - 4} ${plotBottom + BAND + 8} L${cx(todayIdx) + 4} ${plotBottom + BAND + 8} L${cx(todayIdx)} ${plotBottom + BAND + 3}Z`}
            fill="#ededed"
          />
        )}

        {monthLabels(weeks).map(({ i, label }) => (
          <text key={`m${i}`} x={cx(i)} y={H - 3} fontSize="9" fill="#737373" textAnchor="middle">
            {label}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-400">
        {focuses.map((f) => (
          <span key={f} className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm" style={{ background: FOCUS_COLORS[f] }} />
            {FOCUS_LABELS[f]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
          done
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-0.5 w-3 bg-sky-400" />
          long run
        </span>
        <span>⚑ test / race · ▲ now</span>
      </div>
    </div>
  );
}
