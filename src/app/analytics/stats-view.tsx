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

export function StatsView({ model }: { model: StatsModel }) {
  return (
    <div className="flex flex-col gap-4">
      <CoachRead model={model} />

      <Tiles tiles={model.tiles} />

      {model.blocks.map((b) => (
        <ChartCard key={b.id} block={b} />
      ))}

      {model.gym && (
        <>
          <h2 id="gym" className="mt-4 scroll-mt-4 text-lg font-semibold tracking-tight">
            Gym
          </h2>
          {model.gym.hasData ? (
            <>
              <Tiles tiles={model.gym.tiles} />
              {model.gym.blocks.map((b) => (
                <ChartCard key={b.id} block={b} />
              ))}
            </>
          ) : (
            <p className={`${cardCls} text-sm text-neutral-400`}>
              No workouts logged yet. Log one in the{" "}
              <Link href="/gym" className="text-emerald-400">
                Gym
              </Link>{" "}
              tab and this section fills in: strength per lift, sets per muscle, records.
            </p>
          )}
        </>
      )}

      <HowComputed model={model} />
    </div>
  );
}

function Tiles({ tiles }: { tiles: StatsModel["tiles"] }) {
  return (
    <section className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">{t.label}</p>
          <p className="text-lg font-semibold">{t.value}</p>
          {t.verdict && t.verdict.status !== "na" && (
            <p className="text-[11px]" style={{ color: STATUS_COLOR[t.verdict.status] }}>
              {ICON[t.verdict.status]} {STATUS_LABEL[t.verdict.status]}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

function CoachRead({ model }: { model: StatsModel }) {
  if (model.coach.length === 0 && model.onPoint.length === 0) return null;
  return (
    <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <h2 className="mb-2 text-sm font-semibold text-emerald-300">Coach&apos;s read</h2>
      {model.coach.length === 0 && (
        <p className="mb-2 text-sm text-neutral-200">Nothing to fix right now. Keep doing what you&apos;re doing.</p>
      )}
      <ul className="flex flex-col gap-2.5">
        {model.coach.map((i) => (
          <li key={i.id}>
            <a href={`#${i.anchor ?? i.id}`} className="block">
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-100">{i.title}</span>
                <Badge status={i.verdict.status} value={i.verdict.value} />
              </div>
              <p className="text-xs leading-relaxed text-neutral-300">{i.verdict.message}</p>
            </a>
          </li>
        ))}
      </ul>
      {model.onPoint.length > 0 && (
        <p className="mt-3 border-t border-emerald-500/20 pt-2 text-xs text-neutral-300">
          <span style={{ color: STATUS_COLOR.good }}>✓ On point:</span>{" "}
          {model.onPoint.map((o, i) => (
            <span key={o.id}>
              {i > 0 && " · "}
              <a href={`#${o.anchor ?? o.id}`} className="underline decoration-neutral-600 underline-offset-2">
                {o.title}
              </a>
              {o.value && <span className="text-neutral-500"> {o.value}</span>}
            </span>
          ))}
        </p>
      )}
      <p className="mt-2 text-[11px] text-neutral-500">
        Rule-based, from the charts below. Tap a line to jump to its chart.
      </p>
    </section>
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
          Week
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
