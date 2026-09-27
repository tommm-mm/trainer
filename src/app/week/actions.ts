"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveGoal } from "@/lib/queries";
import { isISODate, mondayOf } from "@/lib/dates";
import {
  FormError,
  num,
  requiredText,
  text,
  toErrorState,
  type ActionState,
} from "@/lib/form";

// Every status change here is an explicit user action: this is where a
// "proposed" AI plan becomes approved/edited. Nothing else sets these.

async function setPlanStatus(id: string, status: "approved" | "completed") {
  const supabase = await createClient();
  const { error } = await supabase
    .from("weekly_plans")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function approvePlan(id: string) {
  await setPlanStatus(id, "approved");
}

export async function completePlan(id: string) {
  await setPlanStatus(id, "completed");
}

export async function approveWeek(weekStart: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("weekly_plans")
    .update({ status: "approved" })
    .eq("week_start_date", weekStart)
    .eq("status", "proposed");
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function deletePlan(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("weekly_plans").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}

function planFields(form: FormData) {
  return {
    session_type: requiredText(form, "session_type", "Session type"),
    target_distance_km: num(form, "target_distance_km", "Distance", {
      min: 0,
      max: 200,
    }),
    target_sets: num(form, "target_sets", "Sets", { min: 0, max: 100, int: true }),
    notes: text(form, "notes"),
  };
}

export async function updatePlan(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = requiredText(form, "id", "Session");
    const fields = planFields(form);
    // A completed session stays completed; anything else becomes "edited".
    const status = form.get("status") === "completed" ? "completed" : "edited";

    const supabase = await createClient();
    const { error } = await supabase
      .from("weekly_plans")
      .update({ ...fields, status })
      .eq("id", id);
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

export async function addPlan(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const day = requiredText(form, "day", "Day");
    if (!isISODate(day)) throw new FormError("Invalid day.");
    const fields = planFields(form);

    const supabase = await createClient();
    const goal = await getActiveGoal(supabase);
    const { error } = await supabase.from("weekly_plans").insert({
      ...fields,
      day,
      week_start_date: mondayOf(day),
      goal_id: goal?.id ?? null,
      // Written by the user, so it's already approved.
      status: "approved",
    });
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

export async function resolveFlag(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("flags")
    .update({ resolved: true })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}
