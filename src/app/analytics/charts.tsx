"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue, type ValueFormat } from "./format";

// Dark-surface chart tokens (validated categorical steps for dark mode).
export const COLORS = {
  run: "#3987e5", // series 1 – blue
  gym: "#d95926", // series 2 – orange
  muted: "#525250", // de-emphasised bars (not enough data)
  band: "#0ca30c", // "good" status – safe zones only
  warn: "#fab219", // "warning" status – thresholds only
  grid: "#2c2c2a",
  axis: "#898781",
} as const;

export type Series = {
  key: string;
  name: string;
  color: string;
  stackId?: string;
};

export type Guides = {
  /** Shaded horizontal band, e.g. the 0.8–1.3 ACWR sweet spot. */
  band?: { from: number; to: number; label: string };
  /** Horizontal threshold line, e.g. monotony 2.0. */
  line?: { y: number; label: string };
};

type Row = Record<string, string | number | null>;

const HEIGHT = 190;

const axisProps = {
  tick: { fill: COLORS.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: COLORS.grid },
} as const;

function guides(g: Guides | undefined) {
  return (
    <>
      {g?.band && (
        <ReferenceArea
          y1={g.band.from}
          y2={g.band.to}
          fill={COLORS.band}
          fillOpacity={0.14}
          stroke="none"
          ifOverflow="extendDomain"
          label={{ value: g.band.label, position: "insideTopRight", fill: COLORS.band, fontSize: 10 }}
        />
      )}
      {g?.line && (
        <ReferenceLine
          y={g.line.y}
          stroke={COLORS.warn}
          strokeWidth={1}
          ifOverflow="extendDomain"
          label={{ value: g.line.label, position: "insideTopRight", fill: COLORS.warn, fontSize: 10 }}
        />
      )}
    </>
  );
}

function tooltip(format: ValueFormat) {
  return (
    <Tooltip
      cursor={{ fill: "rgba(255,255,255,0.05)", stroke: COLORS.axis }}
      contentStyle={{
        background: "#171717",
        border: "1px solid #262626",
        borderRadius: 8,
        fontSize: 12,
      }}
      labelStyle={{ color: "#e5e5e5", marginBottom: 2 }}
      itemStyle={{ padding: 0 }}
      formatter={(value, name) =>
        value === null || value === undefined
          ? ["–", name]
          : [formatValue(Number(value), format), name]
      }
    />
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-1 flex gap-3 text-[11px] text-neutral-400">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export function BarsChart({
  data,
  series,
  format,
  guides: g,
  legend = series,
}: {
  data: Row[];
  series: Series[];
  format: ValueFormat;
  guides?: Guides;
  /** Legend entries (defaults to all series; hide helper series by overriding). */
  legend?: Series[];
}) {
  return (
    <div>
      <Legend series={legend} />
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
          <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatValue(v, format, true)} />
          {guides(g)}
          {tooltip(format)}
          {series.map((s, i) => {
            // Round only the top of the stack (last series in a stack).
            const top = !s.stackId || !series.slice(i + 1).some((o) => o.stackId === s.stackId);
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                stackId={s.stackId}
                radius={top ? [4, 4, 0, 0] : 0}
                stroke="#171717"
                strokeWidth={s.stackId ? 1 : 0}
                isAnimationActive={false}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LinesChart({
  data,
  series,
  format,
  guides: g,
  domain,
  reversed = false,
  dots = true,
}: {
  data: Row[];
  series: Series[];
  format: ValueFormat;
  guides?: Guides;
  domain?: [number, number];
  /** For pace: faster (smaller) values plotted higher. */
  reversed?: boolean;
  dots?: boolean;
}) {
  return (
    <div>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
          <YAxis
            {...axisProps}
            width={44}
            domain={domain ?? ["auto", "auto"]}
            reversed={reversed}
            allowDecimals
            tickFormatter={(v: number) => formatValue(v, format, true)}
          />
          {guides(g)}
          {tooltip(format)}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={dots ? { r: 3, fill: s.color, stroke: "#171717", strokeWidth: 2 } : false}
              activeDot={{ r: 5, stroke: "#171717", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
