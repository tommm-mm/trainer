import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncGarmin } from "@/lib/sync";

// POST /api/sync — pulls recent Garmin activities from intervals.icu for the
// logged-in user. Runs with the user's session, so RLS applies.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const result = await syncGarmin(supabase, user.id);
    revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync] failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
