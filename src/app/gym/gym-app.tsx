"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { btnSecondary, cardCls } from "@/components/ui";
import { formatDay, todayISO } from "@/lib/dates";
import { MuscleMeters } from "@/components/muscle-meters";
import { nextTemplate } from "@/lib/gym/today";
import { muscleSets, type ExerciseIndex, type StrengthSession } from "@/lib/strength";
import {
  addExercise,
  currentExerciseIndex,
  discardWorkout,
  finishWorkout,
  lastTimeByExercise,
  startWorkout,
  swapExercise,
  toStrengthSession,
  type ExerciseInfo,
  type HistoryRow,
  type Store,
  type TemplateInput,
  acceptAllAdvice,
} from "@/lib/gym/workout";
import { pendingAdvice } from "@/lib/gym/progression";
import { ExerciseCard } from "./exercise-card";
import { ExercisePicker } from "./exercise-picker";
import { FinishSheet } from "./finish-sheet";
import { RestBar, useRestTimer } from "./rest-timer";
import { useWakeLock } from "./use-wake-lock";
import { useWorkout, type SyncState } from "./use-workout";

export type RecentWorkout = {
  id: string;
  date: string;
  templateId: string | null;
  name: string;
  sets: number;
  minutes: number | null;
  sessionRpe: number | null;
  garmin: boolean;
};

type Props = {
  today: string;
  templates: TemplateInput[];
  exercises: ExerciseInfo[];
  history: HistoryRow[];
  recent: RecentWorkout[];
  serverActive: Store | null;
  /** Completed workouts this week + exercise index: the live muscle meters. */
  weekSessions: StrengthSession[];
  index: ExerciseIndex;
  /** Opened from a planned session on the Week View. */
  planned: { planId: string | null; templateId: string | null } | null;
};

const uuid = () => crypto.randomUUID();

export function GymApp({
  templates,
  exercises,
  history,
  recent,
  serverActive,
  weekSessions,
  index,
  planned,
}: Props) {
  const router = useRouter();
  const onDone = useCallback(() => router.refresh(), [router]);
  const { store, setStore, loaded, sync, lastError, finished, setFinished, pushNow } = useWorkout(
    serverActive,
    onDone,
  );
  const rest = useRestTimer();

  // Library + anything created during this workout.
  const byId = useMemo(() => {
    const m = new Map(exercises.map((e) => [e.id, e]));
    for (const e of store?.doc.newExercises ?? []) m.set(e.id, e);
    return m;
  }, [exercises, store?.doc.newExercises]);
  const lastTime = useMemo(() => lastTimeByExercise(history), [history]);
  // Exercises created mid-workout aren't in the server index yet.
  const fullIndex = useMemo(() => {
    const out: ExerciseIndex = { ...index };
    for (const e of store?.doc.newExercises ?? []) out[e.id] = e;
    return out;
  }, [index, store?.doc.newExercises]);
  // This week's hard sets, including the workout in progress: fills up as you log.
  const liveMuscles = useMemo(() => {
    const done = weekSessions.filter((w) => w.id !== store?.doc.id);
    const current = store && store.doc.status === "in_progress" ? [toStrengthSession(store.doc)] : [];
    return muscleSets([...done, ...current], fullIndex);
  }, [weekSessions, store, fullIndex]);

  if (!loaded) return <p className="py-10 text-center text-sm text-neutral-500">Loading…</p>;

  if (!store) {
    return (
      <Home
        templates={templates}
        byId={byId}
        recent={recent}
        finished={finished}
        planned={planned}
        muscles={liveMuscles}
        onDismiss={() => setFinished(null)}
        onStart={(template, planId) => {
          setFinished(null);
          rest.clear();
          setStore(
            startWorkout({
              id: uuid(),
              date: todayISO(),
              now: new Date().toISOString(),
              template,
              planId,
              newId: uuid,
            }),
          );
        }}
      />
    );
  }

  return (
    <ActiveWorkout
      store={store}
      setStore={setStore}
      byId={byId}
      library={exercises}
      lastTime={lastTime}
      sync={sync}
      lastError={lastError}
      onRetry={() => void pushNow()}
      rest={rest}
      muscles={liveMuscles}
    />
  );
}

// ---------------------------------------------------------------- home

