// The health line (Settings): is the plumbing alive? Pure: timestamps in,
// one row per pipe out. Thresholds:
//   Garmin sync   amber after 24 h without one, or when the last attempt failed;
//                 red after 72 h (the Week View syncs on open, at most every 10 min)
//   tick          red when pg_cron's push-tick is off, failed, or silent > 15 min
//                 (it runs every 5); amber when the app didn't answer 200
//   notification  information only: when the last one reached a phone

export type Level = "ok" | "amber" | "red" | "info";

export type HealthInput = {
  lastSyncAt: string | null;
  lastSyncError: string | null;
  tickAt: string | null;
  tickStatus: string | null;
  httpStatus: number | null;
  cronActive: boolean | null;
  lastPushAt: string | null;
};

export type HealthRow = { key: "sync" | "tick" | "push"; label: string; value: string; level: Level; detail?: string };

const MIN = 60_000;
const HOUR = 60 * MIN;

export const SYNC_AMBER_H = 24;
export const SYNC_RED_H = 72;
export const TICK_RED_MIN = 15;

export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 2 * MIN) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < 48 * HOUR) return `${Math.floor(ms / HOUR)} h ago`;
  return `${Math.floor(ms / (24 * HOUR))} days ago`;
}

function age(iso: string, now: Date): number {
  return now.getTime() - new Date(iso).getTime();
}

export function syncRow(i: Pick<HealthInput, "lastSyncAt" | "lastSyncError">, now: Date): HealthRow {
  const base = { key: "sync" as const, label: "Garmin sync" };
  if (!i.lastSyncAt) {
    return { ...base, value: "no sync recorded yet", level: i.lastSyncError ? "red" : "amber", detail: i.lastSyncError ?? undefined };
  }
  const value = ago(i.lastSyncAt, now);
  const a = age(i.lastSyncAt, now);
  if (a > SYNC_RED_H * HOUR) return { ...base, value, level: "red", detail: i.lastSyncError ?? "No sync for 3 days: open intervals.icu and check the Garmin link." };
  if (a > SYNC_AMBER_H * HOUR) return { ...base, value, level: "amber", detail: i.lastSyncError ?? "No sync for over 24 h." };
  if (i.lastSyncError) return { ...base, value, level: "amber", detail: `Last attempt failed: ${i.lastSyncError}` };
  return { ...base, value, level: "ok" };
}

export function tickRow(i: Pick<HealthInput, "tickAt" | "tickStatus" | "httpStatus" | "cronActive">, now: Date): HealthRow {
  const base = { key: "tick" as const, label: "Notification check" };
  if (i.cronActive === false) return { ...base, value: "switched off", level: "red", detail: "The push-tick job in Supabase is inactive." };
  if (!i.tickAt) return { ...base, value: "never ran", level: "red" };
  const value = ago(i.tickAt, now);
  if (age(i.tickAt, now) > TICK_RED_MIN * MIN) return { ...base, value, level: "red", detail: "It runs every 5 minutes: Supabase cron looks stuck." };
  if (i.tickStatus && i.tickStatus !== "succeeded") return { ...base, value, level: "red", detail: `Last run: ${i.tickStatus}.` };
  if (i.httpStatus !== null && i.httpStatus !== 200) return { ...base, value, level: "amber", detail: `The app answered ${i.httpStatus}.` };
  return { ...base, value, level: "ok" };
}

export function pushRow(i: Pick<HealthInput, "lastPushAt">, now: Date): HealthRow {
  return { key: "push", label: "Last notification", value: i.lastPushAt ? ago(i.lastPushAt, now) : "none yet", level: "info" };
}

export function healthRows(i: HealthInput, now: Date): HealthRow[] {
  return [syncRow(i, now), tickRow(i, now), pushRow(i, now)];
}

const RANK: Record<Level, number> = { info: 0, ok: 0, amber: 1, red: 2 };

/** The worst level across rows (info counts as ok). */
export function worst(rows: HealthRow[]): Level {
  return rows.reduce<Level>((w, r) => (RANK[r.level] > RANK[w] ? r.level : w), "ok");
}
