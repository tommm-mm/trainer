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
          sport_type: string | null
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
          sport_type?: string | null
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
      exercise_targets: {
        Row: {
          created_at: string
          id: string
          rationale: string | null
          rep_max: number | null
          rep_min: number | null
          sets: number | null
          source: string
          status: string
          target_rir: number | null
          target_weight_kg: number | null
          template_exercise_id: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          rationale?: string | null
          rep_max?: number | null
          rep_min?: number | null
          sets?: number | null
          source?: string
          status?: string
          target_rir?: number | null
          target_weight_kg?: number | null
          template_exercise_id: string
          user_id?: string
          week_start: string
        }
        Update: Partial<Database["public"]["Tables"]["exercise_targets"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "exercise_targets_template_exercise_id_fkey"
            columns: ["template_exercise_id"]
            isOneToOne: false
            referencedRelation: "template_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          archived: boolean
          created_at: string
          equipment: string
          id: string
          is_main_lift: boolean
          measure: string
          mechanic: string
          name: string
          primary_muscles: string[]
          secondary_muscles: string[]
          user_id: string | null
          weight_step_kg: number
        }
        Insert: {
          archived?: boolean
          created_at?: string
          equipment: string
          id?: string
          is_main_lift?: boolean
          measure?: string
          mechanic: string
          name: string
          primary_muscles: string[]
          secondary_muscles?: string[]
          user_id?: string | null
          weight_step_kg?: number
        }
        Update: Partial<Database["public"]["Tables"]["exercises"]["Insert"]>
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
      template_exercises: {
        Row: {
          block: string
          exercise_id: string
          id: string
          notes: string | null
          position: number
          rep_max: number | null
          rep_min: number | null
          rest_seconds: number | null
          sets: number
          target_rir: number | null
          template_id: string
          user_id: string
        }
        Insert: {
          block?: string
          exercise_id: string
          id?: string
          notes?: string | null
          position: number
          rep_max?: number | null
          rep_min?: number | null
          rest_seconds?: number | null
          sets: number
          target_rir?: number | null
          template_id: string
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["template_exercises"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_exercises_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
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
          template_id: string | null
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
          template_id?: string | null
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
          {
            foreignKeyName: "weekly_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          block: string
          exercise_id: string
          id: string
          notes: string | null
          position: number
          template_exercise_id: string | null
          user_id: string
          workout_id: string
        }
        Insert: {
          block?: string
          exercise_id: string
          id: string
          notes?: string | null
          position: number
          template_exercise_id?: string | null
          user_id?: string
          workout_id: string
        }
        Update: Partial<Database["public"]["Tables"]["workout_exercises"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_template_exercise_id_fkey"
            columns: ["template_exercise_id"]
            isOneToOne: false
            referencedRelation: "template_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          duration_s: number | null
          id: string
          is_warmup: boolean
          logged_at: string
          position: number
          reps: number | null
          rir: number | null
          user_id: string
          weight_kg: number
          workout_exercise_id: string
        }
        Insert: {
          duration_s?: number | null
          id: string
          is_warmup?: boolean
          logged_at?: string
          position: number
          reps?: number | null
          rir?: number | null
          user_id?: string
          weight_kg?: number
          workout_exercise_id: string
        }
        Update: Partial<Database["public"]["Tables"]["workout_sets"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "workout_sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          position: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          position?: number
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["workout_templates"]["Insert"]>
        Relationships: []
      }
      workouts: {
        Row: {
          activity_id: string | null
          date: string
          finished_at: string | null
          id: string
          notes: string | null
          plan_id: string | null
          session_rpe: number | null
          started_at: string
          status: string
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          date: string
          finished_at?: string | null
          id: string
          notes?: string | null
          plan_id?: string | null
          session_rpe?: number | null
          started_at: string
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["workouts"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "workouts_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_muscle_list: { Args: { m: string[] }; Returns: boolean }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database["public"]["Tables"]
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"]
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"]
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"]
