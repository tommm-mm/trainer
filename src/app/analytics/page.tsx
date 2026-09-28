import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { cardCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { addDays, daysBetween, formatLongDate, formatShortDate, mondayOf, todayISO } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { fetchHrSettings } from "@/lib/intervals";
import { BACKFILL_DAYS } from "@/lib/sync";
import {
  ACWR_SAFE,
  acwrSeries,
  dailyLoads,
  EASY_MAX_HRR,
  EASY_MAX_RPE,
  estimatedLoadShare,
  LONG_RUN_MIN_WEEK_KM,
  LONG_RUN_SHARE,
  MONOTONY_HIGH,
  referenceHr,
  resolveHrAnchors,
  sessionLoads,
  trainingSummary,
  weekStarts,
  weeklyAerobic,
  weeklyMonotony,
  weeklyRunning,
  type HrAnchors,
} from "@/lib/metrics";
import { BarsChart, COLORS, LinesChart } from "./charts";
import { formatValue } from "./format";
import { ImportHistory } from "./import-history";

const WEEKS = 12;
const ACWR_DAYS = 56;
const HISTORY_TARGET_DAYS = WEEKS * 7;

export default async function AnalyticsPage() {
  const today = todayISO();
  const weeks = weekStarts(today, WEEKS);
  // 12 weeks of charts + 28 days so the first ACWR point has a full window.
  const from = addDays(weeks[0], -28);

  const supabase = await createClient();
  const [actsRes, firstRes, bodyRes, hr] = await Promise.all([
    supabase
      .from("activities")
      .select("date, type, distance_km, duration_min, avg_hr, max_hr, rpe")
      .gte("date", from)
      .lte("date", today)
      .order("date"),
    supabase.from("activities").select("date").order("date").limit(1).maybeSingle(),
    supabase
      .from("body_metrics")
      .select("date, weight_kg, body_fat_pct")
      .gte("date", addDays(today, -180))
      .order("date"),
    fetchHrSettings(addDays(today, -30), today),
  ]);
  const loadError = actsRes.error ?? firstRes.error ?? bodyRes.error;
  const acts = actsRes.data ?? [];
  const historyStart = firstRes.data?.date ?? null;
  const body = (bodyRes.data ?? []).filter((b) => b.weight_kg !== null || b.body_fat_pct !== null);

  const anchors = resolveHrAnchors({
    garminRest: hr.restHr,
    garminMax: hr.maxHr,
    activities: acts,
  });
  const sessions = sessionLoads(acts, anchors);
  const daily = dailyLoads(sessions, from, today);
  const summary = trainingSummary(acts, anchors, today);

  const running = weeklyRunning(acts, today, WEEKS);
  const aerobic = weeklyAerobic(acts, anchors, today, WEEKS);
  const monotony = weeklyMonotony(daily, today).filter((w) => w.week >= weeks[0]);
  const acwr = acwrSeries(daily, historyStart).slice(-ACWR_DAYS);
  const windowSessions = sessions.filter((s) => s.date >= weeks[0]);
  const estimatedShare = estimatedLoadShare(windowSessions);
  const weeklyLoad = weeks.map((w) => {
    const days = daily.filter((d) => mondayOf(d.date) === w);
    return {
      label: formatShortDate(w),
      run: sum(days.map((d) => d.run)),
      gym: sum(days.map((d) => d.gym)),
    };
  });

  const refHr = referenceHr(anchors);
  const easyHr = Math.round(anchors.rest + EASY_MAX_HRR * (anchors.max - anchors.rest));
  const shortHistory = !historyStart || daysBetween(historyStart, today) < HISTORY_TARGET_DAYS;
  const isCurrent = (w: string) => w === weeks[weeks.length - 1];

  return (
    <PageShell active="/analytics">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Stats</h1>
        <p className="text-sm text-neutral-400">
          Last {WEEKS} weeks · computed from your activities, no AI
        </p>
      </header>

      {loadError && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load data: {loadError.message}
        </p>
      )}

      {shortHistory && (
        <ImportHistory
          days={BACKFILL_DAYS}
          since={historyStart ? formatLongDate(historyStart) : null}
        />
      )}

      <section className="mb-4 grid grid-cols-2 gap-2">
        <Tile
          label="ACWR today"
          value={summary.acwr === null ? "–" : summary.acwr.toFixed(2)}
          note={acwrZone(summary.acwr)}
        />
        <Tile
          label="Monotony (7 d)"
          value={summary.monotony7d === null ? "–" : summary.monotony7d.toFixed(2)}
          note={
            summary.monotony7d === null
              ? "needs varied days"
              : summary.monotony7d > MONOTONY_HIGH
                ? "⚠ too uniform"
                : "✓ varied enough"
          }
        />
        <Tile label="Run km this week" value={formatNumber(summary.weekKm)} note={`${running.at(-1)!.runs} runs`} />
        <Tile
          label="Load with estimated RPE"
          value={estimatedShare === null ? "–" : `${formatNumber(estimatedShare * 100, 0)}%`}
          note="rate sessions to lower it"
        />
      </section>

      <div className="flex flex-col gap-4">
        <ChartCard
          title="Weekly running volume"
          how="Total running km per week (Mon–Sun). Build gradually: roughly +10% a week at most, with a lighter week every 3–4 weeks to absorb the work."
          table={{
            headers: ["Week", "km", "Runs"],
            rows: running.map((r) => [formatShortDate(r.week), formatNumber(r.km), String(r.runs)]),
          }}
        >
          <BarsChart
            data={running.map((r) => ({ label: formatShortDate(r.week), km: round(r.km, 1) }))}
            series={[{ key: "km", name: "Run km", color: COLORS.run }]}
            format="km"
          />
        </ChartCard>

        <ChartCard
          title="Long-run share"
          how={`Longest run ÷ that week's km. The green band (${pct(LONG_RUN_SHARE.low)}–${pct(LONG_RUN_SHARE.high)}) is the usual guideline; well above it, one run carries too much of the week. Grey bars are weeks under ${LONG_RUN_MIN_WEEK_KM} km, where a single run naturally dominates.`}
          table={{
            headers: ["Week", "Longest", "Week km", "Share"],
            rows: running.map((r) => [
              formatShortDate(r.week),
              r.runs ? `${formatNumber(r.longestKm)} km` : "–",
              formatNumber(r.km),
              r.longRunShare === null ? "–" : pct(r.longRunShare),
            ]),
          }}
        >
          <BarsChart
            data={running.map((r) => {
              const enough = r.km >= LONG_RUN_MIN_WEEK_KM;
              return {
                label: formatShortDate(r.week),
                share: enough ? r.longRunShare : null,
                shareLow: enough ? null : r.longRunShare,
              };
            })}
            series={[
              { key: "share", name: "Long-run share", color: COLORS.run, stackId: "s" },
              { key: "shareLow", name: `Under ${LONG_RUN_MIN_WEEK_KM} km`, color: COLORS.muted, stackId: "s" },
            ]}
            format="pct"
            guides={{ band: { from: LONG_RUN_SHARE.low, to: LONG_RUN_SHARE.high, label: "30–35%" } }}
          />
        </ChartCard>

        <ChartCard
          title="Weekly training load"
          how={`Session load (sRPE) = minutes × effort (RPE 1–10), in arbitrary units (AU); gym counts too, because fatigue adds up wherever it comes from. ${
            estimatedShare ? `${pct(estimatedShare)} of this load uses an estimated RPE (see below).` : ""
          }`}
          table={{
            headers: ["Week", "Run", "Gym", "Total"],
            rows: weeklyLoad.map((w) => [
              w.label,
              formatNumber(w.run, 0),
              formatNumber(w.gym, 0),
              formatNumber(w.run + w.gym, 0),
            ]),
          }}
        >
          <BarsChart
            data={weeklyLoad}
            series={[
              { key: "run", name: "Run", color: COLORS.run, stackId: "l" },
              { key: "gym", name: "Gym", color: COLORS.gym, stackId: "l" },
            ]}
            format="load"
          />
        </ChartCard>

        <ChartCard
          title="Acute:chronic workload ratio (ACWR)"
          how={`Last 7 days of load ÷ your average week over the last 28 days. 1.0 = training exactly as you're used to. The green band (${ACWR_SAFE.low}–${ACWR_SAFE.high}) is the sweet spot; above 1.5 is a spike linked to higher injury risk; below 0.8 you're losing fitness. Blank until 28 days of history exist.`}
          table={{
            headers: ["Day", "7-d load", "Avg week (28 d)", "ACWR"],
            rows: acwr
              .filter((_, i, a) => (a.length - 1 - i) % 7 === 0)
              .map((p) => [
                formatShortDate(p.date),
                formatNumber(p.acute, 0),
                formatNumber(p.chronic, 0),
                p.ratio === null ? "–" : p.ratio.toFixed(2),
              ]),
          }}
        >
          <LinesChart
            data={acwr.map((p) => ({
              label: formatShortDate(p.date),
              ratio: p.ratio === null ? null : round(p.ratio, 2),
            }))}
            series={[{ key: "ratio", name: "ACWR", color: COLORS.run }]}
            format="ratio"
            domain={[0, Math.max(2, Math.ceil(Math.max(0, ...acwr.map((p) => p.ratio ?? 0)) * 2) / 2)]}
            guides={{ band: { from: ACWR_SAFE.low, to: ACWR_SAFE.high, label: "0.8–1.3" } }}
            dots={false}
          />
        </ChartCard>

        <ChartCard
          title="Training monotony"
          how={`Average daily load ÷ how much it varies day to day (standard deviation) within each week, rest days included. Alternating hard and easy days keeps it low; above ${MONOTONY_HIGH.toFixed(1)}, every day looks the same, and that raises the risk of illness and overtraining even at moderate volume. The current week counts only the days so far.`}
          table={{
            headers: ["Week", "Load", "Mean/day", "SD", "Monotony", "Strain"],
            rows: monotony.map((m) => [
              formatShortDate(m.week) + (isCurrent(m.week) ? "*" : ""),
              formatNumber(m.load, 0),
              formatNumber(m.mean, 0),
              formatNumber(m.sd, 0),
              m.monotony === null ? "–" : m.monotony.toFixed(2),
              m.strain === null ? "–" : formatNumber(m.strain, 0),
            ]),
          }}
        >
          <BarsChart
            data={monotony.map((m) => ({
              label: formatShortDate(m.week),
              monotony: m.monotony === null ? null : round(m.monotony, 2),
            }))}
            series={[{ key: "monotony", name: "Monotony", color: COLORS.run }]}
            format="ratio"
            guides={{ line: { y: MONOTONY_HIGH, label: "2.0" } }}
          />
        </ChartCard>

        <ChartCard
          title="Training strain"
          how="Weekly load × monotony. Peaks show weeks that were both big and uniform, the combination Foster linked to getting sick. Compare your weeks against each other; there's no universal threshold."
        >
          <BarsChart
            data={monotony.map((m) => ({
              label: formatShortDate(m.week),
              strain: m.strain === null ? null : Math.round(m.strain),
            }))}
            series={[{ key: "strain", name: "Strain", color: COLORS.run }]}
            format="load"
          />
        </ChartCard>

        <ChartCard
          title="Easy-run heart rate"
          how={`Average HR on easy runs (rated RPE ≤ ${EASY_MAX_RPE}, or unrated at ≤ ${easyHr} bpm, i.e. ${pct(EASY_MAX_HRR)} of heart-rate reserve). If it drifts down at similar paces, your aerobic engine is improving. Heat, poor sleep and stress push it up.`}
          table={{
            headers: ["Week", "Easy runs", "Avg HR", "EF", `Pace @${refHr}`],
            rows: aerobic.map((a) => [
              formatShortDate(a.week),
              String(a.easyRuns),
              a.avgHr === null ? "–" : formatNumber(a.avgHr, 0),
              a.ef === null ? "–" : a.ef.toFixed(2),
              a.paceAtRefHr === null ? "–" : formatValue(a.paceAtRefHr, "pace"),
            ]),
          }}
        >
          <LinesChart
            data={aerobic.map((a) => ({
              label: formatShortDate(a.week),
              hr: a.avgHr === null ? null : Math.round(a.avgHr),
            }))}
            series={[{ key: "hr", name: "Avg HR", color: COLORS.run }]}
            format="bpm"
          />
        </ChartCard>

        <ChartCard
          title={`Easy pace at ${refHr} bpm`}
          how={`Efficiency Factor (metres per minute ÷ avg HR) turned into the pace you'd hold at ${refHr} bpm (${pct(0.65)} of heart-rate reserve). Higher on the chart = faster at the same heart rate = fitter. Read the trend over weeks, not single points.`}
        >
          <LinesChart
            data={aerobic.map((a) => ({
              label: formatShortDate(a.week),
              pace: a.paceAtRefHr === null ? null : Math.round(a.paceAtRefHr),
            }))}
            series={[{ key: "pace", name: `Pace @${refHr}`, color: COLORS.run }]}
            format="pace"
            reversed
          />
        </ChartCard>

        {body.some((b) => b.weight_kg !== null) && (
          <ChartCard
            title="Weight"
            how="Daily weigh-ins swing about ±1 kg with water, salt and food. Read the direction across weeks, not day to day, and weigh at the same time (morning, before breakfast)."
            table={{
              headers: ["Date", "kg"],
              rows: body
                .filter((b) => b.weight_kg !== null)
                .slice(-12)
                .map((b) => [formatShortDate(b.date), formatNumber(b.weight_kg)]),
            }}
          >
            <LinesChart
              data={body
                .filter((b) => b.weight_kg !== null)
                .map((b) => ({ label: formatShortDate(b.date), kg: b.weight_kg }))}
              series={[{ key: "kg", name: "Weight", color: COLORS.run }]}
              format="kg"
            />
          </ChartCard>
        )}

        {body.some((b) => b.body_fat_pct !== null) && (
          <ChartCard
            title="Body fat"
            how="Home scales estimate body fat from electrical impedance, which moves with hydration. Compare readings taken under the same conditions and look at the multi-week trend."
          >
            <LinesChart
              data={body
                .filter((b) => b.body_fat_pct !== null)
                .map((b) => ({ label: formatShortDate(b.date), bf: b.body_fat_pct! / 100 }))}
              series={[{ key: "bf", name: "Body fat", color: COLORS.gym }]}
              format="pct"
            />
          </ChartCard>
        )}

        <HowComputed anchors={anchors} easyHr={easyHr} refHr={refHr} estimatedShare={estimatedShare} />
      </div>
    </PageShell>
  );
}

