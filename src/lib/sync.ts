// Garmin (via intervals.icu) → Supabase sync. Pure plumbing:
// - upserts activities (idempotent on user_id + external_id)
// - ticks same-day approved/edited plan rows of the matching kind as completed
// - confirms same-day manual gym logs with the Garmin strength activity
// It never approves, creates or edits plans: that stays a user action.

import type { DB } from "@/lib/queries";
import { addDays, todayISO } from "@/lib/dates";
import { sessionKind } from "@/lib/sessions";
import { fetchActivities, mapActivity } from "@/lib/intervals";

const FIRST_SYNC_DAYS = 30;
const OVERLAP_DAYS = 3;

export type SyncResult = {
  from: string;
  to: string;
  fetched: number;
  imported: number;
  updated: number;
  completedPlans: number;
};

export async function syncGarmin(supabase: DB, userId: string): Promise<SyncResult> {
  const to = todayISO();

  const { data: last, error: lastErr } = await supabase
    .from("activities")
    .select("date")
    .eq("source", "garmin")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw lastErr;
  const from = last ? addDays(last.date, -OVERLAP_DAYS) : addDays(to, -FIRST_SYNC_DAYS);

  const raw = await fetchActivities(from, to);
  const rows = raw.map(mapActivity).filter((r) => r !== null);

  const result: SyncResult = {
    from,
    to,
    fetched: raw.length,
    imported: 0,
    updated: 0,
    completedPlans: 0,
  };
  if (rows.length === 0) return result;

  const { data: existing, error: exErr } = await supabase
    .from("activities")
    .select("external_id")
    .in("external_id", rows.map((r) => r.external_id!));
  if (exErr) throw exErr;
  const known = new Set((existing ?? []).map((e) => e.external_id));
  result.updated = rows.filter((r) => known.has(r.external_id!)).length;
  result.imported = rows.length - result.updated;

  const { error: upErr } = await supabase
    .from("activities")
    .upsert(
      rows.map((r) => ({ ...r, user_id: userId })),
      { onConflict: "user_id,external_id" },
    );
  if (upErr) throw upErr;

  // Auto-tick planned sessions done on the same day with the same kind.
  const { data: plans, error: planErr } = await supabase
    .from("weekly_plans")
    .select("id, day, session_type")
    .gte("day", from)
    .lte("day", to)
    .in("status", ["approved", "edited"])
    .order("created_at");
  if (planErr) throw planErr;

  const toComplete = new Set<string>();
  for (const act of rows) {
    const match = (plans ?? []).find(
      (p) =>
        !toComplete.has(p.id) &&
        p.day === act.date &&
        sessionKind(p.session_type) === act.type,
    );
    if (match) toComplete.add(match.id);
  }
  if (toComplete.size > 0) {
    const { error } = await supabase
      .from("weekly_plans")
      .update({ status: "completed" })
      .in("id", [...toComplete]);
    if (error) throw error;
    result.completedPlans = toComplete.size;
  }

  // Passive confirmation of manual gym logs.
  const gymDates = [...new Set(rows.filter((r) => r.type === "gym").map((r) => r.date))];
  if (gymDates.length > 0) {
    const { error } = await supabase
      .from("gym_sessions")
      .update({ garmin_confirmed: true })
      .in("date", gymDates)
      .eq("garmin_confirmed", false);
    if (error) throw error;
  }

  return result;
}
