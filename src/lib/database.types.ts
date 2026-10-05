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
          hr_hist: number[] | null
          hr_hist_min: number | null
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
          hr_hist?: number[] | null
          hr_hist_min?: number | null
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
      athlete_settings: {
        Row: {
          load_calibration: Json
          max_hr: number
          max_source: string
          rest_hr: number
          rest_source: string
          threshold_date: string | null
          threshold_hr: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          load_calibration?: Json
          max_hr?: number
          max_source?: string
          rest_hr?: number
          rest_source?: string
          threshold_date?: string | null
          threshold_hr?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["athlete_settings"]["Insert"]>
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
      mesocycles: {
        Row: {
          focus: string
          gym_focus: string | null
          id: string
          key_sessions: string | null
          name: string
          position: number
          purpose: string | null
          season_id: string
          user_id: string
        }
        Insert: {
          focus: string
          gym_focus?: string | null
          id?: string
          key_sessions?: string | null
          name: string
          position: number
          purpose?: string | null
          season_id: string
          user_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["mesocycles"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "mesocycles_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_weeks: {
        Row: {
          gym_sessions: number | null
          cross_sessions: number | null
          id: string
          is_deload: boolean
          key_session: string | null
          load_target: number | null
          long_run_km: number | null
          mesocycle_id: string
          milestone: string | null
          notes: string | null
          quality_sessions: number | null
          run_km: number | null
          runs: number | null
          season_id: string
          user_id: string
          week_start: string
        }
        Insert: {
          gym_sessions?: number | null
          cross_sessions?: number | null
          id?: string
          is_deload?: boolean
          key_session?: string | null
          load_target?: number | null
          long_run_km?: number | null
          mesocycle_id: string
          milestone?: string | null
          notes?: string | null
          quality_sessions?: number | null
          run_km?: number | null
          runs?: number | null
          season_id: string
          user_id?: string
          week_start: string
        }
        Update: Partial<Database["public"]["Tables"]["season_weeks"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "season_weeks_mesocycle_id_fkey"
            columns: ["mesocycle_id"]
            isOneToOne: false
            referencedRelation: "mesocycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          decided_at: string | null
          goal_id: string
          id: string
          limits: Json
          rationale: string | null
          source: string
          status: string
          supersedes_id: string | null
          title: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          goal_id: string
          id?: string
          limits?: Json
          rationale?: string | null
          source?: string
          status?: string
          supersedes_id?: string | null
          title: string
          user_id?: string
          version: number
        }
        Update: Partial<Database["public"]["Tables"]["seasons"]["Insert"]>
        Relationships: [
          {
            foreignKeyName: "seasons_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
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
    Views: {
      hr_zone_cuts: {
        Row: {
          easy_from: number
          marathon_from: number
          max_hr: number
          rest_hr: number
          threshold_date: string | null
          threshold_from: number
          threshold_hr: number | null
          user_id: string
          vo2_from: number
        }
        Relationships: []
      }
      session_loads: {
        Row: {
          date: string
          id: string
          load: number
          load_type: string
          minutes: number
          name: string | null
          rpe: number
          rpe_source: string
          type: string
          user_id: string
          week_start: string
        }
        Relationships: []
      }
      weekly_load: {
        Row: {
          cross_training: number
          estimated_share: number | null
          gym: number
          hiit: number
          run: number
          total: number
          user_id: string
          week_start: string
        }
        Relationships: []
      }
      weekly_zones: {
        Row: {
          band_easy_min: number
          band_hard_min: number
          band_moderate_min: number
          easy_min: number
          easy_share: number | null
          marathon_min: number
          missing: number
          recovery_min: number
          threshold_min: number
          user_id: string
          vo2_min: number
          week_start: string
        }
        Relationships: []
      }
      season_week_load: {
        Row: {
          cross_training: number
          estimate: number
          gym: number
          hiit: number
          is_deload: boolean
          load_target: number | null
          planned: number
          planned_source: string
          run: number
          season_id: string
          season_status: string
          season_week_id: string
          user_id: string
          week_start: string
        }
        Relationships: []
      }
    }
    Functions: {
      approve_season: { Args: { p_season_id: string }; Returns: undefined }
      create_season_proposal: { Args: { p_goal_id: string; p_draft: Json }; Returns: string }
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
