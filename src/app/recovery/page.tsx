import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDay, todayISO } from "@/lib/dates";

const RANGES = [7, 14, 30] as const;

type Metric = { label: string; color: string; note: string; values: (number | null)[]; fmt: (v: number) => string };

// Recovery detail: HRV, resting HR, sleep, sleep score and form, day by day (7 / 14 / 30 days).
export default async function RecoveryPage({ searchParams }: PageProps<"/recovery">) {
  const { range: r } = await searchParams;
  const range = RANGES.find((n) => String(n) === r) ?? 30;
  const today = todayISO();
  const from = addDays(today, -(range - 1));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wellness")
    .select("date, hrv, resting_hr, sleep_s, sleep_score, ctl, atl")
    .gte("date", from)
    .lte("date", today)
    .order("date");
  const by = new Map((data ?? []).map((d) => [d.date, d]));
  const days = Array.from({ length: range }, (_, i) => addDays(from, i));
  const pick = (f: (d: NonNullable<ReturnType<typeof by.get>>) => number | null) =>
    days.map((d) => {
      const row = by.get(d);
      return row ? f(row) : null;
    });
  const r1 = (v: number) => (Math.round(v * 10) / 10).toString().replace("-", "−");
  const metrics: Metric[] = [
    { label: "HRV (ms)", color: "#34d399", note: "Higher is better.", values: pick((d) => (d.hrv === null ? null : Number(d.hrv))), fmt: (v) => `${Math.round(v)}` },
    { label: "Resting HR (bpm)", color: "#60a5fa", note: "Lower is better; +5 over your normal is a warning.", values: pick((d) => d.resting_hr), fmt: (v) => `${Math.round(v)}` },
    { label: "Sleep (h)", color: "#a78bfa", note: "Under 6 h on 2 of 3 nights is a warning.", values: pick((d) => (d.sleep_s === null ? null : d.sleep_s / 3600)), fmt: r1 },
    { label: "Sleep score", color: "#c084fc", note: "Garmin, 0–100.", values: pick((d) => d.sleep_score), fmt: (v) => `${Math.round(v)}` },
    {
      label: "Form (fitness − fatigue)",
      color: "#fbbf24",
      note: "Negative = training harder than your fitness absorbs; −10 to −30 is normal while building. Bar height = distance below zero.",
      values: pick((d) => (d.ctl === null || d.atl === null ? null : Number(d.ctl) - Number(d.atl))),
      fmt: r1,
    },
  ];

  return (
    <PageShell active="/">
      <PageHeader
        back={{ href: "/", label: "Today" }}
        eyebrow={`${formatDay(from)} – ${formatDay(today)} · Garmin`}
        title="Recovery"
      />
      {error && <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">Couldn&apos;t load data: {error.message}</p>}

      <nav aria-label="Range" className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-neutral-900 p-1">
        {RANGES.map((n) => (
          <Link
            key={n}
            href={`/recovery?range=${n}`}
            scroll={false}
            aria-current={n === range ? "page" : undefined}
            className={`flex h-10 items-center justify-center rounded-full text-sm font-semibold ${n === range ? "bg-neutral-100 text-neutral-950" : "text-neutral-400"}`}
          >
            {n} days
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        {metrics.map((m) => (
          <Bars key={m.label} m={m} />
        ))}
      </div>
    </PageShell>
  );
}

/** One bar per day (gaps for days without data), today in white. */
function Bars({ m }: { m: Metric }) {
  const nums = m.values.filter((v): v is number => v !== null);
  const mag = nums.map(Math.abs);
  const hi = Math.max(...mag, 1);
  const lo = Math.min(...mag, hi) * 0.8;
  const last = [...m.values].reverse().find((v): v is number => v !== null);
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-neutral-900 p-4">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{m.label}</span>
        <span className="text-[13px] text-neutral-400">
          last <b className="text-neutral-100">{last !== undefined ? m.fmt(last) : "–"}</b> · avg {avg !== null ? m.fmt(avg) : "–"}
        </span>
      </p>
      <div role="img" aria-label={`${m.label}, day by day`} className="flex h-24 items-end gap-0.5">
        {m.values.map((v, i) => (
          <span
            key={i}
            className="flex-1 rounded-t"
            style={{
              height: v === null ? "2px" : `${15 + ((Math.abs(v) - lo) / (hi - lo || 1)) * 85}%`,
              background: v === null ? "#262626" : i === m.values.length - 1 ? "#f5f5f5" : m.color,
              opacity: v === null || i === m.values.length - 1 ? 1 : 0.75,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-neutral-400">{m.note}</p>
    </section>
  );
}
