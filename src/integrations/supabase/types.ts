export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      athlete_profiles: {
        Row: {
          age: number | null
          club_name: string | null
          club_training_days: Json
          competition_level: string | null
          created_at: string
          double_sessions_allowed: string | null
          equipment: Json
          guardian_consent: boolean | null
          gym_access: boolean | null
          has_gym: boolean | null
          has_pitch: boolean | null
          has_sprint_space: boolean | null
          height_optional: number | null
          id: string
          individual_training_days: number[]
          league_optional: string | null
          level: string | null
          main_goal: string | null
          match_date: string | null
          pain_injury: boolean | null
          position: string | null
          season_phase: string | null
          season_stage: string | null
          secondary_limiter: string | null
          sex_optional: string | null
          training_experience: string | null
          unavailable_days: Json
          unavailable_equipment_ids: Json
          updated_at: string
          user_id: string
          usual_match_day: string | null
          weekly_matches: boolean | null
          weight_optional: number | null
        }
        Insert: {
          age?: number | null
          club_name?: string | null
          club_training_days?: Json
          competition_level?: string | null
          created_at?: string
          double_sessions_allowed?: string | null
          equipment?: Json
          guardian_consent?: boolean | null
          gym_access?: boolean | null
          has_gym?: boolean | null
          has_pitch?: boolean | null
          has_sprint_space?: boolean | null
          height_optional?: number | null
          id?: string
          individual_training_days?: number[]
          league_optional?: string | null
          level?: string | null
          main_goal?: string | null
          match_date?: string | null
          pain_injury?: boolean | null
          position?: string | null
          season_phase?: string | null
          season_stage?: string | null
          secondary_limiter?: string | null
          sex_optional?: string | null
          training_experience?: string | null
          unavailable_days?: Json
          unavailable_equipment_ids?: Json
          updated_at?: string
          user_id: string
          usual_match_day?: string | null
          weekly_matches?: boolean | null
          weight_optional?: number | null
        }
        Update: {
          age?: number | null
          club_name?: string | null
          club_training_days?: Json
          competition_level?: string | null
          created_at?: string
          double_sessions_allowed?: string | null
          equipment?: Json
          guardian_consent?: boolean | null
          gym_access?: boolean | null
          has_gym?: boolean | null
          has_pitch?: boolean | null
          has_sprint_space?: boolean | null
          height_optional?: number | null
          id?: string
          individual_training_days?: number[]
          league_optional?: string | null
          level?: string | null
          main_goal?: string | null
          match_date?: string | null
          pain_injury?: boolean | null
          position?: string | null
          season_phase?: string | null
          season_stage?: string | null
          secondary_limiter?: string | null
          sex_optional?: string | null
          training_experience?: string | null
          unavailable_days?: Json
          unavailable_equipment_ids?: Json
          updated_at?: string
          user_id?: string
          usual_match_day?: string | null
          weekly_matches?: boolean | null
          weight_optional?: number | null
        }
        Relationships: []
      }
      consent_logs: {
        Row: {
          accepted: boolean
          accepted_at: string
          consent_type: string
          id: string
          text_snapshot: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted: boolean
          accepted_at?: string
          consent_type: string
          id?: string
          text_snapshot?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted?: boolean
          accepted_at?: string
          consent_type?: string
          id?: string
          text_snapshot?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      exercise_library: {
        Row: {
          age_max: number | null
          age_min: number | null
          category: string | null
          coaching_cues: string | null
          contraindications: string | null
          created_at: string
          default_duration: string | null
          default_reps: string | null
          default_rest: string | null
          default_sets: number | null
          description: string | null
          equipment: Json | null
          goal_tags: Json | null
          id: string
          instructions: string | null
          level: string | null
          name: string
          position_tags: Json | null
          subcategory: string | null
          video_url_optional: string | null
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          category?: string | null
          coaching_cues?: string | null
          contraindications?: string | null
          created_at?: string
          default_duration?: string | null
          default_reps?: string | null
          default_rest?: string | null
          default_sets?: number | null
          description?: string | null
          equipment?: Json | null
          goal_tags?: Json | null
          id?: string
          instructions?: string | null
          level?: string | null
          name: string
          position_tags?: Json | null
          subcategory?: string | null
          video_url_optional?: string | null
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          category?: string | null
          coaching_cues?: string | null
          contraindications?: string | null
          created_at?: string
          default_duration?: string | null
          default_reps?: string | null
          default_rest?: string | null
          default_sets?: number | null
          description?: string | null
          equipment?: Json | null
          goal_tags?: Json | null
          id?: string
          instructions?: string | null
          level?: string | null
          name?: string
          position_tags?: Json | null
          subcategory?: string | null
          video_url_optional?: string | null
        }
        Relationships: []
      }
      onboarding_answers: {
        Row: {
          answers_json: Json
          completed_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          answers_json?: Json
          completed_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          answers_json?: Json
          completed_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      pain_logs: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          pain_level: number | null
          pain_location: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          pain_level?: number | null
          pain_location?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          pain_level?: number | null
          pain_location?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age_group: string | null
          birth_date: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed: boolean
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          age_group?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          age_group?: string | null
          birth_date?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      readiness_logs: {
        Row: {
          available_time: number | null
          club_training_today: boolean | null
          created_at: string
          date: string
          energy: number | null
          fatigue: number | null
          id: string
          match_today: boolean | null
          motivation: number | null
          pain_location: string | null
          pain_status: boolean | null
          sleep: number | null
          soreness: number | null
          stress: number | null
          user_id: string
        }
        Insert: {
          available_time?: number | null
          club_training_today?: boolean | null
          created_at?: string
          date: string
          energy?: number | null
          fatigue?: number | null
          id?: string
          match_today?: boolean | null
          motivation?: number | null
          pain_location?: string | null
          pain_status?: boolean | null
          sleep?: number | null
          soreness?: number | null
          stress?: number | null
          user_id: string
        }
        Update: {
          available_time?: number | null
          club_training_today?: boolean | null
          created_at?: string
          date?: string
          energy?: number | null
          fatigue?: number | null
          id?: string
          match_today?: boolean | null
          motivation?: number | null
          pain_location?: string | null
          pain_status?: boolean | null
          sleep?: number | null
          soreness?: number | null
          stress?: number | null
          user_id?: string
        }
        Relationships: []
      }
      session_exercises: {
        Row: {
          coaching_cues: string | null
          distance: string | null
          duration: string | null
          exercise_id: string | null
          id: string
          load: string | null
          name: string | null
          order_index: number | null
          reps: string | null
          rest: string | null
          section: string | null
          session_id: string | null
          sets: number | null
          user_id: string
          video_url_optional: string | null
        }
        Insert: {
          coaching_cues?: string | null
          distance?: string | null
          duration?: string | null
          exercise_id?: string | null
          id?: string
          load?: string | null
          name?: string | null
          order_index?: number | null
          reps?: string | null
          rest?: string | null
          section?: string | null
          session_id?: string | null
          sets?: number | null
          user_id: string
          video_url_optional?: string | null
        }
        Update: {
          coaching_cues?: string | null
          distance?: string | null
          duration?: string | null
          exercise_id?: string | null
          id?: string
          load?: string | null
          name?: string | null
          order_index?: number | null
          reps?: string | null
          rest?: string | null
          section?: string | null
          session_id?: string | null
          sets?: number | null
          user_id?: string
          video_url_optional?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_logs: {
        Row: {
          completed: boolean | null
          created_at: string
          id: string
          notes: string | null
          rpe: number | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          id?: string
          notes?: string | null
          rpe?: number | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          id?: string
          notes?: string | null
          rpe?: number | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      session_modifications: {
        Row: {
          active: boolean
          created_at: string
          date: string
          id: string
          new_session_id: string | null
          new_session_json: Json | null
          original_session_id: string | null
          original_session_json: Json | null
          reason: string | null
          safety_status: string
          type: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          date: string
          id?: string
          new_session_id?: string | null
          new_session_json?: Json | null
          original_session_id?: string | null
          original_session_json?: Json | null
          reason?: string | null
          safety_status?: string
          type: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          date?: string
          id?: string
          new_session_id?: string | null
          new_session_json?: Json | null
          original_session_id?: string | null
          original_session_json?: Json | null
          reason?: string | null
          safety_status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      session_templates: {
        Row: {
          age_group: string | null
          created_at: string
          duration_min: number | null
          goal_tags: Json | null
          id: string
          level: string | null
          session_type: string | null
          structure_json: Json | null
          title: string
        }
        Insert: {
          age_group?: string | null
          created_at?: string
          duration_min?: number | null
          goal_tags?: Json | null
          id?: string
          level?: string | null
          session_type?: string | null
          structure_json?: Json | null
          title: string
        }
        Update: {
          age_group?: string | null
          created_at?: string
          duration_min?: number | null
          goal_tags?: Json | null
          id?: string
          level?: string | null
          session_type?: string | null
          structure_json?: Json | null
          title?: string
        }
        Relationships: []
      }
      training_days: {
        Row: {
          created_at: string
          date: string
          day_type: string | null
          decision_reason: string | null
          id: string
          plan_id: string | null
          readiness_adjustment: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          day_type?: string | null
          decision_reason?: string | null
          id?: string
          plan_id?: string | null
          readiness_adjustment?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          day_type?: string | null
          decision_reason?: string | null
          id?: string
          plan_id?: string | null
          readiness_adjustment?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          active: boolean
          created_at: string
          goal: string | null
          id: string
          month: string | null
          plan_json: Json
          status: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          goal?: string | null
          id?: string
          month?: string | null
          plan_json?: Json
          status?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          goal?: string | null
          id?: string
          month?: string | null
          plan_json?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      training_sessions: {
        Row: {
          cooldown_json: Json | null
          created_at: string
          duration_min: number | null
          goal: string | null
          id: string
          intensity: string | null
          main_work_json: Json | null
          safety_notes: string | null
          session_type: string | null
          title: string | null
          training_day_id: string | null
          user_id: string
          warmup_json: Json | null
        }
        Insert: {
          cooldown_json?: Json | null
          created_at?: string
          duration_min?: number | null
          goal?: string | null
          id?: string
          intensity?: string | null
          main_work_json?: Json | null
          safety_notes?: string | null
          session_type?: string | null
          title?: string | null
          training_day_id?: string | null
          user_id: string
          warmup_json?: Json | null
        }
        Update: {
          cooldown_json?: Json | null
          created_at?: string
          duration_min?: number | null
          goal?: string | null
          id?: string
          intensity?: string | null
          main_work_json?: Json | null
          safety_notes?: string | null
          session_type?: string | null
          title?: string | null
          training_day_id?: string | null
          user_id?: string
          warmup_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_training_day_id_fkey"
            columns: ["training_day_id"]
            isOneToOne: false
            referencedRelation: "training_days"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vision_tests: {
        Row: {
          ai_feedback: Json | null
          algorithm_version: string | null
          analysis_status: string
          braking_start_frame: number | null
          braking_time: number | null
          calculation_basis: Json | null
          calculation_method: string | null
          camera_view: string | null
          capture_mode: string | null
          coach_corrected: boolean
          coach_corrected_frames: Json | null
          coach_feedback: Json | null
          coach_id: string | null
          coach_note: string | null
          coach_verified: boolean
          comparison_to_previous: Json | null
          confidence_score: string
          created_at: string
          distance_cm: number | null
          distance_m: number | null
          entry_frame: number | null
          exercise_category: string | null
          exit_frame: number | null
          finish_frame: number | null
          first_contact_frame: number | null
          flight_time: number | null
          fps: number | null
          frame_analysis_enabled: boolean
          frame_analysis_status: string | null
          frame_count: number | null
          id: string
          jump_height_cm: number | null
          landing_frame: number | null
          last_contact_frame: number | null
          legacy_source_id: string | null
          linked_exercise_id: string | null
          linked_exercise_name: string | null
          linked_plan_id: string | null
          linked_training_day: string | null
          linked_workout_id: string | null
          main_result_unit: string | null
          main_result_value: number | null
          manual_correction: boolean
          manual_override: boolean
          manual_override_reason: string | null
          marked_by: string | null
          measured_metrics: Json | null
          metric_direction: string | null
          number_of_contacts: number | null
          paid_review_requested: boolean
          paid_review_status: string | null
          review_mode: string | null
          review_status: string
          review_type: string | null
          saved_to_progress: boolean
          speed_km_h: number | null
          speed_m_s: number | null
          sprint_time: number | null
          start_frame: number | null
          stop_frame: number | null
          takeoff_frame: number | null
          technique_review: Json | null
          temporal_resolution_ms: number | null
          test_category: string
          test_name: string
          test_type: string
          user_id: string
          validity_flags: Json | null
          validity_status: string
          verified_by_coach: boolean
          video_url: string | null
          visibility_status: string
        }
        Insert: {
          ai_feedback?: Json | null
          algorithm_version?: string | null
          analysis_status?: string
          braking_start_frame?: number | null
          braking_time?: number | null
          calculation_basis?: Json | null
          calculation_method?: string | null
          camera_view?: string | null
          capture_mode?: string | null
          coach_corrected?: boolean
          coach_corrected_frames?: Json | null
          coach_feedback?: Json | null
          coach_id?: string | null
          coach_note?: string | null
          coach_verified?: boolean
          comparison_to_previous?: Json | null
          confidence_score?: string
          created_at?: string
          distance_cm?: number | null
          distance_m?: number | null
          entry_frame?: number | null
          exercise_category?: string | null
          exit_frame?: number | null
          finish_frame?: number | null
          first_contact_frame?: number | null
          flight_time?: number | null
          fps?: number | null
          frame_analysis_enabled?: boolean
          frame_analysis_status?: string | null
          frame_count?: number | null
          id?: string
          jump_height_cm?: number | null
          landing_frame?: number | null
          last_contact_frame?: number | null
          legacy_source_id?: string | null
          linked_exercise_id?: string | null
          linked_exercise_name?: string | null
          linked_plan_id?: string | null
          linked_training_day?: string | null
          linked_workout_id?: string | null
          main_result_unit?: string | null
          main_result_value?: number | null
          manual_correction?: boolean
          manual_override?: boolean
          manual_override_reason?: string | null
          marked_by?: string | null
          measured_metrics?: Json | null
          metric_direction?: string | null
          number_of_contacts?: number | null
          paid_review_requested?: boolean
          paid_review_status?: string | null
          review_mode?: string | null
          review_status?: string
          review_type?: string | null
          saved_to_progress?: boolean
          speed_km_h?: number | null
          speed_m_s?: number | null
          sprint_time?: number | null
          start_frame?: number | null
          stop_frame?: number | null
          takeoff_frame?: number | null
          technique_review?: Json | null
          temporal_resolution_ms?: number | null
          test_category: string
          test_name: string
          test_type: string
          user_id: string
          validity_flags?: Json | null
          validity_status?: string
          verified_by_coach?: boolean
          video_url?: string | null
          visibility_status?: string
        }
        Update: {
          ai_feedback?: Json | null
          algorithm_version?: string | null
          analysis_status?: string
          braking_start_frame?: number | null
          braking_time?: number | null
          calculation_basis?: Json | null
          calculation_method?: string | null
          camera_view?: string | null
          capture_mode?: string | null
          coach_corrected?: boolean
          coach_corrected_frames?: Json | null
          coach_feedback?: Json | null
          coach_id?: string | null
          coach_note?: string | null
          coach_verified?: boolean
          comparison_to_previous?: Json | null
          confidence_score?: string
          created_at?: string
          distance_cm?: number | null
          distance_m?: number | null
          entry_frame?: number | null
          exercise_category?: string | null
          exit_frame?: number | null
          finish_frame?: number | null
          first_contact_frame?: number | null
          flight_time?: number | null
          fps?: number | null
          frame_analysis_enabled?: boolean
          frame_analysis_status?: string | null
          frame_count?: number | null
          id?: string
          jump_height_cm?: number | null
          landing_frame?: number | null
          last_contact_frame?: number | null
          legacy_source_id?: string | null
          linked_exercise_id?: string | null
          linked_exercise_name?: string | null
          linked_plan_id?: string | null
          linked_training_day?: string | null
          linked_workout_id?: string | null
          main_result_unit?: string | null
          main_result_value?: number | null
          manual_correction?: boolean
          manual_override?: boolean
          manual_override_reason?: string | null
          marked_by?: string | null
          measured_metrics?: Json | null
          metric_direction?: string | null
          number_of_contacts?: number | null
          paid_review_requested?: boolean
          paid_review_status?: string | null
          review_mode?: string | null
          review_status?: string
          review_type?: string | null
          saved_to_progress?: boolean
          speed_km_h?: number | null
          speed_m_s?: number | null
          sprint_time?: number | null
          start_frame?: number | null
          stop_frame?: number | null
          takeoff_frame?: number | null
          technique_review?: Json | null
          temporal_resolution_ms?: number | null
          test_category?: string
          test_name?: string
          test_type?: string
          user_id?: string
          validity_flags?: Json | null
          validity_status?: string
          verified_by_coach?: boolean
          video_url?: string | null
          visibility_status?: string
        }
        Relationships: []
      }
      weekly_transitions: {
        Row: {
          confirmed_at: string
          created_at: string
          id: string
          next_match_date: string | null
          no_match_next_week: boolean
          updated_at: string
          user_id: string
          week_number: number
        }
        Insert: {
          confirmed_at?: string
          created_at?: string
          id?: string
          next_match_date?: string | null
          no_match_next_week?: boolean
          updated_at?: string
          user_id: string
          week_number: number
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          id?: string
          next_match_date?: string | null
          no_match_next_week?: boolean
          updated_at?: string
          user_id?: string
          week_number?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "coach" | "athlete"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "coach", "athlete"],
    },
  },
} as const