function Home({
  templates,
  byId,
  recent,
  finished,
  planned,
  muscles,
  onStart,
  onDismiss,
}: {
  templates: TemplateInput[];
  byId: Map<string, ExerciseInfo>;
  recent: RecentWorkout[];
  finished: { linked: boolean } | null;
  planned: Props["planned"];
  muscles: ReturnType<typeof muscleSets>;
  onStart: (t: TemplateInput | null, planId: string | null) => void;
  onDismiss: () => void;
}) {
  // A planned session picks the template; otherwise rotate after the last one done.
  const rotation = nextTemplate(templates, recent.find((r) => r.templateId)?.templateId ?? null);
  const nextId = planned?.templateId ?? rotation?.id ?? null;
  const planId = planned?.planId ?? null;
  // The suggested workout goes first.
  const ordered = [...templates].sort((a, b) => Number(b.id === nextId) - Number(a.id === nextId));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Gym</h1>
          <p className="text-sm text-neutral-400">Pick a workout and log sets as you go.</p>
        </div>
        <Link href="/gym/templates" className="shrink-0 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300">
          Edit workouts
        </Link>
      </header>

      {finished && (
        <button
          onClick={onDismiss}
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-left"
        >
          <p className="font-medium text-emerald-300">✓ Workout saved</p>
          <p className="text-xs text-neutral-300">
            {finished.linked
              ? "Linked to today's Garmin session: its duration and HR now carry your session RPE."
              : "It will link to the Garmin session automatically once your watch syncs."}
          </p>
        </button>
      )}

      <ul className="flex flex-col gap-3">
        {ordered.map((t) => {
          const last = recent.find((r) => r.templateId === t.id);
          const main = t.items.filter((i) => i.block === "main");
          const fin = t.items.filter((i) => i.block === "finisher");
          return (
            <li key={t.id} className={`${cardCls} ${t.id === nextId ? "border-emerald-500/50" : ""}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="font-semibold">{t.name}</h2>
                {t.id === nextId && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                    {planned?.planId && planned.templateId === t.id ? "Planned today" : "Next up"}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-neutral-400">
                {main.map((i) => byId.get(i.exercise_id)?.name ?? "?").join(" · ")}
              </p>
              {fin.length > 0 && (
                <p className="mt-1 text-xs text-neutral-500">
                  Finisher: {fin.map((i) => byId.get(i.exercise_id)?.name ?? "?").join(" · ")}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-neutral-500">
                  {last ? `Last: ${formatDay(last.date)}` : "Not done yet"}
                </span>
                <button
                  onClick={() => onStart(t, t.id === nextId ? planId : null)}
                  className="h-12 rounded-xl bg-emerald-500 px-6 text-base font-semibold text-neutral-950 active:bg-emerald-400"
                >
                  Start
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button onClick={() => onStart(null, planned?.templateId ? null : planId)} className={`${btnSecondary} h-12`}>
        Start an empty workout
      </button>

      <section className={cardCls}>
        <MuscleMeters sets={muscles} />
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Recent</h2>
          <ul className="flex flex-col divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {recent.slice(0, 8).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {formatDay(r.date)} · {r.name}
                </span>
                <span className="text-xs text-neutral-400">
                  {r.sets} sets
                  {r.minutes !== null && ` · ${r.minutes} min`}
                  {r.sessionRpe !== null && ` · RPE ${r.sessionRpe}`}
                  {r.garmin && <span className="text-emerald-400"> · ✓</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/log" className="text-center text-xs text-neutral-500 underline underline-offset-2">
        Log a run manually
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------- active workout

type Rest = ReturnType<typeof useRestTimer>;

function ActiveWorkout({
  store,
  setStore,
  byId,
  library,
  lastTime,
  sync,
  lastError,
  onRetry,
  rest,
  muscles,
}: {
  muscles: ReturnType<typeof muscleSets>;
  store: Store;
  setStore: (next: Store | ((cur: Store | null) => Store | null)) => void;
  byId: Map<string, ExerciseInfo>;
  library: ExerciseInfo[];
  lastTime: ReturnType<typeof lastTimeByExercise>;
  sync: SyncState;
  lastError: string | null;
  onRetry: () => void;
  rest: Rest;
}) {
  const doc = store.doc;
  const current = currentExerciseIndex(doc);
  const [openId, setOpenId] = useState<string | null>(doc.exercises[Math.max(0, current)]?.id ?? null);
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "swap"; weId: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const active = doc.status === "in_progress";
  useWakeLock(active);

  const update = (f: (s: Store) => Store) => setStore((cur) => (cur ? f(cur) : cur));

  if (!active) {
    // Finished or discarded, waiting for the last push.
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold">
          {doc.status === "completed" ? "Saving your workout…" : "Discarding…"}
        </p>
        <SyncChip sync={sync} dirty={store.rev > store.syncedRev} />
        <p className="max-w-xs text-xs text-neutral-400">
          Everything is stored on this phone. It will upload by itself as soon as there&apos;s signal. You
          can close the app.
        </p>
        {lastError && <p className="max-w-xs text-[11px] text-red-300">{lastError}</p>}
        <button onClick={onRetry} className={btnSecondary}>
          Retry now
        </button>
      </div>
    );
  }

  const totalSets = doc.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.isWarmup).length, 0);
  const pending = Object.fromEntries(
    doc.exercises.flatMap((e) => {
      const a = pendingAdvice(e, lastTime[e.exerciseId], byId.get(e.exerciseId)?.measure ?? "reps");
      return a ? [[e.id, a] as const] : [];
    }),
  );
  const pendingCount = Object.keys(pending).length;

  return (
    <div className="flex flex-col gap-3 pb-24">
      <header className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-950/95 px-4 py-2 backdrop-blur">
        <div className="min-w-0">
          <h1 className="truncate font-semibold">{doc.templateName ?? "Workout"}</h1>
          <p className="flex items-center gap-2 text-xs text-neutral-400">
            <Elapsed since={doc.startedAt} /> · {totalSets} sets
            <SyncChip sync={sync} dirty={store.rev > store.syncedRev} onRetry={onRetry} />
          </p>
        </div>
        <button
          onClick={() => setFinishing(true)}
          className="h-11 shrink-0 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-neutral-950"
        >
          Finish
        </button>
      </header>

      {doc.exercises.length === 0 && (
        <p className="py-6 text-center text-sm text-neutral-500">No exercises yet. Add one below.</p>
      )}

      {pendingCount > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-2 text-sm">
          <span className="text-neutral-300">
            {pendingCount} suggestions from last time · you choose the weights
          </span>
          <button
            onClick={() => update((s) => acceptAllAdvice(s, pending))}
            className="h-9 shrink-0 rounded-lg border border-sky-500/50 px-3 text-xs font-semibold text-sky-200"
          >
            Accept all
          </button>
        </div>
      )}

      {doc.exercises.map((ex, i) => (
        <div key={ex.id}>
          {ex.block === "finisher" && (i === 0 || doc.exercises[i - 1].block !== "finisher") && (
            <p className="mb-2 mt-2 text-[11px] uppercase tracking-wide text-amber-300/80">
              Finisher · circuit
            </p>
          )}
          <ExerciseCard
            ex={ex}
            info={byId.get(ex.exerciseId)}
            last={lastTime[ex.exerciseId]}
            open={openId === ex.id}
            isCurrent={i === current}
            isFirst={i === 0}
            isLast={i === doc.exercises.length - 1}
            onToggle={() => setOpenId(openId === ex.id ? null : ex.id)}
            update={update}
            onLogged={(restSeconds, reachedTarget) => {
              if (restSeconds > 0) rest.start(restSeconds);
              if (reachedTarget) {
                const next = doc.exercises.find(
                  (e, j) => j > i && e.sets.filter((s) => !s.isWarmup).length < (e.target?.sets ?? 1),
                );
                if (next) setOpenId(next.id);
              }
            }}
            onSwap={() => setPicker({ mode: "swap", weId: ex.id })}
          />
        </div>
      ))}

      <button onClick={() => setPicker({ mode: "add" })} className={`${btnSecondary} h-12`}>
        + Add exercise
      </button>

      <details className={`${cardCls} mt-2`}>
        <summary className="cursor-pointer text-sm font-medium">
          This week&apos;s muscle volume <span className="text-xs font-normal text-emerald-400">live</span>
        </summary>
        <div className="mt-3">
          <MuscleMeters sets={muscles} title="Hard sets this week, incl. today" />
        </div>
      </details>

      <RestBar rest={rest} />

      {picker && (
        <ExercisePicker
          library={[...library, ...doc.newExercises]}
          title={picker.mode === "add" ? "Add exercise" : "Swap exercise"}
          allowBlock={picker.mode === "add"}
          onClose={() => setPicker(null)}
          onPick={(exercise, opts) => {
            if (picker.mode === "add") {
              const id = uuid();
              update((s) => addExercise(s, { id, exercise, block: opts.block, isNew: opts.isNew }));
              setOpenId(id);
            } else {
              const weId = picker.weId;
              update((s) => {
                const withNew = opts.isNew
                  ? { ...s, doc: { ...s.doc, newExercises: [...s.doc.newExercises, exercise] } }
                  : s;
                return swapExercise(withNew, weId, exercise.id);
              });
            }
            setPicker(null);
          }}
        />
      )}

      {finishing && (
        <FinishSheet
          totalSets={totalSets}
          startedAt={doc.startedAt}
          onCancel={() => setFinishing(false)}
          onFinish={(sessionRpe, notes) => {
            rest.clear();
            update((s) => finishWorkout(s, { now: new Date().toISOString(), sessionRpe, notes }));
            setFinishing(false);
          }}
          onDiscard={() => {
            rest.clear();
            update((s) => discardWorkout(s, new Date().toISOString()));
            setFinishing(false);
          }}
        />
      )}
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const min = Math.max(0, Math.round((now - Date.parse(since)) / 60000));
  return <span className="tabular-nums">{min} min</span>;
}

function SyncChip({ sync, dirty, onRetry }: { sync: SyncState; dirty: boolean; onRetry?: () => void }) {
  const [label, cls] =
    !dirty && sync !== "error"
      ? ["✓ Saved", "text-emerald-400"]
      : sync === "saving"
        ? ["Saving…", "text-neutral-400"]
        : sync === "offline"
          ? ["● Offline · on phone", "text-amber-300"]
          : sync === "error"
            ? ["● Not saved · tap", "text-red-300"]
            : ["● On phone", "text-amber-300"];
  return (
    <button type="button" onClick={onRetry} className={`text-[11px] ${cls}`}>
      {label}
    </button>
  );
}
