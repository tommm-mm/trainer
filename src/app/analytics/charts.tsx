"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue, type ValueFormat } from "./format";
import { COLORS, STATUS_COLOR } from "./theme";

export type Series = {
  key: string;
  name: string;
  color: string;
  stackId?: string;
};

type ZoneStatus = "good" | "watch" | "off";

export type Zone = { from: number; to: number; status: ZoneStatus; label?: string };
export type Threshold = { y: number; status: ZoneStatus; label: string };

type Row = Record<string, string | number | null>;

const HEIGHT = 200;
const SURFACE = "#171717";

const axisProps = {
  tick: { fill: COLORS.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: COLORS.grid },
} as const;

/**
 * One chart for every Stats card: optional bars (stackable), optional lines,
 * an optional trend overlay, shaded status zones and threshold lines.
 */
export function StatChart({
  data,
  bars = [],
  lines = [],
  trend,
  format,
  zones = [],
  thresholds = [],
  domain,
  ticks,
  reversed = false,
}: {
  data: Row[];
  bars?: Series[];
  lines?: Series[];
  /** Key in `data` holding the trend values (drawn dashed, neutral colour). */
  trend?: { key: string; name: string };
  format: ValueFormat;
  zones?: Zone[];
  thresholds?: Threshold[];
  domain?: [number, number];
  /** Explicit y ticks (round numbers instead of Recharts' auto ticks). */
  ticks?: number[];
  /** For pace: faster (smaller) values plotted higher. */
  reversed?: boolean;
}) {
  const legend = [
    ...bars.map((s) => ({ name: s.name, color: s.color, dashed: false })),
    ...lines.map((s) => ({ name: s.name, color: s.color, dashed: false })),
    ...(trend ? [{ name: trend.name, color: COLORS.trend, dashed: true }] : []),
  ];

  return (
    <div>
      {legend.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-300">
          {legend.map((l) => (
            <span key={l.name} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3"
                style={
                  l.dashed
                    ? { borderTop: `2px dashed ${l.color}` }
                    : { height: 8, borderRadius: 2, background: l.color }
                }
              />
              {l.name}
            </span>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
          <YAxis
            {...axisProps}
            width={46}
            domain={domain ?? ["auto", "auto"]}
            ticks={ticks}
            reversed={reversed}
            tickFormatter={(v: number) => formatValue(v, format, true)}
          />

          {zones.map((z) => (
            <ReferenceArea
              key={`${z.from}-${z.to}`}
              y1={z.from}
              y2={z.to}
              fill={STATUS_COLOR[z.status]}
              fillOpacity={0.12}
              stroke="none"
              ifOverflow="hidden"
              label={
                z.label
                  ? { value: z.label, position: "insideTopRight", fill: STATUS_COLOR[z.status], fontSize: 10 }
                  : undefined
              }
            />
          ))}
          {thresholds.map((t) => (
            <ReferenceLine
              key={t.y}
              y={t.y}
              stroke={STATUS_COLOR[t.status]}
              strokeWidth={1}
              ifOverflow="extendDomain"
              label={{ value: t.label, position: "insideTopRight", fill: STATUS_COLOR[t.status], fontSize: 10 }}
            />
          ))}

          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.06)", stroke: COLORS.axis, strokeWidth: 1 }}
            contentStyle={{
              background: SURFACE,
              border: "1px solid #404040",
              borderRadius: 8,
              fontSize: 12,
              color: "#e5e5e5",
            }}
            labelStyle={{ color: "#fafafa", fontWeight: 600, marginBottom: 2 }}
            itemStyle={{ color: "#e5e5e5", padding: 0 }}
            formatter={(value, name) =>
              value === null || value === undefined
                ? ["–", name]
                : [formatValue(Number(value), format), name]
            }
          />

          {bars.map((s, i) => {
            // Round only the top segment of a stack.
            const top = !s.stackId || !bars.slice(i + 1).some((o) => o.stackId === s.stackId);
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                stackId={s.stackId}
                radius={top ? [4, 4, 0, 0] : 0}
                stroke={SURFACE}
                strokeWidth={s.stackId ? 1 : 0}
                isAnimationActive={false}
              />
            );
          })}
          {lines.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, stroke: SURFACE, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: s.color, stroke: SURFACE, strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          {trend && (
            <Line
              type="linear"
              dataKey={trend.key}
              name={trend.name}
              stroke={COLORS.trend}
              strokeOpacity={0.85}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
