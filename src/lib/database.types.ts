// Generated from the live Supabase schema (project cvfdficzypuxkumyimwd).
// Regenerate with: npx supabase gen types typescript --project-id cvfdficzypuxkumyimwd
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          avg_hr: number | null
          avg_pace: string | null
          created_at: string
          date: string
          distance_km: number | null
          duration_min: number | null
          elevation_m: number | null
          external_id: string | null
          feedback_at: string | null
          feedback_notes: string | null
          feeling_score: number | null
          id: string
          max_hr: number | null
          name: string | null
          rpe: number | null
          source: string
          type: string
          user_id: string
        }
        Insert: {
          avg_hr?: number | null
          avg_pace?: string | null
          created_at?: string
          date: string
          distance_km?: number | null
          duration_min?: number | null
          elevation_m?: number | null
          external_id?: string | null
          feedback_at?: string | null
          feedback_notes?: string | null
          feeling_score?: number | null
          id?: string
          max_hr?: number | null
          name?: string | null
          rpe?: number | null
          source: string
          type: string
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["activities"]["Insert"]>
        Relationships: []
      }
      body_metrics: {
        Row: {
          body_fat_pct: number | null
          created_at: string
          date: string
          id: string
          notes: string | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          user_id?: string
          weight_kg?: number | null
        }
        Update: Partial<Database["public"]["Tables"]["body_metrics"]["Insert"]>
        Relationships: []
      }
      checkins: {
        Row: {
          created_at: string
          date: string
          feeling_score: number | null
          feeling_text: string | null
          id: string
          notes: string | null
          sleep_hours: number | null
          soreness: number | null
          stress: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          feeling_score?: number | null
          feeling_text?: string | null
          id?: string
          notes?: string | null
          sleep_hours?: number | null
          soreness?: number | null
          stress?: number | null
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["checkins"]["Insert"]>
        Relationships: []
      }
      flags: {
        Row: {
          created_at: string
          date: string
          description: string
          id: string
          resolved: boolean
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          description: string
          id?: string
          resolved?: boolean
          type: string
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["flags"]["Insert"]>
        Relationships: []
      }
      goals: {
        Row: {
          build_week_number: number | null
          created_at: string
          deload_week: boolean
          goal_type: string
          id: string
          params: Json
          phase: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          build_week_number?: number | null
          created_at?: string
          deload_week?: boolean
          goal_type: string
          id?: string
          params?: Json
          phase?: string | null
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["goals"]["Insert"]>
        Relationships: []
      }
      gym_sessions: {
        Row: {
          created_at: string
          date: string
          exercise: string
          garmin_confirmed: boolean
          id: string
          reps: number | null
          rpe: number | null
          sets: number | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          date: string
          exercise: string
          garmin_confirmed?: boolean
          id?: string
          reps?: number | null
          rpe?: number | null
          sets?: number | null
          user_id?: string
          weight_kg?: number | null
        }
        Update: Partial<Database["public"]["Tables"]["gym_sessions"]["Insert"]>
        Relationships: []
      }
      weekly_plans: {
        Row: {
          created_at: string
          day: string
          goal_id: string | null
          id: string
          notes: string | null
          session_type: string
          status: string
          target_distance_km: number | null
          target_sets: number | null
          user_id: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          day: string
          goal_id?: string | null
          id?: string
          notes?: string | null
          session_type: string
          status?: string
          target_distance_km?: number | null
          target_sets?: number | null
          user_id?: string
          week_start_date: string
        }
        Update: Partial<Database["public"]["Tables"]["weekly_plans"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "weekly_plans_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database["public"]["Tables"]
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"]
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"]
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"]
