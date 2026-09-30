import type { Tables } from "@/lib/database.types";
import type { SeasonDraft } from "../model";
import { PADOVA_2027 } from "./padova-2027";

/**
 * A ready-made season for a goal, offered on the Season page when the goal
 * has none yet. Later seasons come from the coach (Claude API, Cowork) as
 * proposals through the same contract.
 */
export function starterDraftFor(goal: Pick<Tables<"goals">, "goal_type" | "target_date">): SeasonDraft | null {
  if (goal.goal_type === "race" && goal.target_date === "2027-04-18") return PADOVA_2027;
  return null;
}
