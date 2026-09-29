"use client";

import { useMemo, useState } from "react";
import { inputCls, labelCls } from "@/components/ui";
import type { Block, ExerciseInfo, Measure } from "@/lib/gym/workout";

const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core"];
const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "other"];
const STEP: Record<string, number> = { dumbbell: 2, machine: 5, kettlebell: 4 };

/** Full-screen sheet: search the library, or create a new exercise on the spot (works offline). */
export function ExercisePicker({
  library,
  title,
  allowBlock,
  onPick,
  onClose,
}: {
  library: ExerciseInfo[];
  title: string;
  allowBlock: boolean;
  onPick: (e: ExerciseInfo, opts: { block: Block; isNew: boolean }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [block, setBlock] = useState<Block>("main");
  const [creating, setCreating] = useState(false);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return library
      .filter((e) => words.every((w) => `${e.name} ${e.primary_muscles.join(" ")}`.toLowerCase().includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, library]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <button onClick={onClose} className="h-10 w-10 rounded-lg text-xl text-neutral-300" aria-label="Close">
          ←
        </button>
        <h2 className="font-semibold">{title}</h2>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {allowBlock && (
          <div className="grid grid-cols-2 gap-2">
            {(["main", "finisher"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBlock(b)}
                className={`h-10 rounded-lg text-sm ${
                  block === b ? "bg-emerald-500 font-medium text-neutral-950" : "bg-neutral-800 text-neutral-300"
                }`}
              >
                {b === "main" ? "Main work" : "Finisher"}
              </button>
            ))}
          </div>
        )}

        {creating ? (
          <CreateForm
            initialName={q}
            onCancel={() => setCreating(false)}
            onCreate={(e) => onPick(e, { block, isNew: true })}
          />
        ) : (
          <>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search exercises or muscles"
              className={inputCls}
            />
            <ul className="flex flex-col divide-y divide-neutral-800">
              {results.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => onPick(e, { block, isNew: false })}
                    className="flex w-full items-center justify-between gap-2 py-3 text-left"
                  >
                    <span>{e.name}</span>
                    <span className="text-xs text-neutral-500">{e.primary_muscles.join(", ")}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setCreating(true)}
              className="h-12 rounded-xl border border-dashed border-neutral-600 text-sm text-neutral-300"
            >
              + Create {q.trim() ? `“${q.trim()}”` : "a new exercise"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CreateForm({
  initialName,
  onCreate,
  onCancel,
}: {
  initialName: string;
  onCreate: (e: ExerciseInfo) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName.trim());
  const [muscle, setMuscle] = useState("chest");
  const [equipment, setEquipment] = useState("machine");
  const [mechanic, setMechanic] = useState<"compound" | "isolation">("isolation");
  const [measure, setMeasure] = useState<Measure>("reps");
  const valid = name.trim().length >= 2;

  return (
    <div className="flex flex-col gap-3">
      <label className={labelCls}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Leg Curl (Machine)" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>
          Main muscle
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className={inputCls}>
            {MUSCLES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Equipment
          <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={inputCls}>
            {EQUIPMENT.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Type
          <select
            value={mechanic}
            onChange={(e) => setMechanic(e.target.value as "compound" | "isolation")}
            className={inputCls}
          >
            <option value="compound">compound</option>
            <option value="isolation">isolation</option>
          </select>
        </label>
        <label className={labelCls}>
          Logged as
          <select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)} className={inputCls}>
            <option value="reps">weight × reps</option>
            <option value="time">time</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-neutral-500">Secondary muscles can be added later; they only affect the Stats volume count.</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="h-12 flex-1 rounded-xl border border-neutral-700 text-sm">
          Back
        </button>
        <button
          disabled={!valid}
          onClick={() =>
            onCreate({
              id: crypto.randomUUID(),
              user_id: "me", // placeholder: the DB sets the real owner via auth.uid()
              name: name.trim(),
              primary_muscles: [muscle],
              secondary_muscles: [],
              equipment,
              mechanic,
              measure,
              is_main_lift: false,
              weight_step_kg: STEP[equipment] ?? 2.5,
            })
          }
          className="h-12 flex-1 rounded-xl bg-emerald-500 text-sm font-semibold text-neutral-950 disabled:opacity-40"
        >
          Create & add
        </button>
      </div>
    </div>
  );
}
