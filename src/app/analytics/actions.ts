"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BACKFILL_DAYS, RACE_HISTORY_DAYS, syncGarmin } from "@/lib/sync";
import { toErrorState, type ActionState } from "@/lib/form";

/**
 * One-time import of older Garmin history: 120 days so the 12-week charts fill up,
 * or 12 months (Season page) so a past race can anchor the marathon prediction.
 */
export async function importHistory(days: number = BACKFILL_DAYS): Promise<ActionState & { imported?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in." };
    const result = await syncGarmin(supabase, user.id, { backfillDays: Math.min(Math.max(Math.round(days) || BACKFILL_DAYS, BACKFILL_DAYS), RACE_HISTORY_DAYS) });
    revalidatePath("/", "layout");
    return { error: null, ok: true, imported: result.imported };
  } catch (err) {
    return toErrorState(err);
  }
}
