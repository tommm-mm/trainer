import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";

export type DB = SupabaseClient<Database>;

/** The single active goal, or null. The app keeps at most one active. */
export async function getActiveGoal(supabase: DB): Promise<Tables<"goals"> | null> {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
