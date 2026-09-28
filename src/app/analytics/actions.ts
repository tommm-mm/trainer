"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BACKFILL_DAYS, syncGarmin } from "@/lib/sync";
import { toErrorState, type ActionState } from "@/lib/form";

/** One-time import of older Garmin history so the 12-week charts fill up. */
export async function importHistory(): Promise<ActionState & { imported?: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in." };
    const result = await syncGarmin(supabase, user.id, { backfillDays: BACKFILL_DAYS });
    revalidatePath("/", "layout");
    return { error: null, ok: true, imported: result.imported };
  } catch (err) {
    return toErrorState(err);
  }
}
