// App-level vocabulary for values the DB stores as plain text + CHECK
// constraints. Keep these lists in sync with the constraints in Supabase.

export const GOAL_TYPES = [
  "race",
  "strength",
  "body_composition",
  "general_fitness",
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  race: "Race",
  strength: "Strength",
  body_composition: "Body composition",
  general_fitness: "General fitness",
};

export const GOAL_STATUSES = [
  "active",
  "completed",
  "paused",
  "abandoned",
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const PHASES = ["base", "build", "peak", "taper"] as const;
export type Phase = (typeof PHASES)[number];

export const PLAN_STATUSES = [
  "proposed",
  "approved",
  "edited",
  "completed",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export function isOneOf<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

// ---- goal params (goals.params jsonb), one shape per goal_type ----

export type TuneUpRace = { name: string; date: string };

export type RaceParams = {
  race_name?: string;
  target_time_seconds?: number;
  distance_km?: number;
  tune_up_races?: TuneUpRace[];
};

export type StrengthParams = {
  focus_lifts?: string[];
  target_weight_kg?: number;
  target_reps?: number;
  description?: string;
};

export type BodyCompositionParams = {
  target_weight_kg?: number;
  target_body_fat_pct?: number;
  direction?: "gain" | "lose" | "recomp";
};

export type GeneralFitnessParams = {
  description?: string;
};

/** The active goal from the brief, inserted from the Goal screen on first use. */
export const PADOVA_SEED = {
  goal_type: "race",
  title: "Padova Marathon",
  target_date: "2027-04-18",
  status: "active",
  phase: "base",
  params: {
    race_name: "Padova Marathon",
    target_time_seconds: 12600,
    distance_km: 42.2,
    tune_up_races: [{ name: "Bologna 30km", date: "2027-03-07" }],
  },
} as const;
