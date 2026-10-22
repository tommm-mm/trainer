// Stats data for the last 12 weeks: Progress reads this.
import { createClient } from "@/lib/supabase/server";
import { addDays, daysBetween } from "@/lib/dates";
import { fetchHrSettings } from "@/lib/intervals";
import { loadStrength } from "@/lib/gym/queries";
import { WEEKS, buildStats, statsFrom } from "./model";

export async function loadStats(today: string) {
  const supabase = await createClient();
  const [actsRes, firstRes, bodyRes, hr, strength, wellRes] = await Promise.all([
    supabase
      .from("activities")
      .select("date, type, distance_km, duration_min, avg_hr, max_hr, rpe")
      .gte("date", statsFrom(today))
      .lte("date", today)
      .order("date"),
    supabase.from("activities").select("date").order("date").limit(1).maybeSingle(),
    supabase
      .from("body_metrics")
      .select("date, weight_kg, body_fat_pct")
      .gte("date", addDays(today, -180))
      .order("date"),
    fetchHrSettings(addDays(today, -30), today),
    loadStrength(supabase, { from: statsFrom(today), to: today }).catch(() => null),
    supabase.from("wellness").select("date, hrv, resting_hr, sleep_s").gte("date", statsFrom(today)).lte("date", today).order("date"),
  ]);
  const loadError = actsRes.error ?? firstRes.error ?? bodyRes.error;
  const historyStart = firstRes.data?.date ?? null;

  const model = buildStats({
    today,
    activities: actsRes.data ?? [],
    historyStart,
    body: bodyRes.data ?? [],
    hr,
    gym: strength
      ? { sessions: strength.sessions, index: strength.index, target: Math.max(strength.activeTemplates, 1) }
      : undefined,
    wellness: (wellRes.data ?? []).map((w) => ({ ...w, hrv: w.hrv === null ? null : Number(w.hrv) })),
  });
  const shortHistory = !historyStart || daysBetween(historyStart, today) < WEEKS * 7;
  return { model, loadError, historyStart, shortHistory };
}
