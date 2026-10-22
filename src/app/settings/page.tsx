import Link from "next/link";
import { signOut } from "../actions";
import { PageShell } from "@/components/bottom-nav";
import { cardCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { PushManager } from "./push-manager";
import { PrefsForm } from "./prefs-form";
import { VAPID_PUBLIC_KEY } from "@/lib/push/keys";
import { healthRows, worst, type Level } from "@/lib/health";

const DOT: Record<Level, string> = {
  ok: "bg-emerald-500",
  info: "bg-neutral-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

type PushHealth = { tick_at: string | null; tick_status: string | null; http_status: number | null; cron_active: boolean | null };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [prefsRes, subsRes, syncRes, tickRes] = await Promise.all([
    supabase.from("notification_settings").select("proposals, checkin, checkin_time, timezone, last_push_at").maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("athlete_settings").select("last_sync_at, last_sync_error").maybeSingle(),
    supabase.rpc("push_health"),
  ]);
  const prefs = prefsRes.data ?? { proposals: true, checkin: true, checkin_time: "16:00", timezone: "Europe/Amsterdam" };
  const tick = (tickRes.data ?? {}) as Partial<PushHealth>;
  const rows = healthRows(
    {
      lastSyncAt: syncRes.data?.last_sync_at ?? null,
      lastSyncError: syncRes.data?.last_sync_error ?? null,
      tickAt: tick.tick_at ?? null,
      tickStatus: tick.tick_status ?? null,
      httpStatus: tick.http_status ?? null,
      cronActive: tick.cron_active ?? null,
      lastPushAt: prefsRes.data?.last_push_at ?? null,
    },
    new Date(),
  );
  const overall = worst(rows);

  return (
    <PageShell active="/settings">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xs text-neutral-500">
          ← Today
        </Link>
        <form action={signOut}>
          <button className="text-xs text-neutral-500 hover:text-neutral-300">Sign out</button>
        </form>
      </div>
      <h1 className="mb-4 mt-2 text-xl font-semibold tracking-tight">Settings</h1>

      <section className={`${cardCls} mb-4`}>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <span className={`h-2 w-2 rounded-full ${DOT[overall]}`} />
          Health
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-neutral-300">
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT[r.level]}`} />
                  {r.label}
                </span>
                <span className="text-neutral-400">{r.value}</span>
              </div>
              {r.detail && <p className="ml-3.5 text-[11px] text-neutral-500">{r.detail}</p>}
            </li>
          ))}
        </ul>
        {tickRes.error && <p className="mt-2 text-[11px] text-neutral-500">Notification check unavailable: {tickRes.error.message}</p>}
      </section>

      <section className={`${cardCls} mb-4`}>
        <h2 className="mb-2 text-sm font-semibold">App &amp; notifications</h2>
        <PushManager vapidKey={VAPID_PUBLIC_KEY} />
        <p className="mt-2 text-[11px] text-neutral-500">
          {subsRes.count ?? 0} device{subsRes.count === 1 ? "" : "s"} with notifications on.
        </p>
      </section>

      <section className={cardCls}>
        <h2 className="mb-2 text-sm font-semibold">What to notify</h2>
        <PrefsForm prefs={prefs} />
      </section>
    </PageShell>
  );
}
