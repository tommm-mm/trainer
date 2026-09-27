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
import type { TablesInsert } from "@/lib/database.types";

export async function logWorkout(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let date: string;
  try {
    date = requiredText(form, "date", "Date");
    if (!isISODate(date)) throw new FormError("Invalid date.");
    const mode = form.get("mode") === "gym" ? "gym" : "run";
    const planId = text(form, "plan_id");
    const markDone = form.get("mark_completed") === "on";

    const supabase = await createClient();

    if (mode === "run") {
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
    } else {
      const rows = parseGymRows(form, date);
      if (rows.length === 0) throw new FormError("Add at least one exercise.");

      // Passive confirmation: a same-day Garmin strength activity exists.
      const { count } = await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("date", date)
        .eq("type", "gym")
        .eq("source", "garmin");
      const confirmed = (count ?? 0) > 0;

      const { error } = await supabase
        .from("gym_sessions")
        .insert(rows.map((r) => ({ ...r, garmin_confirmed: confirmed })));
      if (error) throw error;
    }

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

function parseGymRows(form: FormData, date: string): TablesInsert<"gym_sessions">[] {
  const col = (key: string) => form.getAll(key).map((v) => String(v).trim());
  const exercises = col("exercise");
  const sets = col("sets");
  const reps = col("reps");
  const weight = col("weight_kg");
  const rpe = col("gym_rpe");

  const rows: TablesInsert<"gym_sessions">[] = [];
  exercises.forEach((exercise, i) => {
    if (!exercise) return;
    // Reuse num() validation by wrapping each cell in a tiny FormData.
    const cell = new FormData();
    cell.set("sets", sets[i] ?? "");
    cell.set("reps", reps[i] ?? "");
    cell.set("weight_kg", weight[i] ?? "");
    cell.set("rpe", rpe[i] ?? "");
    const label = `${exercise}:`;
    rows.push({
      date,
      exercise,
      sets: num(cell, "sets", `${label} sets`, { min: 0, max: 100, int: true }),
      reps: num(cell, "reps", `${label} reps`, { min: 0, max: 1000, int: true }),
      weight_kg: num(cell, "weight_kg", `${label} weight`, { min: 0, max: 1000 }),
      rpe: num(cell, "rpe", `${label} RPE`, { min: 1, max: 10, int: true }),
    });
  });
  return rows;
}

export async function deleteActivity(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function deleteGymSession(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("gym_sessions").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/", "layout");
}
