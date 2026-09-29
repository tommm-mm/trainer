"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/gym/workout";

const KEY = "trainer:gym:rest";

type RestState = { endsAt: number; total: number } | null;

/**
 * Rest countdown based on an end timestamp (not a ticking counter), so it
 * stays right when the screen locks or the tab sleeps. Persisted so a reload
 * mid-rest keeps it.
 */
export function useRestTimer() {
  const [state, setState] = useState<RestState>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage once
      if (raw) setState(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const save = (s: RestState) => {
    setState(s);
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  };

  const start = useCallback((seconds: number) => save({ endsAt: Date.now() + seconds * 1000, total: seconds }), []);
  const clear = useCallback(() => save(null), []);
  const add = useCallback(
    (seconds: number) =>
      setState((s) => {
        const next = s ? { endsAt: s.endsAt + seconds * 1000, total: Math.max(0, s.total + seconds) } : s;
        try {
          if (next) localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      }),
    [],
  );

  return { state, start, clear, add };
}

export function RestBar({ rest }: { rest: ReturnType<typeof useRestTimer> }) {
  const [now, setNow] = useState(() => Date.now());
  const buzzed = useRef<number | null>(null);
  const s = rest.state;

  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [s]);

  const left = s ? Math.ceil((s.endsAt - now) / 1000) : 0;
  const over = s !== null && left <= 0;

  useEffect(() => {
    if (!s || !over || buzzed.current === s.endsAt) return;
    buzzed.current = s.endsAt;
    // Android vibrates; iOS ignores this and the bar just turns green.
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  }, [s, over]);

  if (!s) return null;
  // Auto-hide 2 minutes after the rest ended.
  if (left < -120) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(49px+env(safe-area-inset-bottom))] z-30 px-3 pb-2">
      <div
        className={`mx-auto flex max-w-md items-center gap-2 rounded-2xl border p-2 shadow-lg ${
          over ? "border-emerald-400 bg-emerald-500 text-neutral-950" : "border-neutral-700 bg-neutral-900"
        }`}
      >
        <button onClick={() => rest.add(-15)} className="h-12 w-14 rounded-xl bg-black/20 text-sm font-medium">
          −15
        </button>
        <div className="flex-1 text-center">
          <p className="text-[11px] uppercase tracking-wide opacity-70">{over ? "Rest over" : "Rest"}</p>
          <p className="text-2xl font-semibold tabular-nums">{over ? "Go!" : formatDuration(left)}</p>
        </div>
        <button onClick={() => rest.add(15)} className="h-12 w-14 rounded-xl bg-black/20 text-sm font-medium">
          +15
        </button>
        <button onClick={rest.clear} className="h-12 w-14 rounded-xl bg-black/20 text-sm font-medium">
          {over ? "OK" : "Skip"}
        </button>
      </div>
    </div>
  );
}
