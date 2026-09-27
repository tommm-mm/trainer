import { PageShell } from "@/components/bottom-nav";
import { btnDanger, btnPrimary, cardCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { daysBetween, formatLongDate, todayISO } from "@/lib/dates";
import { formatDuration, formatNumber, formatPace } from "@/lib/format";
import {
  GOAL_TYPE_LABELS,
  isOneOf,
  GOAL_TYPES,
  type BodyCompositionParams,
  type GeneralFitnessParams,
  type RaceParams,
  type StrengthParams,
} from "@/lib/domain";
import { seedPadova, setGoalStatus } from "./actions";
import { ActionButton, NewGoalForm, RaceProgressForm } from "./goal-forms";

export default async function GoalPage() {
  const supabase = await createClient();
  const { data: goals, error } = await supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false });

  const all = goals ?? [];
  const active = all.find((g) => g.status === "active") ?? null;
  const history = all.filter((g) => g.id !== active?.id);
  const today = todayISO();

  return (
    <PageShell active="/goal">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Goal</h1>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load goals: {error.message}
        </p>
      )}

      {active ? (
        <ActiveGoal goal={active} today={today} />
      ) : (
        <div className="flex flex-col gap-4">
          {!error && all.length === 0 && (
            <section className={`${cardCls} border-emerald-500/40`}>
              <p className="text-xs uppercase tracking-wide text-emerald-400">Suggested</p>
              <h2 className="mt-1 text-lg font-semibold">Padova Marathon · sub-3:30</h2>
              <p className="mb-3 text-sm text-neutral-400">
                18 Apr 2027 · base phase · tune-up: Bologna 30km (7 Mar 2027)
              </p>
              <ActionButton action={seedPadova} className={btnPrimary}>
                Start this goal
              </ActionButton>
            </section>
          )}
          <section className={cardCls}>
            <h2 className="mb-3 font-semibold">Start a new goal</h2>
            <NewGoalForm />
          </section>
        </div>
      )}

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-neutral-300">History</h2>
          <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {history.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{g.title}</p>
                  <p className="text-xs text-neutral-500">
                    {typeLabel(g.goal_type)} · {g.status}
                    {g.target_date && ` · ${formatLongDate(g.target_date)}`}
                  </p>
                </div>
                {g.status === "paused" && !active && (
                  <ActionButton action={setGoalStatus.bind(null, g.id, "active")}>
                    Resume
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}

function typeLabel(t: string) {
  return isOneOf(GOAL_TYPES, t) ? GOAL_TYPE_LABELS[t] : t;
}

async function ActiveGoal({ goal, today }: { goal: Tables<"goals">; today: string }) {
  const daysLeft = goal.target_date ? daysBetween(today, goal.target_date) : null;

  return (
    <section className={`${cardCls} flex flex-col gap-4`}>
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-400">
          {typeLabel(goal.goal_type)} · active
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{goal.title}</h2>
        {goal.target_date && (
          <p className="text-sm text-neutral-400">
            {formatLongDate(goal.target_date)}
            {daysLeft !== null &&
              (daysLeft >= 0
                ? ` · ${daysLeft} days (${Math.floor(daysLeft / 7)} wk ${daysLeft % 7} d) to go`
                : ` · ${-daysLeft} days ago`)}
          </p>
        )}
      </div>

      {goal.goal_type === "race" && <RaceDetails goal={goal} today={today} />}
      {goal.goal_type === "strength" && <StrengthDetails goal={goal} />}
      {goal.goal_type === "body_composition" && <BodyCompDetails goal={goal} />}
      {goal.goal_type === "general_fitness" && (
        <p className="text-sm text-neutral-300">
          {(goal.params as GeneralFitnessParams).description ??
            "Consistency, variety and recovery over any single metric."}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-3">
        <ActionButton
          action={setGoalStatus.bind(null, goal.id, "completed")}
          confirmText="Mark this goal as completed?"
        >
          ✓ Completed
        </ActionButton>
        <ActionButton
          action={setGoalStatus.bind(null, goal.id, "paused")}
          confirmText="Pause this goal?"
        >
          Pause
        </ActionButton>
        <ActionButton
          action={setGoalStatus.bind(null, goal.id, "abandoned")}
          confirmText="Abandon this goal? It stays in history."
          className={btnDanger}
        >
          Abandon
        </ActionButton>
      </div>
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-neutral-950/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

function RaceDetails({ goal, today }: { goal: Tables<"goals">; today: string }) {
  const p = goal.params as RaceParams;
  const pace =
    p.target_time_seconds && p.distance_km
      ? formatPace(p.target_time_seconds / p.distance_km)
      : null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Metric
          label="Target"
          value={p.target_time_seconds ? formatDuration(p.target_time_seconds) : "–"}
        />
        <Metric label="Pace" value={pace ?? "–"} sub={pace ? "/km" : undefined} />
        <Metric label="Distance" value={formatNumber(p.distance_km)} sub="km" />
      </div>

      {p.tune_up_races && p.tune_up_races.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Tune-up races</p>
          <ul className="text-sm">
            {p.tune_up_races.map((r) => {
              const d = daysBetween(today, r.date);
              return (
                <li key={r.name + r.date} className="flex justify-between">
                  <span>{r.name}</span>
                  <span className="text-neutral-400">
                    {formatLongDate(r.date)} · {d >= 0 ? `in ${d} d` : "done"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
          Periodization
          <span className="ml-1 normal-case tracking-normal text-neutral-600">
            (manual until the AI coach manages it)
          </span>
        </p>
        <RaceProgressForm
          id={goal.id}
          phase={goal.phase}
          buildWeek={goal.build_week_number}
          deload={goal.deload_week}
        />
      </div>
    </>
  );
}

async function StrengthDetails({ goal }: { goal: Tables<"goals"> }) {
  const p = goal.params as StrengthParams;
  const lifts = p.focus_lifts ?? [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("gym_sessions")
    .select("exercise, weight_kg, reps, date")
    .gte("date", goal.created_at.slice(0, 10))
    .not("weight_kg", "is", null);

  const best = (lift: string) =>
    (data ?? [])
      .filter((g) => g.exercise.toLowerCase().includes(lift.toLowerCase()))
      .reduce<number | null>((m, g) => Math.max(m ?? 0, g.weight_kg ?? 0), null);

  return (
    <div className="flex flex-col gap-2">
      {p.description && <p className="text-sm text-neutral-300">{p.description}</p>}
      {lifts.length === 0 && !p.description && (
        <p className="text-sm text-neutral-500">No focus lifts set.</p>
      )}
      {lifts.map((lift) => {
        const b = best(lift);
        const pct = b && p.target_weight_kg ? Math.min(100, (b / p.target_weight_kg) * 100) : 0;
        return (
          <div key={lift}>
            <div className="flex justify-between text-sm">
              <span>{lift}</span>
              <span className="tabular-nums text-neutral-400">
                {b ? `${formatNumber(b)} kg` : "no data"}
                {p.target_weight_kg && ` / ${formatNumber(p.target_weight_kg)} kg`}
                {p.target_reps && ` × ${p.target_reps}`}
              </span>
            </div>
            {p.target_weight_kg && (
              <div className="mt-1 h-1.5 rounded-full bg-neutral-800">
                <div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

async function BodyCompDetails({ goal }: { goal: Tables<"goals"> }) {
  const p = goal.params as BodyCompositionParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("body_metrics")
    .select("*")
    .order("date", { ascending: false })
    .limit(1);
  const latest = data?.[0];

  return (
    <div className="grid grid-cols-2 gap-2">
      <Metric
        label="Weight"
        value={latest?.weight_kg ? `${formatNumber(latest.weight_kg)} kg` : "–"}
        sub={p.target_weight_kg ? `target ${formatNumber(p.target_weight_kg)} kg` : undefined}
      />
      <Metric
        label="Body fat"
        value={latest?.body_fat_pct ? `${formatNumber(latest.body_fat_pct)}%` : "–"}
        sub={p.target_body_fat_pct ? `target ${formatNumber(p.target_body_fat_pct)}%` : undefined}
      />
      <p className="col-span-2 text-xs text-neutral-500">
        Direction: {p.direction ?? "–"}
        {latest ? ` · last entry ${formatLongDate(latest.date)}` : " · log weight from Check-in (Phase 3)"}
      </p>
    </div>
  );
}

