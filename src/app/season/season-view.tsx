import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { StatusChip } from "@/components/status-chip";
import { TargetMeters } from "@/components/season-targets";
import { btnDanger, btnPrimary, btnSmall, cardCls } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import { addDays, daysBetween, formatDay, formatLongDate, formatShortDate, mondayOf } from "@/lib/dates";
import { formatDuration, formatNumber, formatPace } from "@/lib/format";
import { resolveHrAnchors, type HrAnchors } from "@/lib/metrics";
import type { RaceParams } from "@/lib/domain";
import {
  FOCUS_COLORS,
  FOCUS_LABELS,
  SOURCE_LABELS,
  diffWeeks,
  flattenWeeks,
  guardrails,
  summarize,
  type Guardrail,
  type SeasonDraft,
  type SeasonSource,
  type SeasonSummary,
} from "@/lib/season/model";
import { currentPosition, type WeekActual } from "@/lib/season/progress";
import { effortTable } from "@/lib/season/efforts";
import { goalRaces, type LoadedSeason, type RaceItem } from "@/lib/season/queries";
import { starterDraftFor } from "@/lib/season/drafts";
import { ActionButton } from "@/app/goal/goal-forms";
import { approveSeason, proposeStarterSeason, rejectSeason, removeRace } from "./actions";
import { SeasonChart } from "./season-chart";
import { AddRaceForm, WeekEditForm } from "./forms";

export function SeasonView({
  today,
  goal,
  approved,
  proposed,
  view,
  actuals = new Map(),
  anchors = resolveHrAnchors({ activities: [] }),
  history = [],
}: {
  today: string;
  goal: Tables<"goals"> | null;
  approved: LoadedSeason | null;
  proposed: LoadedSeason | null;
  view?: "proposed";
  actuals?: Map<string, WeekActual>;
  anchors?: HrAnchors;
  history?: { week_start: string; run_km: number }[];
}) {
  const thisMonday = mondayOf(today);

  if (!goal) {
    return (
      <Shell>
        <section className={cardCls}>
          <p className="text-sm text-neutral-300">No active goal. A season is built backwards from one.</p>
          <Link href="/goal" className={`${btnPrimary} mt-3 inline-block`}>
            Set a goal
          </Link>
        </section>
      </Shell>
    );
  }

  const shown = view === "proposed" && proposed ? proposed : (approved ?? proposed);
  const races = goalRaces(goal);
  const raceDates = races.map((r) => r.date);
  const goalMonday = goal.target_date ? mondayOf(goal.target_date) : null;

  if (!shown) {
    return (
      <Shell>
        <GoalHeader goal={goal} today={today} />
        <StarterCard draft={starterDraftFor(goal)} goalDate={goal.target_date} />
      </Shell>
    );
  }

  const weeks = flattenWeeks(shown.blocks);
  const start = weeks[0].week_start;
  const doneKm = new Map([...actuals].map(([k, v]) => [k, v.run_km]));
  const position = currentPosition(shown.blocks, today);
  const p = (goal.params ?? {}) as RaceParams;
  const mp = p.target_time_seconds && p.distance_km ? Math.round(p.target_time_seconds / p.distance_km) : null;

  return (
    <Shell>
      <GoalHeader goal={goal} today={today} />

      {proposed && (
        <ProposalCard
          proposed={proposed}
          approved={approved}
          warnings={guardrails(flattenWeeks(proposed.blocks), {
            limits: proposed.limits,
            history,
            raceDates,
            goalDate: goal.target_date,
          })}
          goalDate={goal.target_date}
        />
      )}

      {approved && proposed && (
        <nav className="flex gap-2 text-xs">
          <Link href="/season" className={`${btnSmall} ${shown === approved ? "border-emerald-500 text-emerald-300" : ""}`}>
            Current v{approved.version}
          </Link>
          <Link href="/season?view=proposed" className={`${btnSmall} ${shown === proposed ? "border-amber-500 text-amber-300" : ""}`}>
            Proposed v{proposed.version}
          </Link>
        </nav>
      )}

      {position && shown.status === "approved" && (
        <NowCard season={shown} position={position} actual={actuals.get(thisMonday)} />
      )}

      <section className={cardCls}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {weeks.length} weeks · {formatShortDate(start)} → {formatShortDate(addDays(weeks.at(-1)!.week_start, 6))}
          </p>
          <StatusChip status={shown.status} />
        </div>
        <SeasonChart weeks={weeks} done={doneKm} thisMonday={thisMonday} goalMonday={goalMonday} />
      </section>

      <RacesCard races={races} season={shown} today={today} />

      <EffortsCard
        rows={effortTable(anchors, mp)}
        anchors={anchors}
        mp={mp}
      />

      <section id="blocks" className="flex scroll-mt-4 flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-300">Blocks</h2>
        {shown.blocks.map((b, i) => (
          <BlockCard
            key={b.id}
            block={b}
            current={position?.blockIndex === i}
            actuals={actuals}
            thisMonday={thisMonday}
            editable={shown.status === "approved" || shown.status === "proposed"}
          />
        ))}
      </section>

      <p className="text-xs text-neutral-500">
        Written by {SOURCE_LABELS[shown.source as SeasonSource] ?? shown.source} · v{shown.version}
        {shown.decided_at && ` · ${shown.status} ${formatLongDate(shown.decided_at.slice(0, 10))}`}.{" "}
        <Link href="/goal" className="underline">
          Goal settings
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell active="/season">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Season</h1>
      <div className="flex flex-col gap-4">{children}</div>
    </PageShell>
  );
}

