import { formatDay } from "@/lib/dates";
import type { RecoveryStatus } from "@/lib/recovery";

/** Last night and the 7-day trend vs your normal, from Garmin (Week View). */
export function RecoveryCard({ status, today }: { status: RecoveryStatus; today: string }) {
  const { last, hrv, rhr, signals } = status;
  if (!last) return null;
  const warn = signals.length > 0;
  const sleepH = last.sleep_s != null ? Math.round((last.sleep_s / 3600) * 10) / 10 : null;
  const parts = [
    last.hrv != null ? `HRV ${last.hrv} ms` : null,
    last.resting_hr != null ? `resting HR ${last.resting_hr}` : null,
    sleepH != null ? `sleep ${sleepH} h` : null,
    last.sleep_score != null ? `score ${last.sleep_score}` : null,
  ].filter(Boolean);
  return (
    <section
      className={`mb-4 rounded-xl border p-3 text-sm ${warn ? "border-amber-500/40 bg-amber-500/5" : "border-neutral-800"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className={`font-medium ${warn ? "text-amber-300" : "text-neutral-200"}`}>Recovery</p>
        <p className="text-[11px] text-neutral-500">Garmin · {last.date === today ? "last night" : formatDay(last.date)}</p>
      </div>
      <p className="text-xs text-neutral-300">{parts.join(" · ") || "No sleep / HRV data yet"}</p>
      {(hrv || rhr) && (
        <p className="text-[11px] text-neutral-500">
          7-day vs your normal:{" "}
          {[hrv && `HRV ${hrv.recent} vs ${hrv.base} ms`, rhr && `resting HR ${rhr.recent} vs ${rhr.base}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {signals.map((s) => (
        <p key={s.code} className="mt-1 text-xs text-amber-200">
          {s.message}
        </p>
      ))}
    </section>
  );
}
