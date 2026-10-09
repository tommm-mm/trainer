import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { cardCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { PushManager } from "./push-manager";
import { PrefsForm } from "./prefs-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [prefsRes, subsRes] = await Promise.all([
    supabase.from("notification_settings").select("proposals, checkin, checkin_time, timezone").maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
  ]);
  const prefs = prefsRes.data ?? { proposals: true, checkin: true, checkin_time: "16:00", timezone: "Europe/Amsterdam" };

  return (
    <PageShell active="/settings">
      <Link href="/" className="text-xs text-neutral-500">
        ← Week
      </Link>
      <h1 className="mb-4 mt-2 text-xl font-semibold tracking-tight">Settings</h1>

      <section className={`${cardCls} mb-4`}>
        <h2 className="mb-2 text-sm font-semibold">App &amp; notifications</h2>
        <PushManager vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
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
