// The in-progress workout as it lives on the phone. Pure functions only:
// every edit returns a new Store with `rev` bumped, and the sync loop pushes
// whatever is newer than `syncedRev`. Ids are generated here (client side), so
// pushing the same state twice is a no-op upsert — a set can be retried until
// the network cooperates and is never duplicated or lost.

import type { Tables } from "@/lib/database.types";
import type { StrengthSession } from "@/lib/strength";
import { mondayOf } from "@/lib/dates";
import { WEIGHT_LABELS, type Advice } from "./progression";

export type Block = "main" | "finisher";
export type Measure = "reps" | "time";

export type ExerciseInfo = Pick<
  Tables<"exercises">,
  | "id"
  | "name"
  | "primary_muscles"
  | "secondary_muscles"
  | "equipment"
  | "mechanic"
  | "is_main_lift"
  | "weight_step_kg"
> & { measure: Measure; user_id: string | null };

export type Target = {
  sets: number;
  repMin: number | null;
  repMax: number | null;
  rir: number | null;
  restSeconds: number | null;
};

export type LocalSet = {
  id: string;
  weightKg: number;
  reps: number | null;
  durationS: number | null;
  rir: number | null;
  isWarmup: boolean;
  loggedAt: string;
};

export type LocalExercise = {
  id: string;
  exerciseId: string;
  templateExerciseId: string | null;
  block: Block;
  target: Target | null;
  sets: LocalSet[];
  /** Your decision on the progression suggestion (absent = not decided yet). */
  advice?: { advice: Advice; status: "accepted" | "ignored" } | null;
  /** You changed the target by hand (sets / reps / RIR): saved as this week's target. */
  targetEdited?: boolean;
};

export type WorkoutStatus = "in_progress" | "completed" | "discarded";

export type WorkoutDoc = {
  id: string;
  date: string;
  startedAt: string;
  finishedAt: string | null;
  status: WorkoutStatus;
  templateId: string | null;
  templateName: string | null;
  planId: string | null;
  sessionRpe: number | null;
  notes: string | null;
  exercises: LocalExercise[];
  /** Exercises created during this workout; synced before anything that references them. */
  newExercises: ExerciseInfo[];
};

export type Store = {
  doc: WorkoutDoc;
  /** Bumped on every edit. */
  rev: number;
  /** Highest rev confirmed saved on the server. */
  syncedRev: number;
  /** Rows deleted locally that the server may still have. */
  deleted: { sets: string[]; exercises: string[] };
};

export type TemplateExerciseInput = {
  id: string;
  exercise_id: string;
  block: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  target_rir: number | null;
  rest_seconds: number | null;
};

export type TemplateInput = {
  id: string;
  name: string;
  items: TemplateExerciseInput[]; // in template order
};

// ---------------------------------------------------------------- lifecycle

export function startWorkout(opts: {
  id: string;
  date: string;
  now: string;
  template: TemplateInput | null;
  planId?: string | null;
  newId: () => string;
}): Store {
  const exercises: LocalExercise[] = (opts.template?.items ?? []).map((t) => ({
    id: opts.newId(),
    exerciseId: t.exercise_id,
    templateExerciseId: t.id,
    block: t.block === "finisher" ? "finisher" : "main",
    target: {
      sets: t.sets,
      repMin: t.rep_min,
      repMax: t.rep_max,
      rir: t.target_rir,
      restSeconds: t.rest_seconds,
    },
    sets: [],
  }));
  return {
    doc: {
      id: opts.id,
      date: opts.date,
      startedAt: opts.now,
      finishedAt: null,
      status: "in_progress",
      templateId: opts.template?.id ?? null,
      templateName: opts.template?.name ?? null,
      planId: opts.planId ?? null,
      sessionRpe: null,
      notes: null,
      exercises,
      newExercises: [],
    },
    rev: 1,
    syncedRev: 0,
    deleted: { sets: [], exercises: [] },
  };
}