function ChartCard({
  title,
  how,
  table,
  children,
}: {
  title: string;
  how: string;
  table?: { headers: string[]; rows: string[][] };
  children: React.ReactNode;
}) {
  return (
    <section className={cardCls}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-2 mt-0.5 text-xs leading-relaxed text-neutral-400">
        <span className="text-neutral-300">How to read: </span>
        {how}
      </p>
      {children}
      {table && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-neutral-500">Show numbers</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-neutral-500">
                <tr>
                  {table.headers.map((h) => (
                    <th key={h} className="px-1 py-1 text-right font-normal first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-neutral-300">
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t border-neutral-800">
                    {r.map((c, j) => (
                      <td key={j} className="px-1 py-1 text-right first:text-left">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-neutral-400">{note}</p>
    </div>
  );
}

function HowComputed({
  anchors,
  easyHr,
  refHr,
  estimatedShare,
}: {
  anchors: HrAnchors;
  easyHr: number;
  refHr: number;
  estimatedShare: number | null;
}) {
  const restFrom = anchors.restSource === "garmin" ? "Garmin, 30-day median" : "default";
  const maxFrom = {
    garmin: "intervals.icu setting",
    observed: "highest HR seen in a session",
    default: "your reported max (floor)",
  }[anchors.maxSource];
  return (
    <section className={`${cardCls} text-xs leading-relaxed text-neutral-400`}>
      <h2 className="mb-1 text-sm font-semibold text-neutral-200">How these numbers are made</h2>
      <p>
        <span className="text-neutral-300">Heart-rate anchors:</span> resting {anchors.rest} bpm (
        {restFrom}) · max {anchors.max} bpm ({maxFrom}). Easy runs ≤ {easyHr} bpm, reference HR{" "}
        {refHr} bpm.
      </p>
      <p className="mt-1">
        <span className="text-neutral-300">Missing RPE</span>
        {estimatedShare !== null && ` (${pct(estimatedShare)} of recent load)`}: runs use your HR
        (RPE ≈ 15 × %HR-reserve − 6); gym uses your median gym RPE, because strength work
        barely lifts HR; anything else uses your median for that type, or 5. Rate sessions
        on the{" "}
        <Link href="/" className="text-emerald-400">
          Week
        </Link>{" "}
        feedback card to replace estimates with real values.
      </p>
    </section>
  );
}

function acwrZone(ratio: number | null): string {
  if (ratio === null) return "needs 28 days of data";
  if (ratio < ACWR_SAFE.low) return "↓ below sweet spot";
  if (ratio <= ACWR_SAFE.high) return "✓ sweet spot";
  if (ratio <= 1.5) return "⚠ caution";
  return "⚠ spike";
}

function pct(v: number) {
  return `${formatNumber(v * 100, 0)}%`;
}

function round(v: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function sum(values: number[]) {
  return values.reduce((s, v) => s + v, 0);
}
