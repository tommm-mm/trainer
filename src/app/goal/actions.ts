"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveGoal, type DB } from "@/lib/queries";
import { isISODate } from "@/lib/dates";
import { parseRaceTime } from "@/lib/format";
import {
  GOAL_STATUSES,
  GOAL_TYPES,
  PADOVA_SEED,
  isOneOf,
  type TuneUpRace,
} from "@/lib/domain";
import type { Json } from "@/lib/database.types";
import {
  FormError,
  num,
  requiredText,
  text,
  toErrorState,
  type ActionState,
} from "@/lib/form";

// One active goal at a time is an app-level invariant (the DB doesn't
// enforce it), so every path that can make a goal active checks first.
async function assertNoActiveGoal(supabase: DB) {
  if (await getActiveGoal(supabase)) {
    throw new FormError(
      "You already have an active goal. Complete, pause or abandon it first.",
    );
  }
}

export async function seedPadova(): Promise<ActionState> {
  try {
    const supabase = await createClient();
    await assertNoActiveGoal(supabase);
    const { error } = await supabase.from("goals").insert({
      ...PADOVA_SEED,
      params: PADOVA_SEED.params as unknown as Json,
    });
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

export async function setGoalStatus(id: string, status: string): Promise<ActionState> {
  try {
    if (!isOneOf(GOAL_STATUSES, status)) throw new FormError("Invalid status.");
    const supabase = await createClient();
    if (status === "active") await assertNoActiveGoal(supabase);
    const { error } = await supabase
      .from("goals")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

export async function createGoal(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const goalType = text(form, "goal_type");
    if (!isOneOf(GOAL_TYPES, goalType)) throw new FormError("Pick a goal type.");
    const title = requiredText(form, "title", "Title");
    const targetDate = text(form, "target_date");
    if (targetDate && !isISODate(targetDate)) throw new FormError("Invalid target date.");
    if (goalType === "race" && !targetDate) {
      throw new FormError("A race goal needs a race date.");
    }

    const params = buildParams(goalType, title, form);

    const supabase = await createClient();
    await assertNoActiveGoal(supabase);
    const { error } = await supabase.from("goals").insert({
      goal_type: goalType,
      title,
      target_date: targetDate,
      status: "active",
      phase: goalType === "race" ? "base" : null,
      params: params as Json,
    });
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

function buildParams(
  goalType: (typeof GOAL_TYPES)[number],
  title: string,
  form: FormData,
): Record<string, unknown> {
  const drop = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

  switch (goalType) {
    case "race": {
      const time = text(form, "target_time");
      const seconds = time ? parseRaceTime(time) : null;
      if (time && seconds === null) {
        throw new FormError("Target time must look like 3:30:00.");
      }
      return drop({
        race_name: text(form, "race_name") ?? title,
        target_time_seconds: seconds,
        distance_km: num(form, "distance_km", "Distance", { min: 0.1, max: 500 }),
        tune_up_races: parseTuneUps(text(form, "tune_up_races")),
      });
    }
    case "strength":
      return drop({
        focus_lifts: text(form, "focus_lifts")
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        target_weight_kg: num(form, "target_weight_kg", "Target weight", { min: 0, max: 1000 }),
        target_reps: num(form, "target_reps", "Target reps", { min: 1, max: 100, int: true }),
        description: text(form, "description"),
      });
    case "body_composition": {
      const direction = text(form, "direction");
      if (direction && !["gain", "lose", "recomp"].includes(direction)) {
        throw new FormError("Invalid direction.");
      }
      return drop({
        target_weight_kg: num(form, "target_weight_kg", "Target weight", { min: 20, max: 300 }),
        target_body_fat_pct: num(form, "target_body_fat_pct", "Target body fat", {
          min: 2,
          max: 60,
        }),
        direction,
      });
    }
    case "general_fitness":
      return drop({ description: text(form, "description") });
  }
}

/** One race per line: "Bologna 30km, 2027-03-07". */
function parseTuneUps(raw: string | null): TuneUpRace[] | null {
  if (!raw) return null;
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf(",");
      const name = line.slice(0, idx).trim();
      const date = line.slice(idx + 1).trim();
      if (idx < 0 || !name || !isISODate(date)) {
        throw new FormError(`Tune-up race "${line}" must be "Name, YYYY-MM-DD".`);
      }
      return { name, date };
    });
}