function edit(store: Store, doc: WorkoutDoc, deleted = store.deleted): Store {
  return { ...store, doc, deleted, rev: store.rev + 1 };
}

function mapExercise(
  store: Store,
  weId: string,
  f: (e: LocalExercise) => LocalExercise,
): Store {
  if (!store.doc.exercises.some((e) => e.id === weId)) return store;
  return edit(store, {
    ...store.doc,
    exercises: store.doc.exercises.map((e) => (e.id === weId ? f(e) : e)),
  });
}

// ---------------------------------------------------------------- progression advice

/** Accept or ignore the suggestion for one exercise. Accepting sets its target to the advice. */
export function decideAdvice(
  store: Store,
  weId: string,
  advice: Advice,
  status: "accepted" | "ignored",
): Store {
  return mapExercise(store, weId, (e) => ({
    ...e,
    advice: { advice, status },
    targetEdited: status === "accepted" ? false : e.targetEdited,
    target:
      status === "accepted"
        ? {
            sets: advice.sets,
            repMin: advice.repMin,
            repMax: advice.repMax,
            rir: advice.rir,
            restSeconds: e.target?.restSeconds ?? null,
          }
        : e.target,
  }));
}

export type TargetEdit = Partial<Pick<Target, "sets" | "repMin" | "repMax" | "rir">>;

/**
 * Change today's target by hand: sets 1–10, reps 1–100 (min ≤ max), RIR 0–5.
 * Nothing is strict: it's your call, saved as this week's target for the PT to see.
 */
export function editTarget(store: Store, weId: string, edit: TargetEdit): Store {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  return mapExercise(store, weId, (e) => {
    const t: Target = e.target ?? { sets: Math.max(1, e.sets.filter((x) => !x.isWarmup).length), repMin: null, repMax: null, rir: null, restSeconds: null };
    const sets = clamp(edit.sets ?? t.sets, 1, 10);
    let repMin = edit.repMin !== undefined ? edit.repMin : t.repMin;
    let repMax = edit.repMax !== undefined ? edit.repMax : t.repMax;
    repMin = repMin == null ? null : clamp(repMin, 1, 100);
    repMax = repMax == null ? null : clamp(repMax, 1, 100);
    // Keep min ≤ max by moving the other end along with the one you changed.
    if (repMin != null && repMax != null && repMin > repMax) {
      if (edit.repMin !== undefined) repMax = repMin;
      else repMin = repMax;
    }
    const rirIn = edit.rir !== undefined ? edit.rir : t.rir;
    const rir = rirIn == null ? null : clamp(rirIn, 0, 5);
    return { ...e, target: { ...t, sets, repMin, repMax, rir }, targetEdited: true };
  });
}

/** "Accept all": every undecided suggestion in one edit (one rev bump). */
export function acceptAllAdvice(store: Store, advice: Record<string, Advice>): Store {
  let next = store;
  for (const [weId, a] of Object.entries(advice)) {
    const ex = next.doc.exercises.find((e) => e.id === weId);
    if (ex && !ex.advice) next = decideAdvice(next, weId, a, "accepted");
  }
  return next === store ? store : { ...next, rev: store.rev + 1 };
}

// ---------------------------------------------------------------- sets

export type SetInput = Omit<LocalSet, "id" | "loggedAt">;

export function logSet(store: Store, weId: string, set: SetInput, id: string, now: string): Store {
  return mapExercise(store, weId, (e) => ({
    ...e,
    sets: [...e.sets, { ...set, id, loggedAt: now }],
  }));
}

export function updateSet(store: Store, weId: string, setId: string, patch: Partial<SetInput>): Store {
  return mapExercise(store, weId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
  }));
}

export function deleteSet(store: Store, weId: string, setId: string): Store {
  const next = mapExercise(store, weId, (e) => ({
    ...e,
    sets: e.sets.filter((s) => s.id !== setId),
  }));
  if (next === store) return store;
  return { ...next, deleted: { ...next.deleted, sets: [...next.deleted.sets, setId] } };
}

