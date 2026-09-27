/** Pace in "m:ss" per km, or null if inputs are missing. */
export function paceFromRun(
  distanceKm: number | null | undefined,
  durationMin: number | null | undefined,
): string | null {
  if (!distanceKm || !durationMin || distanceKm <= 0 || durationMin <= 0) {
    return null;
  }
  return formatPace((durationMin * 60) / distanceKm);
}

/** Seconds per km → "m:ss". */
export function formatPace(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 12600 → "3:30:00" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Race target → seconds. Accepts "h:mm:ss" or "h:mm" ("3:30" = 3h30). */
export function parseRaceTime(value: string): number | null {
  const parts = value.trim().split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

/** Trims trailing zeros: 10.50 → "10.5", 12 → "12". */
export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "–";
  return Number(value.toFixed(digits)).toString();
}
