"use client";

import { useState } from "react";
import { CALF_SCORES, NIGGLES } from "@/lib/checkin";

const chip = (on: boolean) =>
  `rounded-lg px-2.5 py-1.5 text-sm transition ${
    on ? "bg-emerald-500 font-semibold text-neutral-950" : "border border-neutral-800 text-neutral-300"
  }`;

/** Calves 0–3 and one niggle area, as hidden form fields (calf_score, niggle). */
export function CalfNiggleFields({ calf, niggle }: { calf: number | null; niggle: string | null }) {
  const [score, setScore] = useState<number | null>(calf);
  const [area, setArea] = useState<string | null>(niggle);
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs text-neutral-400">Calves</legend>
        <input type="hidden" name="calf_score" value={score ?? ""} />
        <div className="grid grid-cols-4 gap-1">
          {CALF_SCORES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={score === c.value}
              onClick={() => setScore(score === c.value ? null : c.value)}
              className={`${chip(score === c.value)} flex flex-col items-center leading-tight`}
            >
              <span className="tabular-nums">{c.value}</span>
              <span className="text-[10px] font-normal opacity-80">{c.label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs text-neutral-400">Any niggle? (optional)</legend>
        <input type="hidden" name="niggle" value={area ?? ""} />
        <div className="flex flex-wrap gap-1">
          {NIGGLES.map((n) => (
            <button
              key={n.value}
              type="button"
              aria-pressed={area === n.value}
              onClick={() => setArea(area === n.value ? null : n.value)}
              className={chip(area === n.value)}
            >
              {n.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
