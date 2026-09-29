"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISODate, mondayOf } from "@/lib/dates";
import { paceFromRun } from "@/lib/format";
import {
  FormError,
  num,
  requiredText,
  text,
  toErrorState,
  type ActionState,
} from "@/lib/form";

export async function logWorkout(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let date: string;
  try {
    date = requiredText(form, "date", "Date");
    if (!isISODate(date)) throw new FormError("Invalid date.");
    const planId = text(form, "plan_id");
    const markDone = form.get("mark_completed") === "on";

    const supabase = await createClient();

    const distance = num(form, "distance_km", "Distance", { min: 0.1, max: 200 });
    const duration = num(form, "duration_min", "Duration", { min: 1, max: 1440 });
    if (distance === null || duration === null) {
      throw new FormError("Distance and duration are required.");
    }
    const { error } = await supabase.from("activities").insert({
      date,
      type: "run",
      source: "manual",
      distance_km: distance,
      duration_min: duration,
      avg_pace: paceFromRun(distance, duration),
      avg_hr: num(form, "avg_hr", "Avg HR", { min: 30, max: 250, int: true }),
      max_hr: num(form, "max_hr", "Max HR", { min: 30, max: 250, int: true }),
      elevation_m: num(form, "elevation_m", "Elevation", { min: 0, max: 10000 }),
      rpe: num(form, "rpe", "RPE", { min: 1, max: 10, int: true }),
    });
    if (error) throw error;

    if (planId && markDone) {
      const { error } = await supabase
        .from("weekly_plans")
        .update({ status: "completed" })
        .eq("id", planId);
      if (error) throw error;
    }
  } catch (err) {
    return toErrorState(err);
  }

  revalidatePath("/", "layout");
  redirect(`/?week=${mondayOf(date)}`);
}

export async function deleteActivity(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}
