"use client";

import { useState } from "react";
import {
  deleteSet,
  formatDuration,
  formatKg,
  formatSet,
  logSet,
  moveExercise,
  progress,
  removeExercise,
  restSecondsFor,
  suggestNextSet,
  updateSet,
  decideAdvice,
  type ExerciseInfo,
  type LastTime,
  type LocalExercise,
  type SetInput,
  type Store,
} from "@/lib/gym/workout";
import { formatShortDate } from "@/lib/dates";
import { pendingAdvice, WEIGHT_LABELS, type Advice } from "@/lib/gym/progression";

type Props = {
  ex: LocalExercise;
  info: ExerciseInfo | undefined;
  last: LastTime | undefined;
  open: boolean;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  update: (f: (s: Store) => Store) => void;
  onLogged: (restSeconds: number, reachedTarget: boolean) => void;
  onSwap: () => void;
};

const RIR_CHOICES = [0, 1, 2, 3, 4, 5];

export function ExerciseCard(p: Props) {
  const { ex, info, last } = p;
  const measure = info?.measure ?? "reps";
  const prog = progress(ex);
  const done = prog.target !== null && prog.done >= prog.target;

  return (
    <section
      className={`rounded-xl border bg-neutral-900 ${
        p.open ? "border-emerald-500/60" : p.isCurrent ? "border-neutral-600" : "border-neutral-800"
      }`}
    >
      <button onClick={p.onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <p className={`truncate font-medium ${done ? "text-neutral-400" : ""}`}>
            {done && <span className="text-emerald-400">✓ </span>}
            {info?.name ?? "Unknown exercise"}
          </p>
          {!p.open && last && (
            <p className="truncate text-xs text-neutral-500">
              Last: {last.sets.filter((s) => !s.is_warmup).map((s) => formatSet(s, measure)).join(" · ")}
            </p>
          )}
          {!p.open && pendingAdvice(ex, last, measure) && (
            <p className="truncate text-xs text-sky-300">
              Suggested: {WEIGHT_LABELS[pendingAdvice(ex, last, measure)!.weight]}
            </p>
          )}
        </div>
        <span className="shrink-0 text-sm tabular-nums text-neutral-400">
          {prog.done}
          {prog.target !== null && `/${prog.target}`}
        </span>
      </button>

      {p.open && <OpenBody {...p} measure={measure} />}
    </section>
  );
}

function OpenBody({
  ex,
  info,
  last,
  isFirst,
  isLast,
  update,
  onLogged,
  onSwap,
  measure,
}: Props & { measure: "reps" | "time" }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const suggested = suggestNextSet(ex, last, measure);
  const advice = pendingAdvice(ex, last, measure);
  const editingSet = ex.sets.find((s) => s.id === editing) ?? null;
  const t = ex.target;
  const targetText = t
    ? [
        `${t.sets} sets`,
        t.repMin !== null && t.repMax !== null
          ? t.repMin === t.repMax
            ? `${t.repMin} reps`
            : `${t.repMin}–${t.repMax} reps`
          : null,
        t.rir !== null ? `@ RIR ${t.rir}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-800 px-4 pb-4 pt-3">
      <div className="flex items-start justify-between gap-2 text-xs">
        <div className="flex flex-col gap-0.5 text-neutral-400">
          {targetText && <p>Target: {targetText}</p>}
          {last ? (
            <p>
              Last ({formatShortDate(last.date)}):{" "}
              <span className="text-neutral-200">
                {last.sets.map((s) => (s.is_warmup ? `w ${formatSet(s, measure)}` : formatSet(s, measure))).join(" · ")}
              </span>
            </p>
          ) : (
            <p>First time logging this here.</p>
          )}
        </div>
        <button
          onClick={() => setMenu(!menu)}
          aria-label="Exercise options"
          className="-mr-2 -mt-1 h-9 w-9 shrink-0 rounded-lg text-lg text-neutral-400 active:bg-neutral-800"
        >
          ⋯
        </button>
      </div>

      {advice && (
        <AdviceBox
          advice={advice}
          onAccept={() => update((s) => decideAdvice(s, ex.id, advice, "accepted"))}
          onIgnore={() => update((s) => decideAdvice(s, ex.id, advice, "ignored"))}
        />
      )}
      {ex.advice?.status === "accepted" && (
        <p className="text-xs text-sky-300">
          ✓ Plan: aim {ex.advice.advice.aimReps} reps · {WEIGHT_LABELS[ex.advice.advice.weight]}
        </p>
      )}

      {menu && (
        <div className="grid grid-cols-4 gap-2">
          <MenuBtn disabled={isFirst} onClick={() => update((s) => moveExercise(s, ex.id, -1))}>
            ↑ Up
          </MenuBtn>
          <MenuBtn disabled={isLast} onClick={() => update((s) => moveExercise(s, ex.id, 1))}>
            ↓ Down
          </MenuBtn>
          <MenuBtn disabled={ex.sets.length > 0} onClick={onSwap}>
            ⇄ Swap
          </MenuBtn>
          <MenuBtn
            danger
            onClick={() => {
              if (ex.sets.length === 0 || confirm(`Remove ${info?.name ?? "exercise"} and its ${ex.sets.length} sets?`)) {
                update((s) => removeExercise(s, ex.id));
              }
            }}
          >
            ✕ Remove
          </MenuBtn>
        </div>
      )}

      {ex.sets.length > 0 && (
        <ol className="flex flex-col gap-1">
          {ex.sets.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => setEditing(editing === s.id ? null : s.id)}
                className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-base tabular-nums ${
                  editing === s.id ? "bg-emerald-500/15 ring-1 ring-emerald-500/60" : "bg-neutral-800/60"
                }`}
              >
                <span className="w-5 text-sm text-neutral-500">{s.isWarmup ? "W" : i + 1 - ex.sets.slice(0, i).filter((x) => x.isWarmup).length}</span>
                <span className="flex-1">{formatSet(s, measure)}</span>
                {s.isWarmup && <span className="text-[11px] text-amber-300">warm-up</span>}
                <span className="text-xs text-neutral-500">edit</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <SetEditor
        key={editingSet ? `edit-${editingSet.id}` : `new-${ex.sets.length}`}
        initial={editingSet ?? suggested}
        measure={measure}
        step={info?.weight_step_kg ?? 2.5}
        mode={editingSet ? "edit" : "new"}
        nextNumber={ex.sets.filter((s) => !s.isWarmup).length + 1}
        onCancel={() => setEditing(null)}
        onDelete={() => {
          if (!editingSet) return;
          update((s) => deleteSet(s, ex.id, editingSet.id));
          setEditing(null);
        }}
        onSubmit={(value) => {
          if (editingSet) {
            update((s) => updateSet(s, ex.id, editingSet.id, value));
            setEditing(null);
            return;
          }
          update((s) => logSet(s, ex.id, value, crypto.randomUUID(), new Date().toISOString()));
          const doneAfter = ex.sets.filter((x) => !x.isWarmup).length + (value.isWarmup ? 0 : 1);
          onLogged(
            value.isWarmup ? Math.min(60, restSecondsFor(ex, info)) : restSecondsFor(ex, info),
            !value.isWarmup && ex.target !== null && doneAfter >= ex.target.sets,
          );
        }}
      />
    </div>
  );
}

function MenuBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-11 rounded-lg border text-xs disabled:opacity-30 ${
        danger ? "border-red-500/40 text-red-300" : "border-neutral-700 text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- set editor

function SetEditor({
  initial,
  measure,
  step,
  mode,
  nextNumber,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial: SetInput;
  measure: "reps" | "time";
  step: number;
  mode: "new" | "edit";
  nextNumber: number;
  onSubmit: (v: SetInput) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [weight, setWeight] = useState(formatKg(initial.weightKg));
  const [reps, setReps] = useState(initial.reps ?? 0);
  const [secs, setSecs] = useState(initial.durationS ?? 30);
  const [rir, setRir] = useState<number | null>(initial.rir);
  const [warmup, setWarmup] = useState(initial.isWarmup);

  // Samsung/Italian keyboards type a comma.
  const kg = Math.max(0, Number(weight.replace(",", ".")) || 0);
  const bump = (d: number) => setWeight(formatKg(Math.max(0, Math.round((kg + d) * 100) / 100)));

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-neutral-950/60 p-3">
      <Stepper
        label="kg"
        onMinus={() => bump(-step)}
        onPlus={() => bump(step)}
        minusLabel={`−${formatKg(step)}`}
        plusLabel={`+${formatKg(step)}`}
      >
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onFocus={(e) => e.target.select()}
          inputMode="decimal"
          aria-label="Weight in kg"
          className="w-full bg-transparent text-center text-3xl font-semibold tabular-nums outline-none"
        />
      </Stepper>

      {measure === "reps" ? (
        <Stepper
          label="reps"
          onMinus={() => setReps(Math.max(0, reps - 1))}
          onPlus={() => setReps(reps + 1)}
          minusLabel="−1"
          plusLabel="+1"
        >
          <input
            value={reps}
            onChange={(e) => setReps(Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0)))}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            aria-label="Reps"
            className="w-full bg-transparent text-center text-3xl font-semibold tabular-nums outline-none"
          />
        </Stepper>
      ) : (
        <Stepper
          label="time"
          onMinus={() => setSecs(Math.max(0, secs - 5))}
          onPlus={() => setSecs(secs + 5)}
          minusLabel="−5s"
          plusLabel="+5s"
        >
          <span className="block text-center text-3xl font-semibold tabular-nums">{formatDuration(secs)}</span>
        </Stepper>
      )}

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">RIR · reps left in the tank</p>
        <div className="grid grid-cols-6 gap-1.5">
          {RIR_CHOICES.map((r) => (
            <button
              key={r}
              onClick={() => setRir(rir === r ? null : r)}
              className={`h-12 rounded-lg text-lg font-semibold tabular-nums ${
                rir === r ? "bg-emerald-500 text-neutral-950" : "bg-neutral-800 text-neutral-200"
              }`}
            >
              {r === 5 ? "5+" : r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setWarmup(!warmup)}
          className={`h-14 rounded-xl border px-4 text-sm ${
            warmup ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-neutral-700 text-neutral-400"
          }`}
        >
          {warmup ? "✓ Warm-up" : "Warm-up"}
        </button>
        <button
          onClick={() =>
            onSubmit({
              weightKg: kg,
              reps: measure === "reps" ? reps : null,
              durationS: measure === "time" ? secs : null,
              rir,
              isWarmup: warmup,
            })
          }
          className="h-14 flex-1 rounded-xl bg-emerald-500 text-lg font-semibold text-neutral-950 active:bg-emerald-400"
        >
          {mode === "edit" ? "Save set" : warmup ? "Log warm-up" : `Log set ${nextNumber}`}
        </button>
      </div>

      {mode === "edit" && (
        <div className="flex gap-2">
          <button onClick={onCancel} className="h-11 flex-1 rounded-lg border border-neutral-700 text-sm text-neutral-300">
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="h-11 flex-1 rounded-lg border border-red-500/40 text-sm text-red-300"
          >
            Delete set
          </button>
        </div>
      )}
    </div>
  );
}

function Stepper({
  label,
  children,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
}: {
  label: string;
  children: React.ReactNode;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
}) {
  return (
    <div className="grid grid-cols-[4rem_1fr_4rem] items-center gap-2">
      <button
        onClick={onMinus}
        aria-label={`${label} ${minusLabel}`}
        className="h-14 rounded-xl bg-neutral-800 text-base font-medium text-neutral-200 active:bg-neutral-700"
      >
        {minusLabel}
      </button>
      <div className="relative">
        {children}
        <span className="pointer-events-none absolute -bottom-3 left-0 right-0 text-center text-[10px] uppercase tracking-wide text-neutral-500">
          {label}
        </span>
      </div>
      <button
        onClick={onPlus}
        aria-label={`${label} ${plusLabel}`}
        className="h-14 rounded-xl bg-neutral-800 text-base font-medium text-neutral-200 active:bg-neutral-700"
      >
        {plusLabel}
      </button>
    </div>
  );
}

/** The progression suggestion: structure from the rules, the kilos stay yours. */
function AdviceBox({ advice, onAccept, onIgnore }: { advice: Advice; onAccept: () => void; onIgnore: () => void }) {
  const range = advice.repMin === advice.repMax ? `${advice.repMin}` : `${advice.repMin}–${advice.repMax}`;
  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
      <p className="text-[11px] uppercase tracking-wide text-sky-300">Suggested for today</p>
      <p className="mt-1">
        {advice.sets} × {range}
        {advice.rir !== null && ` @ RIR ${advice.rir}`} · <b className="font-semibold">{WEIGHT_LABELS[advice.weight]}</b>
      </p>
      <p className="mt-0.5 text-xs text-neutral-400">
        Last time ({formatShortDate(advice.basedOn)}) {advice.reason}
        {advice.repsOnly && " · no RIR logged, judged on reps"}
      </p>
      <div className="mt-2 flex gap-2">
        <button onClick={onAccept} className="h-9 flex-1 rounded-lg bg-sky-500/90 text-xs font-semibold text-neutral-950">
          Accept
        </button>
        <button onClick={onIgnore} className="h-9 flex-1 rounded-lg border border-neutral-700 text-xs text-neutral-300">
          Ignore
        </button>
      </div>
    </div>
  );
}
