"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Keeps every screen live: when a watched table changes (Garmin sync lands,
// a workout is finished or linked, a plan is proposed or approved, a check-in
// is saved) the server components re-render with fresh data. Also refreshes
// when you come back to the app after a while. Realtime applies RLS, so only
// your own rows trigger it.

const TABLES = ["activities", "weekly_plans", "exercise_targets", "checkins"] as const;
const DEBOUNCE_MS = 600;
const STALE_AFTER_MS = 60_000;

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const channel = supabase.channel("live-refresh");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    // Workouts are upserted after every logged set; only finished ones matter here.
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "workouts", filter: "status=eq.completed" },
      refresh,
    );
    channel.subscribe();

    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