// ---------------------------------------------------------------- exercises

export function addExercise(
  store: Store,
  opts: { id: string; exercise: ExerciseInfo; block?: Block; isNew?: boolean },
): Store {
  const doc = store.doc;
  const item: LocalExercise = {
    id: opts.id,
    exerciseId: opts.exercise.id,
    templateExerciseId: null,
    block: opts.block ?? "main",
    target: null,
    sets: [],
  };
  // Main-block additions go before the finisher, finisher ones at the end.
  const firstFinisher = doc.exercises.findIndex((e) => e.block === "finisher");
  const at = item.block === "main" && firstFinisher >= 0 ? firstFinisher : doc.exercises.length;
  const exercises = [...doc.exercises];
  exercises.splice(at, 0, item);
  return edit(store, {
    ...doc,
    exercises,
    newExercises: opts.isNew ? [...doc.newExercises, opts.exercise] : doc.newExercises,
  });
}

/** Swap keeps the slot (order, template target). Only allowed before any set is logged. */
export function swapExercise(store: Store, weId: string, exerciseId: string): Store {
  const e = store.doc.exercises.find((x) => x.id === weId);
  if (!e || e.sets.length > 0) return store;
  return mapExercise(store, weId, (x) => ({ ...x, exerciseId }));
}

export function moveExercise(store: Store, weId: string, dir: -1 | 1): Store {
  const list = [...store.doc.exercises];
  const i = list.findIndex((e) => e.id === weId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return store;
  [list[i], list[j]] = [list[j], list[i]];
  return edit(store, { ...store.doc, exercises: list });
}

export function removeExercise(store: Store, weId: string): Store {
  const e = store.doc.exercises.find((x) => x.id === weId);
  if (!e) return store;
  return edit(
    store,
    { ...store.doc, exercises: store.doc.exercises.filter((x) => x.id !== weId) },
    {
      sets: [...store.deleted.sets, ...e.sets.map((s) => s.id)],
      exercises: [...store.deleted.exercises, weId],
    },
  );
}

// ---------------------------------------------------------------- finish

export function finishWorkout(
  store: Store,
  opts: { now: string; sessionRpe: number | null; notes: string | null },
): Store {
  // Never before the start (a phone clock change must not break the DB check).
  const finishedAt = opts.now < store.doc.startedAt ? store.doc.startedAt : opts.now;
  return edit(store, {
    ...store.doc,
    status: "completed",
    finishedAt,
    sessionRpe: opts.sessionRpe,
    notes: opts.notes?.trim() || null,
  });
}

export function discardWorkout(store: Store, now: string): Store {
  return edit(store, { ...store.doc, status: "discarded", finishedAt: store.doc.finishedAt ?? maxIso(now, store.doc.startedAt) });
}

export function isDirty(store: Store): boolean {
  return store.rev > store.syncedRev;
}

/** Marks everything up to `rev` as saved and forgets tombstones that were pushed. */
export function markSynced(store: Store, rev: number, pushed: Store["deleted"]): Store {
  const sets = new Set(pushed.sets);
  const exercises = new Set(pushed.exercises);
  return {
    ...store,
    syncedRev: Math.max(store.syncedRev, rev),
    deleted: {
      sets: store.deleted.sets.filter((id) => !sets.has(id)),
      exercises: store.deleted.exercises.filter((id) => !exercises.has(id)),
    },
  };
}

// ---------------------------------------------------------------- rows for the DB

export type SyncRows = {
  newExercises: ExerciseInfo[];
  workout: {
    id: string;
    date: string;
    started_at: string;
    finished_at: string | null;
    status: WorkoutStatus;
    template_id: string | null;
    plan_id: string | null;
    session_rpe: number | null;
    notes: string | null;
    updated_at: string;
  };
  exercises: {
    id: string;
    workout_id: string;
    exercise_id: string;
    template_exercise_id: string | null;
    block: Block;
    position: number;
  }[];
  sets: {
    id: string;
    workout_exercise_id: string;
    position: number;
    weight_kg: number;
    reps: number | null;
    duration_s: number | null;
    rir: number | null;
    is_warmup: boolean;
    logged_at: string;
  }[];
  /** Accepted suggestions, kept as approved per-week targets (what you took on, for the coach). */
  targets: {
    template_exercise_id: string;
    week_start: string;
    sets: number;
    rep_min: number | null;
    rep_max: number | null;
    target_rir: number | null;
    /** engine = an accepted suggestion; manual = you edited the target. */
    source: "engine" | "manual";
    status: "approved";
    rationale: string;
  }[];
  deleted: Store["deleted"];
};

/** Full snapshot of the workout as DB rows. Positions follow the on-screen order. */
export function toRows(store: Store, now: string): SyncRows {
  const d = store.doc;
  return {
    newExercises: d.newExercises,
    workout: {
      id: d.id,
      date: d.date,
      started_at: d.startedAt,
      finished_at: d.finishedAt,
      status: d.status,
      template_id: d.templateId,
      plan_id: d.planId,
      session_rpe: d.sessionRpe,
      notes: d.notes,
      updated_at: now,
    },
    exercises: d.exercises.map((e, i) => ({
      id: e.id,
      workout_id: d.id,
      exercise_id: e.exerciseId,
      template_exercise_id: e.templateExerciseId,
      block: e.block,
      position: i + 1,
    })),
    sets: d.exercises.flatMap((e) =>
      e.sets.map((s, i) => ({
        id: s.id,
        workout_exercise_id: e.id,
        position: i + 1,
        weight_kg: s.weightKg,
        reps: s.reps,
        duration_s: s.durationS,
        rir: s.rir,
        is_warmup: s.isWarmup,
        logged_at: s.loggedAt,
      })),
    ),
    targets: d.exercises.flatMap((e): SyncRows["targets"] => {
      if (!e.templateExerciseId) return [];
      const week_start = mondayOf(d.date);
      // Your own edit wins: saved as a manual target, with what was suggested next to it.
      if (e.targetEdited && e.target) {
        const a = e.advice?.advice;
        return [
          {
            template_exercise_id: e.templateExerciseId,
            week_start,
            sets: e.target.sets,
            rep_min: e.target.repMin,
            rep_max: e.target.repMax,
            target_rir: e.target.rir,
            source: "manual" as const,
            status: "approved" as const,
            rationale: [
              "set by you",
              a ? `suggested ${a.sets} × ${a.repMin}–${a.repMax}${a.rir !== null ? ` @ RIR ${a.rir}` : ""}, ${WEIGHT_LABELS[a.weight]}` : null,
              a?.blockNote,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ];
      }
      if (e.advice?.status !== "accepted") return [];
      return [
        {
          template_exercise_id: e.templateExerciseId,
          week_start,
          sets: e.advice.advice.sets,
          rep_min: e.advice.advice.repMin,
          rep_max: e.advice.advice.repMax,
          target_rir: e.advice.advice.rir,
          source: "engine" as const,
          status: "approved" as const,
          rationale: [WEIGHT_LABELS[e.advice.advice.weight], e.advice.advice.blockNote, e.advice.advice.reason]
            .filter(Boolean)
            .join(" · "),
        },
      ];
    }),
    deleted: store.deleted,
  };
}

// ---------------------------------------------------------------- history & prefill

export type HistorySet = {
  weight_kg: number;
  reps: number | null;
  duration_s: number | null;
  rir: number | null;
  is_warmup: boolean;
  position: number;
};

export type HistoryRow = {
  exercise_id: string;
  date: string;
  started_at: string;
  sets: HistorySet[];
};

export type LastTime = { date: string; sets: HistorySet[] };

/**
 * The most recent session of each exercise (rows from completed workouts),
 * sets in order. If an exercise appears twice in one workout the later-started
 * workout wins, then the slot with more sets.
 */
export function lastTimeByExercise(rows: HistoryRow[]): Record<string, LastTime> {
  const best: Record<string, HistoryRow> = {};
  for (const r of rows) {
    if (r.sets.length === 0) continue;
    const cur = best[r.exercise_id];
    if (
      !cur ||
      r.started_at > cur.started_at ||
      (r.started_at === cur.started_at && r.sets.length > cur.sets.length)
    ) {
      best[r.exercise_id] = r;
    }
  }
  const out: Record<string, LastTime> = {};
  for (const [id, r] of Object.entries(best)) {
    out[id] = { date: r.date, sets: [...r.sets].sort((a, b) => a.position - b.position) };
  }
  return out;
}

export const DEFAULT_REPS = 8;
export const DEFAULT_SECONDS = 30;

/**
 * What the set editor shows before you touch anything:
 * 1. the previous set of this exercise today (same weight/reps/RIR/warm-up state), else
 * 2. the first working set from last time, else
 * 3. the template target (top of the rep range, target RIR), else defaults.
 * An accepted progression suggestion starts 2. from the weight it was judged at
 * (the back-off weight, not a top set) and its reps to aim for.
 */
export function suggestNextSet(
  ex: Pick<LocalExercise, "sets" | "target" | "advice">,
  last: LastTime | undefined,
  measure: Measure,
): SetInput {
  const prev = ex.sets.at(-1);
  // Block week before a deload: the last set of the accessory goes to a lower RIR.
  const lastRir = ex.advice?.status === "accepted" ? ex.advice.advice.lastSetRir : null;
  const isLastSet =
    lastRir != null && ex.target != null && ex.sets.filter((s) => !s.isWarmup).length === ex.target.sets - 1;
  if (prev) {
    return {
      weightKg: prev.weightKg,
      reps: prev.reps,
      durationS: prev.durationS,
      rir: isLastSet ? lastRir : prev.rir,
      isWarmup: false,
    };
  }
  const working = last?.sets.filter((s) => !s.is_warmup) ?? [];
  const match = working[0];
  const targetRir = ex.target?.rir ?? null;
  // An accepted suggestion sets the reps to aim for; the weight stays yours.
  const accepted = ex.advice?.status === "accepted" ? ex.advice.advice : null;
  const aim = accepted?.aimReps ?? null;
  if (match) {
    return {
      weightKg: accepted?.basisKg ?? match.weight_kg,
      reps: measure === "reps" ? (aim ?? match.reps ?? DEFAULT_REPS) : null,
      durationS: measure === "time" ? (match.duration_s ?? DEFAULT_SECONDS) : null,
      rir: targetRir ?? match.rir,
      isWarmup: false,
    };
  }
  return {
    weightKg: 0,
    reps: measure === "reps" ? (aim ?? ex.target?.repMax ?? DEFAULT_REPS) : null,
    durationS: measure === "time" ? DEFAULT_SECONDS : null,
    rir: targetRir,
    isWarmup: false,
  };
}

/** Default rest when the template doesn't set one. Finishers are circuits: no timer. */
export function restSecondsFor(
  ex: Pick<LocalExercise, "block" | "target">,
  info: Pick<ExerciseInfo, "mechanic"> | undefined,
): number {
  if (ex.target?.restSeconds != null) return ex.target.restSeconds;
  if (ex.block === "finisher") return 0;
  return info?.mechanic === "compound" ? 150 : 90;
}

/** Working (non-warm-up) sets logged vs the target — drives "3/4" and the next-exercise highlight. */
export function progress(ex: Pick<LocalExercise, "sets" | "target">): { done: number; target: number | null } {
  return {
    done: ex.sets.filter((s) => !s.isWarmup).length,
    target: ex.target?.sets ?? null,
  };
}

/** Index of the first exercise that still has target sets to do (else the first without any sets). */
export function currentExerciseIndex(doc: Pick<WorkoutDoc, "exercises">): number {
  const i = doc.exercises.findIndex((e) => {
    const p = progress(e);
    return p.target !== null ? p.done < p.target : p.done === 0;
  });
  return i;
}

// ---------------------------------------------------------------- rebuild from the server

export type ServerWorkout = Tables<"workouts"> & {
  workout_templates: { name: string } | null;
  workout_exercises: (Tables<"workout_exercises"> & {
    template_exercises: Pick<
      Tables<"template_exercises">,
      "sets" | "rep_min" | "rep_max" | "target_rir" | "rest_seconds"
    > | null;
    workout_sets: Tables<"workout_sets">[];
  })[];
};

/** An in-progress workout saved on the server (e.g. local storage was cleared) → Store. */
export function storeFromServer(w: ServerWorkout): Store {
  const exercises = [...w.workout_exercises]
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      id: e.id,
      exerciseId: e.exercise_id,
      templateExerciseId: e.template_exercise_id,
      block: (e.block === "finisher" ? "finisher" : "main") as Block,
      target: e.template_exercises
        ? {
            sets: e.template_exercises.sets,
            repMin: e.template_exercises.rep_min,
            repMax: e.template_exercises.rep_max,
            rir: e.template_exercises.target_rir,
            restSeconds: e.template_exercises.rest_seconds,
          }
        : null,
      sets: [...e.workout_sets]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.id,
          weightKg: Number(s.weight_kg),
          reps: s.reps,
          durationS: s.duration_s,
          rir: s.rir,
          isWarmup: s.is_warmup,
          loggedAt: s.logged_at,
        })),
    }));
  return {
    doc: {
      id: w.id,
      date: w.date,
      startedAt: w.started_at,
      finishedAt: w.finished_at,
      status: w.status as WorkoutStatus,
      templateId: w.template_id,
      templateName: w.workout_templates?.name ?? null,
      planId: w.plan_id,
      sessionRpe: w.session_rpe,
      notes: w.notes,
      exercises,
      newExercises: [],
    },
    rev: 1,
    syncedRev: 1,
    deleted: { sets: [], exercises: [] },
  };
}

