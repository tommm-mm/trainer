"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormError, num, requiredText, text, toErrorState, type ActionState } from "@/lib/form";

// Template editing. Changes apply to workouts started afterwards; logged
// workouts keep what you actually did.

function done(templateId?: string) {
  revalidatePath("/gym", "layout");
  if (templateId) revalidatePath(`/gym/templates/${templateId}`);
}

export async function createTemplate(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const name = requiredText(form, "name", "Name");
    const supabase = await createClient();
    const { data: last } = await supabase
      .from("workout_templates")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("workout_templates")
      .insert({ name, position: (last?.position ?? 0) + 1 })
      .select("id")
      .single();
    if (error) throw error;
    id = data.id;
  } catch (err) {
    return toErrorState(err);
  }
  done();
  redirect(`/gym/templates/${id}`);
}

export async function renameTemplate(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const name = requiredText(form, "name", "Name");
    const supabase = await createClient();
    const { error } = await supabase.from("workout_templates").update({ name }).eq("id", id);
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  done(id);
  return { error: null, ok: true };
}

export async function archiveTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workout_templates").update({ archived: true }).eq("id", id);
  if (error) throw error;
  done();
  redirect("/gym/templates");
}

export async function updateItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = requiredText(form, "id", "Exercise");
    const templateId = requiredText(form, "template_id", "Template");
    const sets = num(form, "sets", "Sets", { min: 1, max: 10, int: true });
    if (sets === null) throw new FormError("Sets is required.");
    const repMin = num(form, "rep_min", "Min reps", { min: 1, max: 100, int: true });
    const repMax = num(form, "rep_max", "Max reps", { min: 1, max: 100, int: true });
    if (repMin !== null && repMax !== null && repMin > repMax) {
      throw new FormError("Min reps can't be above max reps.");
    }
    const block = text(form, "block") === "finisher" ? "finisher" : "main";
    const supabase = await createClient();
    const { error } = await supabase
      .from("template_exercises")
      .update({
        sets,
        rep_min: repMin ?? repMax,
        rep_max: repMax ?? repMin,
        target_rir: num(form, "target_rir", "RIR", { min: 0, max: 5, int: true }),
        rest_seconds: num(form, "rest_seconds", "Rest", { min: 0, max: 600, int: true }),
        block,
      })
      .eq("id", id);
    if (error) throw error;
    done(templateId);
  } catch (err) {
    return toErrorState(err);
  }
  return { error: null, ok: true };
}

export async function addItem(templateId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const exerciseId = requiredText(form, "exercise_id", "Exercise");
    const block = text(form, "block") === "finisher" ? "finisher" : "main";
    const supabase = await createClient();
    const [{ data: items, error: listErr }, { data: ex, error: exErr }] = await Promise.all([
      supabase.from("template_exercises").select("id, position, block").eq("template_id", templateId).order("position"),
      supabase.from("exercises").select("mechanic").eq("id", exerciseId).single(),
    ]);
    if (listErr) throw listErr;
    if (exErr) throw exErr;
    const list = items ?? [];
    // Main work goes before the finisher; finisher items at the end.
    const firstFinisher = list.findIndex((i) => i.block === "finisher");
    const at = block === "main" && firstFinisher >= 0 ? firstFinisher : list.length;
    for (const [k, item] of list.slice(at).entries()) {
      const { error } = await supabase.from("template_exercises").update({ position: at + k + 2 }).eq("id", item.id);
      if (error) throw error;
    }
    const { error } = await supabase.from("template_exercises").insert({
      template_id: templateId,
      exercise_id: exerciseId,
      block,
      position: at + 1,
      sets: block === "finisher" ? 3 : ex.mechanic === "compound" ? 4 : 3,
    });
    if (error) throw error;
  } catch (err) {
    return toErrorState(err);
  }
  done(templateId);
  return { error: null, ok: true };
}

export async function removeItem(id: string, templateId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("template_exercises").delete().eq("id", id);
  if (error) throw error;
  done(templateId);
}

export async function moveItem(id: string, templateId: string, dir: -1 | 1) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("template_exercises")
    .select("id, position")
    .eq("template_id", templateId)
    .order("position");
  if (error) throw error;
  const list = data ?? [];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  // Renumber 1..n with the two swapped (positions may have gaps).
  [list[i], list[j]] = [list[j], list[i]];
  for (const [k, item] of list.entries()) {
    if (item.position === k + 1) continue;
    const { error: upErr } = await supabase.from("template_exercises").update({ position: k + 1 }).eq("id", item.id);
    if (upErr) throw upErr;
  }
  done(templateId);
}
