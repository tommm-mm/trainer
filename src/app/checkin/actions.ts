"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isISODate } from "@/lib/dates";
import {
  FormError,
  num,
  requiredText,
  text,
  toErrorState,
  type ActionState,
} from "@/lib/form";

// One check-in (and at most one body_metrics row) per date, enforced here:
// saving a date that already has one updates it instead of adding a second.

export async function saveCheckin(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const date = requiredText(form, "date", "Date");
    if (!isISODate(date)) throw new FormError("Invalid date.");

    const checkin = {
      feeling_text: text(form, "feeling_text"),
      feeling_score: num(form, "feeling_score", "Feeling", { min: 1, max: 10, int: true }),
      sleep_hours: num(form, "sleep_hours", "Sleep", { min: 0, max: 24 }),
      soreness: num(form, "soreness", "Soreness", { min: 1, max: 10, int: true }),
      stress: num(form, "stress", "Stress", { min: 1, max: 10, int: true }),
      notes: text(form, "notes"),
    };
    const body = {
      weight_kg: num(form, "weight_kg", "Weight", { min: 30, max: 250 }),
      body_fat_pct: num(form, "body_fat_pct", "Body fat", { min: 2, max: 70 }),
    };
    const hasCheckin = Object.values(checkin).some((v) => v !== null);
    const hasBody = Object.values(body).some((v) => v !== null);
    if (!hasCheckin && !hasBody) {
      throw new FormError("Fill in at least one field.");
    }

    const supabase = await createClient();
    const [existingCheckin, existingBody] = await Promise.all([
      supabase.from("checkins").select("id").eq("date", date).limit(1).maybeSingle(),
      supabase.from("body_metrics").select("id").eq("date", date).limit(1).maybeSingle(),
    ]);
    if (existingCheckin.error) throw existingCheckin.error;
    if (existingBody.error) throw existingBody.error;

    if (hasCheckin) {
      const { error } = existingCheckin.data
        ? await supabase.from("checkins").update(checkin).eq("id", existingCheckin.data.id)
        : await supabase.from("checkins").insert({ ...checkin, date });
      if (error) throw error;
    } else if (existingCheckin.data) {
      const { error } = await supabase.from("checkins").delete().eq("id", existingCheckin.data.id);
      if (error) throw error;
    }

    // Clearing weight/body fat on an edit removes that day's measurement.
    if (hasBody) {
      const { error } = existingBody.data
        ? await supabase.from("body_metrics").update(body).eq("id", existingBody.data.id)
        : await supabase.from("body_metrics").insert({ ...body, date });
      if (error) throw error;
    } else if (existingBody.data) {
      const { error } = await supabase.from("body_metrics").delete().eq("id", existingBody.data.id);
      if (error) throw error;
    }
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

/** Deletes everything logged for that date (check-in + body measurement). */
export async function deleteCheckinDay(date: string) {
  if (!isISODate(date)) throw new Error("Invalid date.");
  const supabase = await createClient();
  const [a, b] = await Promise.all([
    supabase.from("checkins").delete().eq("date", date),
    supabase.from("body_metrics").delete().eq("date", date),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  revalidatePath("/", "layout");
}
