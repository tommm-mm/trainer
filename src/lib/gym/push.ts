// Pushes a local workout snapshot to Supabase. Every write is an upsert on a
// client-generated id or a delete by id, so the whole push is idempotent:
// if it fails halfway (signal drops), the next attempt simply repeats it.
// Order respects foreign keys: exercises → workout → slots → sets → deletes.

import type { DB } from "@/lib/queries";
import type { SyncRows } from "./workout";

export async function pushWorkout(supabase: DB, rows: SyncRows): Promise<void> {
  if (rows.newExercises.length > 0) {
    const { error } = await supabase.from("exercises").upsert(
      rows.newExercises.map((e) => ({
        id: e.id,
        name: e.name,
        primary_muscles: e.primary_muscles,
        secondary_muscles: e.secondary_muscles,
        equipment: e.equipment,
        mechanic: e.mechanic,
        measure: e.measure,
        is_main_lift: e.is_main_lift,
        weight_step_kg: e.weight_step_kg,
      })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  if (rows.workout.status === "discarded") {
    // Cascades to slots and sets. Deleting a row that never got synced is a no-op.
    const { error } = await supabase.from("workouts").delete().eq("id", rows.workout.id);
    if (error) throw error;
    return;
  }

  const w = await supabase.from("workouts").upsert(rows.workout, { onConflict: "id" });
  if (w.error) throw w.error;

  // Deletes before upserts: a removed slot must go before positions are rewritten.
  if (rows.deleted.sets.length > 0) {
    const { error } = await supabase.from("workout_sets").delete().in("id", rows.deleted.sets);
    if (error) throw error;
  }
  if (rows.deleted.exercises.length > 0) {
    const { error } = await supabase.from("workout_exercises").delete().in("id", rows.deleted.exercises);
    if (error) throw error;
  }

  if (rows.exercises.length > 0) {
    const { error } = await supabase.from("workout_exercises").upsert(rows.exercises, { onConflict: "id" });
    if (error) throw error;
  }
  if (rows.sets.length > 0) {
    const { error } = await supabase.from("workout_sets").upsert(rows.sets, { onConflict: "id" });
    if (error) throw error;
  }
}