function GoalHeader({ goal, today }: { goal: Tables<"goals">; today: string }) {
  const p = (goal.params ?? {}) as RaceParams;
  const days = goal.target_date ? daysBetween(today, goal.target_date) : null;
  const pace = p.target_time_seconds && p.distance_km ? formatPace(p.target_time_seconds / p.distance_km) : null;
  return (
    <section className={cardCls}>
      <p className="text-xs uppercase tracking-wide text-emerald-400">
        {goal.goal_type === "race" ? "A race" : "Goal"} · {goal.title}
      </p>
      {days !== null && (
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
          {days >= 0 ? `${days} days` : "Done"}
        </p>
      )}
      <p className="text-sm text-neutral-400">
        {[
          goal.target_date && formatDay(goal.target_date) + " " + goal.target_date.slice(0, 4),
          p.target_time_seconds && `target ${formatDuration(p.target_time_seconds)}`,
          pace && `${pace}/km`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </section>
  );
}

function SummaryGrid({ s }: { s: SeasonSummary }) {
  const items: [string, string, string?][] = [
    ["Weeks", String(s.weeks), `${s.blocks} blocks`],
    ["Peak", `${formatNumber(s.peakKm)} km`, s.peakWeek ? `wk of ${formatShortDate(s.peakWeek)}` : undefined],
    ["Longest", `${formatNumber(s.longestRun)} km`, "run"],
    ["Lighter", String(s.deloads), "weeks"],
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(([label, value, sub]) => (
        <div key={label} className="rounded-lg bg-neutral-950/60 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
          <p className="text-sm font-semibold tabular-nums">{value}</p>
          {sub && <p className="text-[10px] text-neutral-500">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

function StarterCard({ draft, goalDate }: { draft: SeasonDraft | null; goalDate: string | null }) {
  if (!draft) {
    return (
      <section className={cardCls}>
        <p className="font-medium">No season yet</p>
        <p className="mt-1 text-sm text-neutral-400">
          Your coach (Cowork, or the AI coach from Phase D) will propose one here. Nothing applies until you approve it.
        </p>
      </section>
    );
  }
  const s = summarize(draft.blocks, goalDate);
  return (
    <section className={`${cardCls} flex flex-col gap-3 border-emerald-500/40`}>
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-400">Ready to review</p>
        <p className="mt-1 font-semibold">{draft.title}</p>
        <p className="text-sm text-neutral-400">
          Written by {SOURCE_LABELS[draft.source]}. It loads as a proposal: you see every week, the checks and the
          rationale before approving.
        </p>
      </div>
      {s && <SummaryGrid s={s} />}
      <ActionButton action={proposeStarterSeason} className={btnPrimary}>
        Load proposal
      </ActionButton>
    </section>
  );
}

function ProposalCard({
  proposed,
  approved,
  warnings,
  goalDate,
}: {
  proposed: LoadedSeason;
  approved: LoadedSeason | null;
  warnings: Guardrail[];
  goalDate: string | null;
}) {
  const s = summarize(proposed.blocks, goalDate);
  const diff = approved ? diffWeeks(flattenWeeks(approved.blocks), flattenWeeks(proposed.blocks)) : [];
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-300">
            {approved ? "Change proposed" : "New season proposed"} · v{proposed.version} · by{" "}
            {SOURCE_LABELS[proposed.source as SeasonSource] ?? proposed.source}
          </p>
          <p className="mt-1 font-semibold">{proposed.title}</p>
        </div>
        <StatusChip status="proposed" />
      </div>

      {s && <SummaryGrid s={s} />}

      {approved && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
            What changes vs v{approved.version} ({diff.length} week{diff.length === 1 ? "" : "s"})
          </p>
          {diff.length === 0 ? (
            <p className="text-sm text-neutral-400">No week targets change.</p>
          ) : (
            <ul className="divide-y divide-neutral-800 text-sm">
              {diff.slice(0, 10).map((d) => (
                <li key={d.week_start} className="flex justify-between gap-2 py-1">
                  <span className="text-neutral-400">{formatShortDate(d.week_start)}</span>
                  <span className="tabular-nums">
                    {d.kind === "added"
                      ? `+ ${formatNumber(d.after?.run_km ?? null)} km`
                      : d.kind === "removed"
                        ? "removed"
                        : `${formatNumber(d.before?.run_km ?? null)} → ${formatNumber(d.after?.run_km ?? null)} km`}
                    {d.fields.some((f) => f !== "run_km") && (
                      <span className="ml-1 text-xs text-neutral-500">
                        ({d.fields.filter((f) => f !== "run_km").map((f) => f.replace(/_/g, " ")).join(", ")})
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {diff.length > 10 && <li className="py-1 text-xs text-neutral-500">…and {diff.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Automatic checks</p>
        {warnings.length === 0 ? (
          <p className="text-sm text-emerald-300">
            ✓ All pass: ramp ≤ 10%, a lighter week at least every 4, projected ACWR ≤ 1.3, long run ≤ 50% of the week,
            your caps.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {warnings.map((w, i) => (
              <li key={i} className="text-amber-200">
                ! {w.week_start && <span className="text-neutral-400">{formatShortDate(w.week_start)} · </span>}
                {w.message}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-neutral-500">Checks warn, they don&apos;t decide. That stays with you.</p>
      </div>

      {proposed.rationale && (
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-300">Why this plan</summary>
          <p className="mt-2 text-neutral-400">{proposed.rationale}</p>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <ActionButton action={approveSeason.bind(null, proposed.id)} className={btnPrimary}>
          Approve v{proposed.version}
        </ActionButton>
        {!approved && (
          <Link href="#blocks" className={btnSmall}>
            Review weeks
          </Link>
        )}
        <ActionButton
          action={rejectSeason.bind(null, proposed.id)}
          confirmText="Reject this proposal? It stays in the history."
          className={btnDanger}
        >
          {approved ? `Keep v${approved.version}` : "Reject"}
        </ActionButton>
      </div>
    </section>
  );
}

function NowCard({
  season,
  position,
  actual,
}: {
  season: LoadedSeason;
  position: NonNullable<ReturnType<typeof currentPosition>>;
  actual: WeekActual | undefined;
}) {
  const block = season.blocks[position.blockIndex];
  const w = position.week;
  return (
    <section className={`${cardCls} flex flex-col gap-3`}>
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-400">
          {block.name} · week {position.weekInBlock} of {position.blockWeeks}
          {w.is_deload && " · lighter week"}
        </p>
        {block.purpose && <p className="mt-1 text-sm text-neutral-300">{block.purpose}</p>}
      </div>
      <TargetMeters targets={w} actual={actual} finished={false} />
      {w.key_session && <p className="text-sm">Key: {w.key_session}</p>}
      {w.milestone && <p className="text-sm text-amber-300">⚑ {w.milestone}</p>}
      <p className="text-xs text-neutral-500">
        Season week {position.seasonWeek} of {position.seasonWeeks} · within ±6% of the km target counts as on target.
      </p>
    </section>
  );
}

function RacesCard({
  races,
  season,
  today,
}: {
  races: RaceItem[];
  season: LoadedSeason;
  today: string;
}) {
  const raceWeeks = new Set(races.map((r) => mondayOf(r.date)));
  const milestones = flattenWeeks(season.blocks)
    .filter((w) => w.milestone && !raceWeeks.has(w.week_start))
    .map((w) => ({ date: w.week_start, name: w.milestone!, kind: "milestone" as const }));
  const rows = [
    ...races,
    ...milestones.map((m) => ({ ...m, priority: null, distance_km: null })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className={cardCls}>
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Races & tests</p>
      <ul className="divide-y divide-neutral-800">
        {rows.map((r) => {
          const d = daysBetween(today, r.date);
          const past = r.kind === "milestone" ? addDays(r.date, 6) < today : d < 0;
          return (
            <li key={r.kind + r.date + r.name} className={`flex items-center gap-3 py-2 ${past ? "opacity-50" : ""}`}>
              <div className="w-11 shrink-0 text-center leading-tight">
                <p className="text-[10px] uppercase text-neutral-500">{r.kind === "milestone" ? "wk of" : formatDay(r.date).slice(0, 3)}</p>
                <p className="text-sm font-semibold tabular-nums">{formatShortDate(r.date)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{r.name}</p>
                <p className="text-xs text-neutral-500">
                  {r.kind === "milestone" ? "test inside the plan" : d >= 0 ? `in ${d} days` : "done"}
                  {r.distance_km ? ` · ${formatNumber(r.distance_km)} km` : ""}
                </p>
              </div>
              {r.priority && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                    r.priority === "A"
                      ? "bg-emerald-500 text-neutral-950 ring-emerald-500"
                      : r.priority === "B"
                        ? "text-emerald-300 ring-emerald-500/50"
                        : "text-neutral-400 ring-neutral-700"
                  }`}
                >
                  {r.priority}
                </span>
              )}
              {r.kind === "race" && (
                <ActionButton action={removeRace.bind(null, r.name, r.date)} confirmText={`Remove ${r.name}?`} className={btnDanger}>
                  ✕
                </ActionButton>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-neutral-500">
        A: full taper. B: 3–4 easy days before, about a week easy after. C: no taper, run by feel. At most one hard race
        every 4–6 weeks.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-neutral-300">+ Add a race</summary>
        <AddRaceForm />
      </details>
    </section>
  );
}

function EffortsCard({
  rows,
  anchors,
  mp,
}: {
  rows: ReturnType<typeof effortTable>;
  anchors: ReturnType<typeof resolveHrAnchors>;
  mp: number | null;
}) {
  return (
    <details className={cardCls}>
      <summary className="cursor-pointer">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Efforts</span>
        <span className="ml-2 text-xs text-neutral-500">heart rate now, pace at goal fitness</span>
      </summary>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-neutral-500">
            <th className="pb-1 font-medium">Effort</th>
            <th className="pb-1 font-medium">HR</th>
            {mp && <th className="pb-1 font-medium">Pace</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-neutral-800 align-top">
              <td className="py-1.5 pr-2">
                <p>{r.label}</p>
                <p className="text-xs text-neutral-500">{r.feel}. {r.use}.</p>
              </td>
              <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap">
                {r.hrLow ? `${r.hrLow}–${r.hrHigh}` : `< ${r.hrHigh + 1}`}
              </td>
              {mp && (
                <td className="py-1.5 tabular-nums whitespace-nowrap">
                  {r.pace ? `${formatPace(r.pace[0])}–${formatPace(r.pace[1])}` : "–"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">
        HR bands are % of heart-rate reserve on rest {anchors.rest} ({anchors.restSource}) and max {anchors.max} (
        {anchors.maxSource}). Paces are the targets at goal fitness: until the tests reset them, run easy days by HR,
        not pace. Intervals: run by effort, HR lags on short repeats. Bike / swim: easy only (RPE 3–4 of 10); on the
        bike HR sits about 5–10 bpm lower than running at the same effort.
      </p>
    </details>
  );
}

function BlockCard({
  block,
  current,
  actuals,
  thisMonday,
  editable,
}: {
  block: LoadedSeason["blocks"][number];
  current: boolean;
  actuals: Map<string, WeekActual>;
  thisMonday: string;
  editable: boolean;
}) {
  const first = block.weeks[0].week_start;
  const last = addDays(block.weeks.at(-1)!.week_start, 6);
  const kms = block.weeks.map((w) => w.run_km ?? 0).filter(Boolean);
  return (
    <details open={current}className={`${cardCls} ${current ? "border-emerald-500/40" : ""}`}>
      <summary className="flex cursor-pointer items-center gap-3">
        <i className="h-8 w-1 shrink-0 rounded-sm" style={{ background: FOCUS_COLORS[block.focus] }} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {block.name}
            {current && <span className="ml-2 text-xs text-emerald-400">now</span>}
          </p>
          <p className="text-xs text-neutral-500">
            {formatShortDate(first)} – {formatShortDate(last)} · {block.weeks.length} wk · {FOCUS_LABELS[block.focus]}
            {block.gym_focus && ` · gym ${block.gym_focus}`}
          </p>
        </div>
        {kms.length > 0 && (
          <span className="text-xs tabular-nums text-neutral-400">
            {Math.min(...kms)}–{Math.max(...kms)} km
          </span>
        )}
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {block.purpose && <p className="text-sm text-neutral-300">{block.purpose}</p>}
        {block.key_sessions && <p className="text-xs text-neutral-500">{block.key_sessions}</p>}
        <ul className="divide-y divide-neutral-800">
          {block.weeks.map((w) => {
            const a = actuals.get(w.week_start);
            const past = w.week_start < thisMonday;
            const now = w.week_start === thisMonday;
            return (
              <li key={w.id} className={`py-2 ${now ? "-mx-4 bg-emerald-500/5 px-4" : ""}`}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="w-14 shrink-0 text-neutral-400">{formatShortDate(w.week_start)}</span>
                  <span className="flex-1 tabular-nums">
                    <b className="font-semibold">{formatNumber(w.run_km ?? null)}</b> km
                    {(past || now) && a && <span className="text-emerald-400"> · {formatNumber(a.run_km)} done</span>}
                    {w.is_deload && <span className="ml-1 text-xs text-neutral-500">lighter</span>}
                  </span>
                  <span className="text-xs tabular-nums text-neutral-500">
                    L {formatNumber(w.long_run_km ?? null)} · {w.runs ?? "–"} runs · {w.gym_sessions ?? "–"} gym
                    {w.cross_sessions ? ` · ${w.cross_sessions} bike` : ""}
                  </span>
                </div>
                {w.key_session && <p className="ml-16 text-xs text-neutral-400">{w.key_session}</p>}
                {w.milestone && <p className="ml-16 text-xs text-amber-300">⚑ {w.milestone}</p>}
                {w.notes && <p className="ml-16 text-xs text-neutral-500">{w.notes}</p>}
                {editable && !past && (
                  <details className="ml-16">
                    <summary className="cursor-pointer text-xs text-neutral-500">Edit</summary>
                    <WeekEditForm id={w.id} week={w} />
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
