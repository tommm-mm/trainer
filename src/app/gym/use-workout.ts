"use client";

// Local-first workout state: every change is written to localStorage first,
// then pushed to Supabase in the background. If the push fails (no signal),
// it is retried on reconnect and every few seconds until it succeeds.

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays } from "@/lib/dates";
import { linkWorkouts } from "@/lib/gym/link";
import { pushWorkout } from "@/lib/gym/push";
import { isDirty, markSynced, toRows, type Store } from "@/lib/gym/workout";

const KEY = "trainer:gym:active";
const PUSH_DELAY_MS = 500;
const RETRY_MS = 10_000;

export type SyncState = "saved" | "saving" | "offline" | "error";

export type Finished = { id: string; linked: boolean };

function read(): Store | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : null;
  } catch {
    return null;
  }
}

function write(store: Store | null) {
  try {
    if (store) localStorage.setItem(KEY, JSON.stringify(store));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the server copy still gets every set once online.
  }
}

export function useWorkout(serverActive: Store | null, onDone: () => void) {
  const [store, setStoreState] = useState<Store | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sync, setSync] = useState<SyncState>("saved");
  const [lastError, setLastError] = useState<string | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const storeRef = useRef<Store | null>(null);
  const inFlight = useRef(false);
  const [supabase] = useState(createClient);

  const setStore = useCallback((next: Store | null | ((cur: Store | null) => Store | null)) => {
    setStoreState((cur) => {
      const value = typeof next === "function" ? next(cur) : next;
      storeRef.current = value;
      write(value);
      return value;
    });
  }, []);

  // Local copy wins (it has every set, synced or not); else resume the server's.
  useEffect(() => {
    const local = read();
    const initial = local ?? serverActive;
    storeRef.current = initial;
    if (initial) write(initial);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setStoreState(initial);
    setLoaded(true);
    // Only on mount: later server props must not overwrite local edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = useCallback(async () => {
    const s = storeRef.current;
    if (!s || !isDirty(s) || inFlight.current) return;
    if (!navigator.onLine) {
      // Don't wait on a request that can't succeed; the "online" event retries.
      setSync("offline");
      return;
    }
    inFlight.current = true;
    setSync("saving");
    const rev = s.rev;
    const pushed = s.deleted;
    try {
      await pushWorkout(supabase, toRows(s, new Date().toISOString()));
      setStore((cur) => (cur && cur.doc.id === s.doc.id ? markSynced(cur, rev, pushed) : cur));
      setSync("saved");
      setLastError(null);
    } catch (err) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setSync(offline ? "offline" : "error");
      setLastError(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
    } finally {
      inFlight.current = false;
    }
  }, [supabase, setStore]);

  // Push shortly after every edit (and again if edits landed mid-push).
  const rev = store?.rev ?? 0;
  const syncedRev = store?.syncedRev ?? 0;
  useEffect(() => {
    if (rev <= syncedRev) return;
    const t = setTimeout(push, PUSH_DELAY_MS);
    return () => clearTimeout(t);
  }, [rev, syncedRev, sync, push]);

  // Retry loop + reconnect.
  useEffect(() => {
    const onOnline = () => void push();
    window.addEventListener("online", onOnline);
    const t = setInterval(() => void push(), RETRY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(t);
    };
  }, [push]);

  // Once a finished/discarded workout is fully saved: link Garmin, clear local.
  const status = store?.doc.status;
  const clean = store ? !isDirty(store) : false;
  useEffect(() => {
    const s = storeRef.current;
    if (!s || status === "in_progress" || !clean) return;
    let cancelled = false;
    (async () => {
      let linked = false;
      if (s.doc.status === "completed") {
        try {
          // A day either side covers workouts that cross midnight.
          await linkWorkouts(supabase, { from: addDays(s.doc.date, -1), to: addDays(s.doc.date, 1) });
          const { data } = await supabase.from("workouts").select("activity_id").eq("id", s.doc.id).maybeSingle();
          linked = !!data?.activity_id;
        } catch {
          // Linking also runs after every Garmin sync; nothing is lost.
        }
      }
      if (cancelled) return;
      if (s.doc.status === "completed") setFinished({ id: s.doc.id, linked });
      setStore(null);
      onDone();
    })();
    return () => {
      cancelled = true;
    };
  }, [status, clean, supabase, setStore, onDone]);

  return { store, setStore, loaded, sync, lastError, finished, setFinished, pushNow: push };
}
