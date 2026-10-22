import Link from "next/link";
import { cardCls } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { STATUS_LABEL, type Status, type Verdict } from "@/lib/assess";
import { StatChart } from "./charts";
import { NumbersTable } from "./numbers-table";
import { VariantChart } from "./variant-chart";
import type { Block, StatsModel } from "./model";
import { STATUS_COLOR } from "./theme";

const ICON: Record<Status, string> = { good: "✓", watch: "⚠", off: "✕", na: "–" };

/** Status is always icon + label, never colour alone. */
export function Badge({ status, value }: { status: Status; value?: string | null }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: STATUS_COLOR[status], borderColor: `${STATUS_COLOR[status]}66` }}
    >
      <span aria-hidden>{ICON[status]}</span>
      {STATUS_LABEL[status]}
      {value && <span className="text-neutral-300">· {value}</span>}
    </span>
  );
}

function ChartCard({ block }: { block: Block }) {
  const v: Verdict | null = block.verdict;
  return (
    <section id={block.id} className={`${cardCls} scroll-mt-4`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{block.title}</h2>
        {v && <Badge status={v.status} value={v.value} />}
      </div>
      {v && (
        <p className="mb-2 text-xs leading-relaxed text-neutral-200">
          <span className="text-neutral-500">Now: </span>
          {v.message}
        </p>
      )}
      {block.chart && <StatChart {...block.chart} />}
      {block.variants &&
        (block.variants.length > 0 ? (
          <VariantChart variants={block.variants} />
        ) : (
          <p className="py-4 text-center text-xs text-neutral-500">
            No main lift logged yet. Log a main lift to start its trend.
          </p>
        ))}
      {block.table && block.tableOpen && block.table.rows.length === 0 ? (
        <p className="py-3 text-center text-xs text-neutral-500">No records yet: the first session sets the baseline.</p>
      ) : (
        block.table && block.tableOpen && <NumbersTable table={block.table} open />
      )}
      <p className="mt-2 text-xs leading-relaxed text-neutral-400">
        <span className="text-neutral-300">How to read: </span>
        {block.how}
      </p>
      {block.table && !block.tableOpen && <NumbersTable table={block.table} />}
    </section>
  );
}

function HowComputed({ model }: { model: StatsModel }) {
  const { anchors, easyHr, refHr, estimatedShare } = model;
  const restFrom = anchors.restSource === "garmin" ? "Garmin, 30-day median" : "default";
  const maxFrom = {
    garmin: "intervals.icu setting",
    observed: "highest HR seen in a session",
    default: "your reported max",
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
        <span className="text-neutral-300">Missing effort ratings</span>
        {estimatedShare !== null && ` (${formatNumber(estimatedShare * 100, 0)}% of recent load)`}: runs
        use your heart rate (RPE ≈ 15 × %HR-reserve − 6); gym uses your median gym RPE, because
        strength work barely lifts HR; anything else uses 5. Gym workouts logged without the watch count
        with the logger&apos;s duration × your session RPE; linked ones count once, through Garmin. Rate sessions on the{" "}
        <Link href="/" className="text-emerald-400">
          Today
        </Link>{" "}
        feedback card to replace estimates.
      </p>
      <p className="mt-1">
        <span className="text-neutral-300">Verdicts</span> are fixed rules (ACWR bands from Gabbett,
        monotony from Foster, the ~10% ramp heuristic, the 30–35% long-run guideline), identical to
        what the AI coach will read later.
      </p>
    </section>
  );
}

export type StatsGroup = "running" | "body" | "gym";
const BODY_IDS = new Set(["weight", "body-fat", "hrv", "resting-hr", "sleep"]);
const MAIN_CHART: Record<StatsGroup, string> = { running: "volume", body: "hrv", gym: "gym-volume" };

/** Progress tab: one group's PT read, its main chart, the rest folded. */
export function StatsGroupView({ model, group }: { model: StatsModel; group: StatsGroup }) {
  const blocks =
    group === "gym"
      ? (model.gym?.hasData ? model.gym.blocks : [])
      : model.blocks.filter((b) => BODY_IDS.has(b.id) === (group === "body"));
  const ids = new Set(blocks.map((b) => b.id));
  const read = model.coach.filter((i) => ids.has(i.anchor ?? i.id));
  const ok = model.onPoint.filter((o) => ids.has(o.anchor ?? o.id));
  const main = blocks.find((b) => b.id === MAIN_CHART[group]) ?? blocks[0];
  const rest = blocks.filter((b) => b !== main);

  if (group === "gym" && !model.gym?.hasData) {
    return (
      <p className="rounded-2xl bg-neutral-900 p-4 text-sm text-neutral-400">
        No workouts logged yet. Log one in the{" "}
        <Link href="/gym" className="text-emerald-400">
          Gym
        </Link>{" "}
        tab and this fills in: strength per lift, sets per muscle, records.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {(read.length > 0 || ok.length > 0) && (
        <section className="flex flex-col gap-2.5 rounded-2xl bg-neutral-900 p-4">
          <p className="text-[11px] uppercase tracking-wider text-neutral-400">PT&apos;s read</p>
          {read.map((i) => (
            <a key={i.id} href={`#${i.anchor ?? i.id}`} className="block">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{i.title}</span>
                <Badge status={i.verdict.status} value={i.verdict.value} />
              </span>
              <span className="text-xs leading-relaxed text-neutral-400">{i.verdict.message}</span>
            </a>
          ))}
          {ok.map((o) => (
            <a key={o.id} href={`#${o.anchor ?? o.id}`} className="flex items-center justify-between gap-2">
              <span className="text-sm">{o.title}</span>
              <Badge status="good" value={o.value} />
            </a>
          ))}
        </section>
      )}
      {main && <ChartCard block={main} />}
      {rest.length > 0 && (
        <details className="group flex flex-col gap-4">
          <summary className="cursor-pointer rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
            All {group} charts ({rest.length})
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            {rest.map((b) => (
              <ChartCard key={b.id} block={b} />
            ))}
          </div>
        </details>
      )}
      {group !== "gym" && <HowComputed model={model} />}
    </div>
  );
}
