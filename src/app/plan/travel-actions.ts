"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, isISODate } from "@/lib/dates";
import { FormError, requiredText, text, toErrorState, type ActionState } from "@/lib/form";

const KINDS = ["off", "transit", "no_gym", "limited"];

/** A trip you add yourself counts right away (approved). */
export async function addTrip(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const start = requiredText(form, "start_date", "From");
    const end = text(form, "end_date") ?? start;
    const kind = requiredText(form, "kind", "Type");
    if (!isISODate(start) || !isISODate(end)) throw new FormError("Invalid date.");
    if (end < start) throw new FormError("“To” is before “From”.");
    if (daysBetween(start, end) > 60) throw new FormError("Up to 60 days per trip.");
    if (!KINDS.includes(kind)) throw new FormError("Pick a type.");
    const note = text(form, "note");
    if (note && note.length > 200) throw new FormError("Note: up to 200 characters.");
    const supabase = await createClient();
    const { error } = await supabase
      .from("travel_days")
      .insert({ start_date: start, end_date: end, kind, note, status: "approved", source: "manual" });
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

/** Approve a trip your PT proposed. */
export async function approveTrip(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("travel_days").update({ status: "approved" }).eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}

/** Remove a trip (or reject a proposed one). */
export async function deleteTrip(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("travel_days").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}
