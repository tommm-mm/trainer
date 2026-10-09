"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FormError, text, toErrorState, type ActionState } from "@/lib/form";
import { TEST_MESSAGE } from "@/lib/push/messages";
import { sendAll } from "@/lib/push/send";

// Push subscriptions and notification preferences (RLS: your rows only).

export type SubscriptionJSON = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function saveSubscription(sub: SubscriptionJSON, userAgent: string | null): Promise<ActionState> {
  try {
    if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
      throw new FormError("Invalid subscription.");
    }
    const supabase = await createClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent?.slice(0, 200) ?? null },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/settings");
  return { error: null, ok: true };
}

export async function removeSubscription(endpoint: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/settings");
  return { error: null, ok: true };
}

/** Sends the test notification to every phone you enabled. */
export async function sendTest(): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
    if (error) throw error;
    if (!data?.length) throw new FormError("No phone has notifications on yet.");
    const r = await sendAll(data, [TEST_MESSAGE]);
    if (r.gone.length) await supabase.from("push_subscriptions").delete().in("endpoint", r.gone);
    if (!r.ok.length) throw new FormError("The push service refused it: enable notifications again on this phone.");
  } catch (err) {
    return toErrorState(err);
  }
  return { error: null, ok: true };
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveNotificationSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const time = text(form, "checkin_time") ?? "16:00";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new FormError("Time must be HH:MM.");
    const timezone = text(form, "timezone") ?? "Europe/Amsterdam";
    if (!validTimezone(timezone)) throw new FormError("Unknown timezone.");
    const supabase = await createClient();
    const { error } = await supabase.from("notification_settings").upsert({
      proposals: form.get("proposals") === "on",
      checkin: form.get("checkin") === "on",
      checkin_time: time,
      timezone,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/settings");
  return { error: null, ok: true };
}
