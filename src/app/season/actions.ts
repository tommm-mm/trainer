"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveGoal, type DB } from "@/lib/queries";
import { isISODate, mondayOf, todayISO } from "@/lib/dates";
import type { Json } from "@/lib/database.types";
import type { RaceParams, RacePriority, TuneUpRace } from "@/lib/domain";
import { FormError, num, requiredText, text, toErrorState, type ActionState } from "@/lib/form";
import { flattenWeeks, validateSeasonDraft, type SeasonDraft } from "@/lib/season/model";
import { loadSeasons } from "@/lib/season/queries";
import { starterDraftFor } from "@/lib/season/drafts";

// Approve, reject and edit only ever happen here, on a tap. Coaches (Claude
// Code today, the Claude API and Cowork later) can only add a proposal.

function done(): ActionState {
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

async function activeGoalOrThrow(supabase: DB) {
  const goal = await getActiveGoal(supabase);
  if (!goal) throw new FormError("Start a goal first.");
  return goal;
}

/**
 * Validate a draft and store it as the next proposed version. Errors block
 * it; guardrail warnings travel with it and are shown on the proposal.
 */
async function propose(supabase: DB, goalId: string, draft: SeasonDraft) {
  const goal = await activeGoalOrThrow(supabase);
  const { approved } = await loadSeasons(supabase, goalId);
  const { errors } = validateSeasonDraft(draft, {
    approved: approved ? flattenWeeks(approved.blocks) : undefined,
    today: todayISO(),
    goalDate: goal.target_date,
  });
  if (errors.length) throw new FormError(errors.slice(0, 3).join(" "));
  const { error } = await supabase.rpc("create_season_proposal", {
    p_goal_id: goalId,
    p_draft: draft as unknown as Json,
  });
  if (error) throw error;
}

/** Loads the starter season written for the active goal, as a proposal. */
export async function proposeStarterSeason(): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const goal = await activeGoalOrThrow(supabase);
    const draft = starterDraftFor(goal);
    if (!draft) throw new FormError("There's no starter season for this goal yet.");
    await propose(supabase, goal.id, draft);
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}

export async function approveSeason(id: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("approve_season", { p_season_id: id });
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}

export async function rejectSeason(id: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("seasons")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "proposed");
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}

/** Your own edit of one week's targets. Past weeks stay as they were. */
export async function updateSeasonWeek(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = requiredText(form, "id", "Week");
    const weekStart = requiredText(form, "week_start", "Week");
    if (weekStart < mondayOf(todayISO())) throw new FormError("Past weeks can't be changed.");
    const runKm = num(form, "run_km", "Run km", { min: 0, max: 300 });
    const longRun = num(form, "long_run_km", "Long run", { min: 0, max: 100 });
    if (runKm !== null && longRun !== null && longRun > runKm) {
      throw new FormError("The long run can't be longer than the whole week.");
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("season_weeks")
      .update({
        run_km: runKm,
        long_run_km: longRun,
        runs: num(form, "runs", "Runs", { min: 0, max: 14, int: true }),
        gym_sessions: num(form, "gym_sessions", "Gym", { min: 0, max: 14, int: true }),
        cross_sessions: num(form, "cross_sessions", "Bike / swim", { min: 0, max: 14, int: true }),
        load_target: num(form, "load_target", "Load target", { min: 0, max: 20000, int: true }),
        is_deload: form.get("is_deload") === "on",
        key_session: text(form, "key_session"),
        notes: text(form, "notes"),
      })
      .eq("id", id);
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}

// ---------------------------------------------------------------- threshold

/**
 * Threshold HR from a test (Efforts card). Re-centres the zones; time in
 * zones re-bins on the next page load. Blank HR = back to the default bands.
 */
export async function setThresholdHr(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const hr = num(form, "threshold_hr", "Threshold HR", { min: 100, max: 230, int: true });
    const date = text(form, "threshold_date");
    if (date && (!isISODate(date) || date > todayISO())) throw new FormError("The test date must be a past day.");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new FormError("Sign in first.");
    const { data: current } = await supabase.from("athlete_settings").select("rest_hr, max_hr").maybeSingle();
    if (hr !== null && current && (hr <= current.rest_hr || hr >= current.max_hr)) {
      throw new FormError(`Threshold must be between rest (${current.rest_hr}) and max (${current.max_hr}).`);
    }
    // Upsert keeps the synced anchors; a first save before any sync uses the defaults.
    const { error } = await supabase.from("athlete_settings").upsert(
      {
        user_id: user.id,
        threshold_hr: hr,
        threshold_date: hr === null ? null : date,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}

// ---------------------------------------------------------------- races

const PRIORITIES: RacePriority[] = ["A", "B", "C"];

async function saveRaces(supabase: DB, update: (races: TuneUpRace[]) => TuneUpRace[]) {
  const goal = await activeGoalOrThrow(supabase);
  const params = (goal.params ?? {}) as RaceParams;
  const races = update([...(params.tune_up_races ?? [])]).sort((a, b) => a.date.localeCompare(b.date));
  const { error } = await supabase
    .from("goals")
    .update({
      params: { ...params, tune_up_races: races } as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goal.id);
  if (error) throw error;
}

export async function addRace(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const name = requiredText(form, "name", "Race name");
    const date = requiredText(form, "date", "Date");
    if (!isISODate(date)) throw new FormError("Pick a valid date.");
    if (date < todayISO()) throw new FormError("Pick a date from today on.");
    const priority = text(form, "priority") ?? "C";
    if (!PRIORITIES.includes(priority as RacePriority) || priority === "A") {
      throw new FormError("Priority must be B or C (A is the goal race).");
    }
    const distance = num(form, "distance_km", "Distance", { min: 0.1, max: 500 });
    const supabase = await createClient();
    await saveRaces(supabase, (races) => [
      ...races,
      {
        name,
        date,
        priority: priority as RacePriority,
        ...(distance !== null ? { distance_km: distance } : {}),
      },
    ]);
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}

export async function removeRace(name: string, date: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    await saveRaces(supabase, (races) => races.filter((r) => !(r.name === name && r.date === date)));
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}
