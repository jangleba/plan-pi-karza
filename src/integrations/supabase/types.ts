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
      module_backups: {
        Row: {
          user_id: string
          module: string
          device_id: string
          revision: number
          payload: Json
          operation_id: string
          updated_at: string
        }
        Insert: {
          user_id?: string
          module?: string
          device_id?: string
          revision?: number
          payload?: Json
          operation_id?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          module?: string
          device_id?: string
          revision?: number
          payload?: Json
          operation_id?: string
          updated_at?: string
        }
        Relationships: []
      }

      billing_entitlements: {
        Row: {
          user_id: string
          status: string
          expires_at: string | null
          verified_at: string
          product_id: string | null
          store: string | null
          updated_at: string
        }
        Insert: {
          user_id?: string
          status?: string
          expires_at?: string | null
          verified_at?: string
          product_id?: string | null
          store?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          status?: string
          expires_at?: string | null
          verified_at?: string
          product_id?: string | null
          store?: string | null
          updated_at?: string
        }
        Relationships: []
      }

      athlete_profiles: {
        Row: {
          account_owner_type: string
          age: number | null
          club_name: string | null
          club_training_days: Json
          competition_level: string | null
          created_at: string
          current_pitch_feelings: string[]
          desired_pitch_feelings: string[]
          double_sessions_allowed: string | null
          equipment: Json
          field_mas_kmh: number | null
          field_mas_tested_at: string | null
          field_mas_source_session_id: string | null
          food_allergies: Json
          food_exclusions: Json
          food_intolerances: Json
          fuel_allergy_status: string
          fuel_precision_enabled: boolean
          guardian_consent: boolean | null
          guardian_consent_at: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_verified_at: string | null
          gym_access: boolean | null
          has_gym: boolean | null
          has_pitch: boolean | null
          has_sprint_space: boolean | null
          health_personalization_enabled: boolean
          height_optional: number | null
          id: string
          individual_training_days: number[]
          league_optional: string | null
          level: string | null
          main_goal: string | null
          match_date: string | null
          match_dates: Json
          ownership_transfer_email: string | null
          ownership_transfer_requested_at: string | null
          ownership_transfer_status: string
          ownership_transferred_at: string | null
          pain_injury: boolean | null
          position: string | null
          running_progression_level: number
          running_progression_updated_at: string | null
          season_phase: string | null
          season_stage: string | null
          secondary_limiter: string | null
          sex_optional: string | null
          subscription_payer_type: string
          training_experience: string | null
          unavailable_days: Json
          unavailable_equipment_ids: Json
          updated_at: string
          user_id: string
          usual_match_day: string | null
          weekly_matches: boolean | null
          weight_optional: number | null
          pain_locations: Json
        }
        Insert: {
          account_owner_type?: string
          age?: number | null
          club_name?: string | null
          club_training_days?: Json
          competition_level?: string | null
          created_at?: string
          current_pitch_feelings?: string[]
          desired_pitch_feelings?: string[]
          double_sessions_allowed?: string | null
          equipment?: Json
          field_mas_kmh?: number | null
          field_mas_tested_at?: string | null
          field_mas_source_session_id?: string | null
          food_allergies?: Json
          food_exclusions?: Json
          food_intolerances?: Json
          fuel_allergy_status?: string
          fuel_precision_enabled?: boolean
          guardian_consent?: boolean | null
          guardian_consent_at?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_verified_at?: string | null
          gym_access?: boolean | null
          has_gym?: boolean | null
          has_pitch?: boolean | null
          has_sprint_space?: boolean | null
          health_personalization_enabled?: boolean
          height_optional?: number | null
          id?: string
          individual_training_days?: number[]
          league_optional?: string | null
          level?: string | null
          main_goal?: string | null
          match_date?: string | null
          match_dates?: Json
          ownership_transfer_email?: string | null
          ownership_transfer_requested_at?: string | null
          ownership_transfer_status?: string
          ownership_transferred_at?: string | null
          pain_injury?: boolean | null
          position?: string | null
          running_progression_level?: number
          running_progression_updated_at?: string | null
          season_phase?: string | null
          season_stage?: string | null
          secondary_limiter?: string | null
          sex_optional?: string | null
          subscription_payer_type?: string
          training_experience?: string | null
          unavailable_days?: Json
          unavailable_equipment_ids?: Json
          updated_at?: string
          user_id: string
          usual_match_day?: string | null
          weekly_matches?: boolean | null
          weight_optional?: number | null
          pain_locations?: Json
        }
        Update: {
          account_owner_type?: string
          age?: number | null
          club_name?: string | null
          club_training_days?: Json
          competition_level?: string | null
          created_at?: string
          current_pitch_feelings?: string[]
          desired_pitch_feelings?: string[]
          double_sessions_allowed?: string | null
          equipment?: Json
          field_mas_kmh?: number | null
          field_mas_tested_at?: string | null
          field_mas_source_session_id?: string | null
          food_allergies?: Json
          food_exclusions?: Json
          food_intolerances?: Json
          fuel_allergy_status?: string
          fuel_precision_enabled?: boolean
          guardian_consent?: boolean | null
          guardian_consent_at?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_verified_at?: string | null
          gym_access?: boolean | null
          has_gym?: boolean | null
          has_pitch?: boolean | null
          has_sprint_space?: boolean | null
          health_personalization_enabled?: boolean
          height_optional?: number | null
          id?: string
          individual_training_days?: number[]
          league_optional?: string | null
          level?: string | null
          main_goal?: string | null
          match_date?: string | null
          match_dates?: Json
          ownership_transfer_email?: string | null
          ownership_transfer_requested_at?: string | null
          ownership_transfer_status?: string
          ownership_transferred_at?: string | null
          pain_injury?: boolean | null
          position?: string | null
          running_progression_level?: number
          running_progression_updated_at?: string | null
          season_phase?: string | null
          season_stage?: string | null
          secondary_limiter?: string | null
          sex_optional?: string | null
          subscription_payer_type?: string
          training_experience?: string | null
          unavailable_days?: Json
          unavailable_equipment_ids?: Json
          updated_at?: string
          user_id?: string
          usual_match_day?: string | null
          weekly_matches?: boolean | null
          weight_optional?: number | null
          pain_locations?: Json
        }
        Relationships: []
      }
      consent_logs: {
        Row: {
          accepted: boolean
          accepted_at: string
          actor_email: string | null
          actor_type: string
          consent_type: string
          id: string
          scope: string | null
          text_snapshot: string | null
          user_id: string
          version: string
          withdrawn_at: string | null
        }
        Insert: {
          accepted: boolean
          accepted_at?: string
          actor_email?: string | null
          actor_type?: string
          consent_type: string
          id?: string
          scope?: string | null
          text_snapshot?: string | null
          user_id: string
          version: string
          withdrawn_at?: string | null
        }
        Update: {
          accepted?: boolean
          accepted_at?: string
          actor_email?: string | null
          actor_type?: string
          consent_type?: string
          id?: string
          scope?: string | null
          text_snapshot?: string | null
          user_id?: string
          version?: string
          withdrawn_at?: string | null
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
      exercise_replacements: {
        Row: {
          active: boolean
          created_at: string
          date: string
          equipment_ids: string[]
          exercise_id: string
          id: string
          original_json: Json
          replacement_json: Json
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          date: string
          equipment_ids?: string[]
          exercise_id: string
          id?: string
          original_json: Json
          replacement_json: Json
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          date?: string
          equipment_ids?: string[]
          exercise_id?: string
          id?: string
          original_json?: Json
          replacement_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      exercise_set_logs: {
        Row: {
          created_at: string
          exercise_key: string
          exercise_name: string | null
          id: string
          metric_kind: string | null
          metric_value: number | null
          performed_at: string
          reps: number | null
          rir: number | null
          session_id: string | null
          set_number: number
          updated_at: string
          user_id: string
          weight_kg: number | null
          write_version: number
          server_updated_at: string
        }
        Insert: {
          created_at?: string
          exercise_key: string
          exercise_name?: string | null
          id?: string
          metric_kind?: string | null
          metric_value?: number | null
          performed_at?: string
          reps?: number | null
          rir?: number | null
          session_id?: string | null
          set_number: number
          updated_at?: string
          user_id: string
          weight_kg?: number | null
          write_version?: number
          server_updated_at?: string
        }
        Update: {
          created_at?: string
          exercise_key?: string
          exercise_name?: string | null
          id?: string
          metric_kind?: string | null
          metric_value?: number | null
          performed_at?: string
          reps?: number | null
          rir?: number | null
          session_id?: string | null
          set_number?: number
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
          write_version?: number
          server_updated_at?: string
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
          alters_movement: boolean
          available_time: number | null
          club_training_today: boolean | null
          created_at: string
          date: string
          energy: number | null
          fatigue: number | null
          id: string
          match_today: boolean | null
          motivation: number | null
          overall: number | null
          pain_level: number | null
          pain_location: string | null
          pain_onset: string | null
          pain_status: boolean | null
          red_flags: Json
          sleep: number | null
          soreness: number | null
          stress: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alters_movement?: boolean
          available_time?: number | null
          club_training_today?: boolean | null
          created_at?: string
          date: string
          energy?: number | null
          fatigue?: number | null
          id?: string
          match_today?: boolean | null
          motivation?: number | null
          overall?: number | null
          pain_level?: number | null
          pain_location?: string | null
          pain_onset?: string | null
          pain_status?: boolean | null
          red_flags?: Json
          sleep?: number | null
          soreness?: number | null
          stress?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alters_movement?: boolean
          available_time?: number | null
          club_training_today?: boolean | null
          created_at?: string
          date?: string
          energy?: number | null
          fatigue?: number | null
          id?: string
          match_today?: boolean | null
          motivation?: number | null
          overall?: number | null
          pain_level?: number | null
          pain_location?: string | null
          pain_onset?: string | null
          pain_status?: boolean | null
          red_flags?: Json
          sleep?: number | null
          soreness?: number | null
          stress?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      running_activities: {
        Row: {
          avg_pace_sec_per_km: number | null
          created_at: string
          date: string
          distance_m: number
          duration_sec: number
          id: string
          is_field_mas_test: boolean
          session_id: string
          updated_at: string
          user_id: string
          write_version: number
          server_updated_at: string
          interval_results: Json
          started_at: string | null
          ended_at: string | null
          progression_applied: boolean
        }
        Insert: {
          avg_pace_sec_per_km?: number | null
          created_at?: string
          date: string
          distance_m: number
          duration_sec: number
          id?: string
          is_field_mas_test?: boolean
          session_id: string
          updated_at?: string
          user_id: string
          write_version?: number
          server_updated_at?: string
          interval_results?: Json
          started_at?: string | null
          ended_at?: string | null
          progression_applied?: boolean
        }
        Update: {
          avg_pace_sec_per_km?: number | null
          created_at?: string
          date?: string
          distance_m?: number
          duration_sec?: number
          id?: string
          is_field_mas_test?: boolean
          session_id?: string
          updated_at?: string
          user_id?: string
          write_version?: number
          server_updated_at?: string
          interval_results?: Json
          started_at?: string | null
          ended_at?: string | null
          progression_applied?: boolean
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
          activity_type: string | null
          completed: boolean | null
          completion_status: string
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          id: string
          notes: string | null
          rpe: number | null
          session_id: string | null
          started_at: string | null
          updated_at: string
          user_id: string
          write_version: number
          server_updated_at: string
          execution_snapshot: Json | null
        }
        Insert: {
          activity_type?: string | null
          completed?: boolean | null
          completion_status?: string
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          rpe?: number | null
          session_id?: string | null
          started_at?: string | null
          updated_at?: string
          user_id: string
          write_version?: number
          server_updated_at?: string
          execution_snapshot?: Json | null
        }
        Update: {
          activity_type?: string | null
          completed?: boolean | null
          completion_status?: string
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          rpe?: number | null
          session_id?: string | null
          started_at?: string | null
          updated_at?: string
          user_id?: string
          write_version?: number
          server_updated_at?: string
          execution_snapshot?: Json | null
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
          cycle_id: string
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
          cycle_id?: string
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
          cycle_id?: string
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
      weekly_transitions: {
        Row: {
          confirmed_at: string
          created_at: string
          id: string
          next_match_date: string | null
          next_match_dates: Json
          no_match_next_week: boolean
          updated_at: string
          user_id: string
          week_number: number
          cycle_id: string | null
          week_start: string | null
          week_end: string | null
        }
        Insert: {
          confirmed_at?: string
          created_at?: string
          id?: string
          next_match_date?: string | null
          next_match_dates?: Json
          no_match_next_week?: boolean
          updated_at?: string
          user_id: string
          week_number: number
          cycle_id?: string | null
          week_start?: string | null
          week_end?: string | null
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          id?: string
          next_match_date?: string | null
          next_match_dates?: Json
          no_match_next_week?: boolean
          updated_at?: string
          user_id?: string
          week_number?: number
          cycle_id?: string | null
          week_start?: string | null
          week_end?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      record_consent_state: {
        Args: {
          p_consent_type: string
          p_accepted: boolean
          p_expected_profile_updated_at?: string | null
        }
        Returns: Json
      }
      save_profile_and_plan: {
        Args: {
          p_profile: Json
          p_athlete: Json
          p_plan: Json
          p_expected_profile_updated_at?: string | null
          p_clear_transitions?: boolean
          p_from_date?: string
        }
        Returns: Json
      }
      set_equipment_replacement: {
        Args: {
          p_operation_id: string
          p_replacement?: Json | null
          p_undo_id?: string | null
        }
        Returns: Json
      }
      save_module_backup: {
        Args: {
          p_module: string
          p_device_id: string
          p_expected_version: number
          p_operation_id: string
          p_payload: Json
        }
        Returns: Json
      }

      record_billing_entitlement: {
        Args: {
          p_user_id: string
          p_status: string
          p_expires_at: string | null
          p_verified_at: string
          p_product_id: string | null
          p_store: string | null
          p_event_id?: string | null
        }
        Returns: undefined
      }

      save_readiness_checkin: {
        Args: {
          p_payload: Json
        }
        Returns: Json
      }

      undo_plan_modification: {
        Args: {
          p_modification_id: string
          p_operation_id?: string
          p_expected_plan_id?: string
        }
        Returns: undefined
      }

      apply_plan_modification: {
        Args: {
          p_operation_id: string
          p_modification: Json
          p_session: Json
          p_exercises: Json
          p_expected_plan_id: string
          p_second_session?: Json
          p_second_exercises?: Json
        }
        Returns: Json
      }

      save_running_result: {
        Args: {
          p_operation_id: string
          p_payload: Json
          p_expected_version: number
        }
        Returns: Json
      }

      save_exercise_set: {
        Args: {
          p_operation_id: string
          p_payload: Json
          p_expected_version: number
        }
        Returns: Json
      }

      save_training_log: {
        Args: {
          p_operation_id: string
          p_session_id: string
          p_expected_version: number
          p_payload: Json
        }
        Returns: Json
      }

      consume_fuel_photo_quota: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      latest_consent_is_accepted: {
        Args: { p_consent_type: string; p_user_id: string }
        Returns: boolean
      }
      latest_consent_is_accepted_for_version: {
        Args: { p_consent_type: string; p_user_id: string; p_version: string }
        Returns: boolean
      }
      persist_training_plan_atomic: {
        Args: {
          p_days: Json
          p_exercises: Json
          p_goal: string
          p_month: string
          p_plan_id: string
          p_plan_json: Json
          p_sessions: Json
        }
        Returns: undefined
      }
      persist_training_plan_v2: {
        Args: {
          p_expected_plan_id?: string
          p_transition?: Json
          p_days: Json
          p_exercises: Json
          p_goal: string
          p_month: string
          p_plan_id: string
          p_plan_json: Json
          p_sessions: Json
        }
        Returns: undefined
      }
      delete_running_activity_atomic: {
        Args: { p_activity_id: string }
        Returns: boolean
      }
      record_consent: {
        Args: { p_accepted: boolean; p_consent_type: string }
        Returns: undefined
      }
      withdraw_health_data_consent: {
        Args: { p_text_snapshot: string; p_version: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
