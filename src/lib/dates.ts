// Date helpers working on plain "YYYY-MM-DD" strings (Postgres `date`).
// All math happens in UTC on midnight timestamps, so there are no DST or
// server-timezone surprises. "Today" is resolved in Europe/Rome because the
// server (Vercel) runs in UTC.

const TIME_ZONE = "Europe/Rome";
const DAY_MS = 86_400_000;

export function todayISO(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isISODate(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(toUTC(value));
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * DAY_MS);
}

/** Monday of the ISO week containing `iso`. */
export function mondayOf(iso: string): string {
  const weekday = new Date(toUTC(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((weekday + 6) % 7));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

/** "Mon 29 Sep" */
export function formatDay(iso: string): string {
  return new Date(toUTC(iso)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "18 Apr 2027" */
export function formatLongDate(iso: string): string {
  return new Date(toUTC(iso)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "29 Sep – 5 Oct" */
export function formatWeekRange(monday: string): string {
  const fmt = (iso: string) =>
    new Date(toUTC(iso)).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${fmt(monday)} – ${fmt(addDays(monday, 6))}`;
}