// ---------------------------------------------------------------- strength metrics input

/** The local workout in strength.ts's shape (for live meters). */
export function toStrengthSession(doc: WorkoutDoc): StrengthSession {
  return {
    id: doc.id,
    date: doc.date,
    minutes: null,
    session_rpe: doc.sessionRpe,
    activity_id: null,
    template_id: doc.templateId,
    slots: doc.exercises.map((e) => ({
      exercise_id: e.exerciseId,
      block: e.block,
      target: e.target ? { sets: e.target.sets, rir: e.target.rir } : null,
      sets: e.sets.map((s) => ({
        weight_kg: s.weightKg,
        reps: s.reps,
        duration_s: s.durationS,
        rir: s.rir,
        is_warmup: s.isWarmup,
      })),
    })),
  };
}

// ---------------------------------------------------------------- formatting

export function formatKg(kg: number): string {
  return String(Math.round(kg * 100) / 100);
}

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

/** "60 × 8 @1", "20s", "BW × 12" */
export function formatSet(
  s: { weight_kg?: number; weightKg?: number; reps: number | null; duration_s?: number | null; durationS?: number | null; rir: number | null },
  measure: Measure,
): string {
  const kg = s.weightKg ?? s.weight_kg ?? 0;
  const dur = s.durationS ?? s.duration_s ?? null;
  const load = kg > 0 ? formatKg(kg) : null;
  const main =
    measure === "time"
      ? [load && `${load} kg`, dur != null ? formatDuration(dur) : null].filter(Boolean).join(" · ")
      : `${load ?? "BW"} × ${s.reps ?? 0}`;
  return s.rir != null ? `${main} @${s.rir}` : main;
}

function maxIso(a: string, b: string) {
  return a > b ? a : b;
}
