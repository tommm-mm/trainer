"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { btnSmall } from "@/components/ui";

const STORAGE_KEY = "trainer:last-sync";
const AUTO_SYNC_AFTER_MS = 10 * 60 * 1000;

type Status =
  | { state: "idle"; text: string }
  | { state: "syncing" }
  | { state: "error"; text: string };

function readLastSync(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastSync(ms: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(ms));
  } catch {
    // Private mode / blocked storage: auto-sync just runs more often.
  }
}

function ago(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/**
 * Syncs Garmin (via intervals.icu) when the app opens, and on tap.
 * `stale`: the page shows a sync warning, so refresh after any successful sync to clear it.
 */
export function SyncButton({ stale = false }: { stale?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ state: "idle", text: "" });

  const sync = useCallback(async () => {
    setStatus({ state: "syncing" });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const now = Date.now();
      writeLastSync(now);
      const bits = [
        body.imported ? `${body.imported} new` : null,
        body.completedPlans ? `${body.completedPlans} ticked` : null,
      ].filter(Boolean);
      setStatus({
        state: "idle",
        text: `Synced ${ago(now)}${bits.length ? ` · ${bits.join(", ")}` : ""}`,
      });
      if (stale || body.imported || body.updated || body.completedPlans) router.refresh();
    } catch (err) {
      setStatus({
        state: "error",
        text: err instanceof Error ? err.message : "Sync failed",
      });
    }
  }, [router, stale]);

  useEffect(() => {
    // localStorage only exists in the browser, so this runs after mount.
    const timer = setTimeout(() => {
      const last = readLastSync();
      if (Date.now() - last > AUTO_SYNC_AFTER_MS) {
        void sync();
      } else {
        setStatus({ state: "idle", text: `Synced ${ago(last)}` });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [sync]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => void sync()}
        disabled={status.state === "syncing"}
        className={btnSmall}
      >
        {status.state === "syncing" ? "Syncing…" : "↻ Garmin"}
      </button>
      {status.state !== "syncing" && status.text && (
        <span
          className={`truncate text-[11px] ${
            status.state === "error" ? "text-red-400" : "text-neutral-500"
          }`}
          title={status.text}
        >
          {status.text}
        </span>
      )}
    </div>
  );
}
