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
          created_at: string
          double_sessions_allowed: string | null
          equipment: Json
          guardian_consent: boolean | null
          gym_access: boolean | null
          height_optional: number | null
          id: string
          league_optional: string | null
          level: string | null
          main_goal: string | null
          match_date: string | null
          pain_injury: boolean | null
          position: string | null
          sex_optional: string | null
          training_experience: string | null
          updated_at: string
          user_id: string
          weight_optional: number | null
        }
        Insert: {
          age?: number | null
          club_name?: string | null
          club_training_days?: Json
          created_at?: string
          double_sessions_allowed?: string | null
          equipment?: Json
          guardian_consent?: boolean | null
          gym_access?: boolean | null
          height_optional?: number | null
          id?: string
          league_optional?: string | null
          level?: string | null
          main_goal?: string | null
          match_date?: string | null
          pain_injury?: boolean | null
          position?: string | null
          sex_optional?: string | null
          training_experience?: string | null
          updated_at?: string
          user_id: string
          weight_optional?: number | null
        }
        Update: {
          age?: number | null
          club_name?: string | null
          club_training_days?: Json
          created_at?: string
          double_sessions_allowed?: string | null
          equipment?: Json
          guardian_consent?: boolean | null
          gym_access?: boolean | null
          height_optional?: number | null
          id?: string
          league_optional?: string | null
          level?: string | null
          main_goal?: string | null
          match_date?: string | null
          pain_injury?: boolean | null
          position?: string | null
          sex_optional?: string | null
          training_experience?: string | null
          updated_at?: string
          user_id?: string
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
          order_index: number | null
          reps: string | null
          rest: string | null
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
          order_index?: number | null
          reps?: string | null
          rest?: string | null
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
          order_index?: number | null
          reps?: string | null
          rest?: string | null
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
          created_at: string
          goal: string | null
          id: string
          month: string | null
          plan_json: Json
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal?: string | null
          id?: string
          month?: string | null
          plan_json?: Json
          status?: string
          user_id: string
        }
        Update: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
