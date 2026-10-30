"use client";

import { useState } from "react";
import Link from "next/link";
import type { Readiness, ReadinessBand } from "@/lib/readiness";
import type { Signal } from "@/lib/recovery";

export type TrendPoint = { date: string; hrv: number | null; rhr: number | null; sleepH: number | null; form: number | null };

const LOOK: Record<ReadinessBand | "unknown", { color: string; word: string }> = {
  ready: { color: "#34d399", word: "Ready" },
  good: { color: "#34d399", word: "Good" },
  easy: { color: "#fbbf24", word: "Easy" },
  rest: { color: "#f87171", word: "Rest" },
  unknown: { color: "#525252", word: "No data" },
};
const BAR: Record<string, string> = { hrv: "#34d399", rhr: "#60a5fa", sleep: "#a78bfa", form: "#fbbf24" };
const C = 2 * Math.PI * 48;
const RANGES = [7, 14, 30] as const;

/** Top of Today: the readiness score and what makes it; tap for 7 / 14 / 30-day trends. */
export function ReadinessCard({ r, trend, signals }: { r: Readiness | null; trend: TrendPoint[]; signals: Signal[] }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const look = LOOK[r?.band ?? "unknown"];
  const pts = trend.slice(-range);
  const lines = [
    { label: "HRV", key: "hrv" as const, color: BAR.hrv, fmt: (v: number) => `${Math.round(v)}` },
    { label: "Resting HR", key: "rhr" as const, color: BAR.rhr, fmt: (v: number) => `${Math.round(v)}` },
    { label: "Sleep h", key: "sleepH" as const, color: BAR.sleep, fmt: (v: number) => v.toFixed(1) },
    { label: "Form", key: "form" as const, color: BAR.form, fmt: (v: number) => `${v < 0 ? "−" : ""}${Math.abs(Math.round(v))}` },
  ];

  return (
    <section className="mb-4 rounded-2xl bg-neutral-900 p-5">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-5 text-left">
        <div className="relative h-28 w-28 shrink-0">
          <svg role="img" aria-label={`Readiness ${r?.score ?? "unknown"}: ${look.word}`} viewBox="0 0 112 112" className="h-28 w-28">
            <circle cx="56" cy="56" r="48" fill="none" stroke="#262626" strokeWidth="10" />
            <circle
              cx="56" cy="56" r="48" fill="none" stroke={look.color} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - (r?.score ?? 0) / 100)} transform="rotate(-90 56 56)"
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold leading-none tabular-nums">{r?.score ?? "–"}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: look.color }}>
              {look.word}
            </span>
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <p className="flex justify-between text-[11px] uppercase tracking-wider text-neutral-400">
            <span>Readiness</span>
            <span aria-hidden>{open ? "▴" : "▾"}</span>
          </p>
          {(r?.parts ?? []).map((p) => (
            <div key={p.key} className="flex flex-col gap-1">
              <p className="flex justify-between text-[13px]">
                <span className="text-neutral-300">{p.label}</span>
                <span className="tabular-nums">
                  <b>{p.value}</b> {p.vs && <span className="text-neutral-400">{p.vs}</span>}
                </span>
              </p>
              <span className="h-1 rounded-full bg-neutral-800">
                <span
                  className="block h-1 rounded-full"
                  style={{ width: `${p.score}%`, background: p.score >= 60 ? "#34d399" : p.score >= 40 ? "#fbbf24" : "#f87171" }}
                />
              </span>
            </div>
          ))}
          {!r && <p className="text-sm text-neutral-400">No Garmin data from last night yet.</p>}
        </div>
      </button>

      {signals.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-amber-200">
          {signals.map((s) => (
            <li key={s.code}>{s.message}</li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-4 flex flex-col gap-3 border-t border-neutral-800 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400">Trend</span>
            <div className="flex gap-1 rounded-full bg-neutral-950 p-1">
              {RANGES.map((n) => (
                <button
                  key={n}
                  onClick={() => setRange(n)}
                  aria-pressed={n === range}
                  className={`h-8 rounded-full px-3 text-xs font-semibold ${n === range ? "bg-neutral-100 text-neutral-950" : "text-neutral-400"}`}
                >
                  {n} days
                </button>
              ))}
            </div>
          </div>
          {lines.map((l) => {
            const vals = pts.map((p) => p[l.key]);
            const last = [...vals].reverse().find((v): v is number => v !== null);
            return (
              <div key={l.key} className="grid grid-cols-[88px_1fr_44px] items-center gap-2">
                <span className="text-[13px] text-neutral-300">{l.label}</span>
                <Sparkline values={vals} color={l.color} label={l.label} />
                <span className="text-right text-[13px] font-semibold tabular-nums">{last !== undefined ? l.fmt(last) : "–"}</span>
              </div>
            );
          })}
          <Link href={`/recovery?range=${range}`} className="text-sm font-semibold text-emerald-400">
            Recovery detail ›
          </Link>
          <p className="text-[11px] text-neutral-500">
            Score: HRV vs your normal 35% · sleep 30% · resting HR 20% · form 15%. 80+ ready · 60–79 good · 40–59 easy · under 40 rest.
          </p>
        </div>
      )}
    </section>
  );
}

/** A line over the days given; gaps (no data) are skipped. */
function Sparkline({ values, color, label }: { values: (number | null)[]; color: string; label: string }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className="text-xs text-neutral-500">not enough data</span>;
  const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
  const step = 200 / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => (v === null ? null : `${(i * step).toFixed(1)},${(30 - ((v - lo) / span) * 26).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg role="img" aria-label={`${label} trend`} viewBox="0 0 200 34" preserveAspectRatio="none" className="h-8 w-full">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
