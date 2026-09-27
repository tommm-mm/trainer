// intervals.icu REST client (server-only). intervals.icu pulls activities
// from Garmin Connect on its side; we read them from here.
// Auth: HTTP Basic with username "API_KEY" and the personal API key.

import type { TablesInsert } from "@/lib/database.types";
import { paceFromRun } from "@/lib/format";

const BASE_URL = "https://intervals.icu/api/v1";
// Not a secret (it's in the intervals.icu profile URL); env var overrides it.
const DEFAULT_ATHLETE_ID = "i726906";

/** The subset of an intervals.icu activity we use. Every field may be missing. */
export type IntervalsActivity = {
  id?: string | number;
  start_date_local?: string;
  type?: string;
  name?: string;
  distance?: number | null; // metres
  moving_time?: number | null; // seconds
  elapsed_time?: number | null; // seconds
  total_elevation_gain?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
};

export type SyncedActivity = Omit<TablesInsert<"activities">, "user_id">;

const RUN_TYPES = /^(run|trailrun|virtualrun|treadmill.*|track.*)$/i;
const GYM_TYPES = /^(weighttraining|workout|crossfit|hiit)$/i;

export function mapActivity(raw: IntervalsActivity): SyncedActivity | null {
  const type = raw.type ?? "";
  const kind = RUN_TYPES.test(type) ? "run" : GYM_TYPES.test(type) ? "gym" : null;
  if (!kind || raw.id === undefined || !raw.start_date_local) return null;

  const seconds = raw.moving_time || raw.elapsed_time || null;
  const durationMin = seconds ? round(seconds / 60, 1) : null;
  const distanceKm = kind === "run" && raw.distance ? round(raw.distance / 1000, 2) : null;

  return {
    external_id: String(raw.id),
    source: "garmin",
    type: kind,
    name: raw.name ?? null,
    date: raw.start_date_local.slice(0, 10),
    distance_km: distanceKm,
    duration_min: durationMin,
    avg_pace: kind === "run" ? paceFromRun(distanceKm, durationMin) : null,
    avg_hr: clampInt(raw.average_heartrate, 30, 250),
    max_hr: clampInt(raw.max_heartrate, 30, 250),
    elevation_m: raw.total_elevation_gain != null ? Math.round(raw.total_elevation_gain) : null,
    // RPE is deliberately not synced: it comes from the feedback card and a
    // re-sync must never overwrite what the user entered.
  };
}

export async function fetchActivities(oldest: string, newest: string) {
  const key = process.env.INTERVALS_ICU_API_KEY;
  if (!key) throw new Error("INTERVALS_ICU_API_KEY is not set.");
  const athlete = process.env.INTERVALS_ICU_ATHLETE_ID || DEFAULT_ATHLETE_ID;

  const url = `${BASE_URL}/athlete/${athlete}/activities?oldest=${oldest}&newest=${newest}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`API_KEY:${key}`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`intervals.icu responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as IntervalsActivity[];
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function clampInt(n: number | null | undefined, min: number, max: number) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}
