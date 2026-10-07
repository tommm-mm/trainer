"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import { toErrorState, type ActionState } from "@/lib/form";
import type { Question } from "@/lib/gym/questions";

// Approving a coach proposal is the only way it changes anything: the DB
// applies it in one transaction (apply_coach_proposal).

function done(): ActionState {
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

export async function approveProposal(id: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("apply_coach_proposal", { p_id: id });
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}

export async function rejectProposal(id: string): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("coach_proposals")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "proposed");
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}

/** Your answer to one of the app's questions: Yes applies it now, No keeps it quiet for a while. */
export async function answerQuestion(q: Question, yes: boolean): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coach_proposals")
      .insert({
        kind: q.kind,
        payload: q.payload as Json,
        title: q.title,
        rationale: q.rationale,
        source: "engine",
        dedupe_key: q.key,
        status: yes ? "proposed" : "rejected",
        decided_at: yes ? null : new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    if (yes) {
      const { error: applyErr } = await supabase.rpc("apply_coach_proposal", { p_id: data.id });
      if (applyErr) throw applyErr;
    }
  } catch (err) {
    return toErrorState(err);
  }
  return done();
}
