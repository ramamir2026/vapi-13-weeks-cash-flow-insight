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
      ar_entries: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string
          expected_collection_date: string
          id: string
          import_filename: string | null
          import_locked: boolean
          invoice_amount: number
          invoice_date: string
          invoice_number: string | null
          notes: string | null
          source: string
          status: Database["public"]["Enums"]["ar_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name: string
          expected_collection_date: string
          id?: string
          import_filename?: string | null
          import_locked?: boolean
          invoice_amount?: number
          invoice_date: string
          invoice_number?: string | null
          notes?: string | null
          source?: string
          status?: Database["public"]["Enums"]["ar_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string
          expected_collection_date?: string
          id?: string
          import_filename?: string | null
          import_locked?: boolean
          invoice_amount?: number
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          source?: string
          status?: Database["public"]["Enums"]["ar_status"]
          updated_at?: string
        }
        Relationships: []
      }
      ar_weekly_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          delay_days: number
          forecast_start: string
          id: string
          weeks: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delay_days?: number
          forecast_start: string
          id?: string
          weeks: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delay_days?: number
          forecast_start?: string
          id?: string
          weeks?: Json
        }
        Relationships: []
      }
      assumptions: {
        Row: {
          category: string
          created_at: string
          id: string
          key: string
          label: string
          notes: string | null
          unit: string | null
          updated_at: string
          value: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          key: string
          label: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          notes?: string | null
          unit?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          field_name: string | null
          id: string
          import_filename: string | null
          new_value: string | null
          old_value: string | null
          row_id: string | null
          source: string
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          field_name?: string | null
          id?: string
          import_filename?: string | null
          new_value?: string | null
          old_value?: string | null
          row_id?: string | null
          source?: string
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          field_name?: string | null
          id?: string
          import_filename?: string | null
          new_value?: string | null
          old_value?: string | null
          row_id?: string | null
          source?: string
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bank_category_rules: {
        Row: {
          bank_source: Database["public"]["Enums"]["bank_source"] | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          vendor_contains: string
        }
        Insert: {
          bank_source?: Database["public"]["Enums"]["bank_source"] | null
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          vendor_contains: string
        }
        Update: {
          bank_source?: Database["public"]["Enums"]["bank_source"] | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          vendor_contains?: string
        }
        Relationships: []
      }
      bank_statements: {
        Row: {
          bank_source: Database["public"]["Enums"]["bank_source"]
          closing_balance: number
          created_at: string
          created_by: string | null
          filename: string
          id: string
          parsed_text: string | null
          statement_date: string
        }
        Insert: {
          bank_source: Database["public"]["Enums"]["bank_source"]
          closing_balance: number
          created_at?: string
          created_by?: string | null
          filename: string
          id?: string
          parsed_text?: string | null
          statement_date: string
        }
        Update: {
          bank_source?: Database["public"]["Enums"]["bank_source"]
          closing_balance?: number
          created_at?: string
          created_by?: string | null
          filename?: string
          id?: string
          parsed_text?: string | null
          statement_date?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          balance: number | null
          bank_source: Database["public"]["Enums"]["bank_source"]
          category: string
          created_at: string
          created_by: string | null
          date: string
          id: string
          import_filename: string | null
          notes: string | null
          source: string
          updated_at: string
          vendor: string
        }
        Insert: {
          amount: number
          balance?: number | null
          bank_source: Database["public"]["Enums"]["bank_source"]
          category?: string
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          import_filename?: string | null
          notes?: string | null
          source?: string
          updated_at?: string
          vendor: string
        }
        Update: {
          amount?: number
          balance?: number | null
          bank_source?: Database["public"]["Enums"]["bank_source"]
          category?: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          import_filename?: string | null
          notes?: string | null
          source?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      future_hires: {
        Row: {
          annual_salary: number
          created_at: string
          created_by: string | null
          department: string | null
          id: string
          import_filename: string | null
          import_locked: boolean
          name: string
          notes: string | null
          role: string
          source: string
          start_date: string
          status: Database["public"]["Enums"]["hire_status"]
          updated_at: string
        }
        Insert: {
          annual_salary?: number
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          import_filename?: string | null
          import_locked?: boolean
          name: string
          notes?: string | null
          role: string
          source?: string
          start_date: string
          status?: Database["public"]["Enums"]["hire_status"]
          updated_at?: string
        }
        Update: {
          annual_salary?: number
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          import_filename?: string | null
          import_locked?: boolean
          name?: string
          notes?: string | null
          role?: string
          source?: string
          start_date?: string
          status?: Database["public"]["Enums"]["hire_status"]
          updated_at?: string
        }
        Relationships: []
      }
      hire_payroll_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          forecast_start: string
          id: string
          periods: Json
          weeks: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          forecast_start: string
          id?: string
          periods: Json
          weeks: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          forecast_start?: string
          id?: string
          periods?: Json
          weeks?: Json
        }
        Relationships: []
      }
      model_weeks: {
        Row: {
          ar_collections: number
          burn: number
          card_payments: number
          closing_balance: number
          cogs: number
          created_at: string
          created_by: string | null
          enterprise_revenue: number
          id: string
          net_change: number
          opening_balance: number
          opex: number
          payroll: number
          rent: number
          runway_weeks: number | null
          snapshot_id: string
          snapshot_label: string | null
          stripe_revenue: number
          week_index: number
          week_start_date: string
        }
        Insert: {
          ar_collections?: number
          burn?: number
          card_payments?: number
          closing_balance?: number
          cogs?: number
          created_at?: string
          created_by?: string | null
          enterprise_revenue?: number
          id?: string
          net_change?: number
          opening_balance?: number
          opex?: number
          payroll?: number
          rent?: number
          runway_weeks?: number | null
          snapshot_id: string
          snapshot_label?: string | null
          stripe_revenue?: number
          week_index: number
          week_start_date: string
        }
        Update: {
          ar_collections?: number
          burn?: number
          card_payments?: number
          closing_balance?: number
          cogs?: number
          created_at?: string
          created_by?: string | null
          enterprise_revenue?: number
          id?: string
          net_change?: number
          opening_balance?: number
          opex?: number
          payroll?: number
          rent?: number
          runway_weeks?: number | null
          snapshot_id?: string
          snapshot_label?: string | null
          stripe_revenue?: number
          week_index?: number
          week_start_date?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      week_signoffs: {
        Row: {
          approved_at: string
          approved_by_email: string
          approved_by_user_id: string
          id: string
          note: string | null
          week_start_date: string
        }
        Insert: {
          approved_at?: string
          approved_by_email: string
          approved_by_user_id: string
          id?: string
          note?: string | null
          week_start_date: string
        }
        Update: {
          approved_at?: string
          approved_by_email?: string
          approved_by_user_id?: string
          id?: string
          note?: string | null
          week_start_date?: string
        }
        Relationships: []
      }
      weekly_actuals: {
        Row: {
          actual_burn: number | null
          closing_cash_balance: number
          created_at: string
          created_by: string | null
          id: string
          import_filename: string | null
          import_locked: boolean
          notes: string | null
          source: string
          updated_at: string
          week_start_date: string
        }
        Insert: {
          actual_burn?: number | null
          closing_cash_balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          import_filename?: string | null
          import_locked?: boolean
          notes?: string | null
          source?: string
          updated_at?: string
          week_start_date: string
        }
        Update: {
          actual_burn?: number | null
          closing_cash_balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          import_filename?: string | null
          import_locked?: boolean
          notes?: string | null
          source?: string
          updated_at?: string
          week_start_date?: string
        }
        Relationships: []
      }
      weekly_checklist: {
        Row: {
          completed: boolean
          completed_at: string | null
          completed_by_email: string | null
          created_at: string
          id: string
          item_key: string
          updated_at: string
          week_start_date: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          completed_by_email?: string | null
          created_at?: string
          id?: string
          item_key: string
          updated_at?: string
          week_start_date: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          completed_by_email?: string | null
          created_at?: string
          id?: string
          item_key?: string
          updated_at?: string
          week_start_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_user_role: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      admin_list_user_roles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      clear_import_lock: {
        Args: { p_row: string; p_table: string }
        Returns: undefined
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_import_context: { Args: { filename: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user" | "viewer" | "editor" | "approver"
      ar_status: "pending" | "collected" | "overdue" | "written_off"
      bank_source:
        | "brex_primary"
        | "brex_treasury"
        | "brex_stripe_clearing"
        | "svb_checking"
        | "svb_money_market"
        | "stripe"
      hire_status: "confirmed" | "offer_sent" | "interviewing"
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
      app_role: ["admin", "user", "viewer", "editor", "approver"],
      ar_status: ["pending", "collected", "overdue", "written_off"],
      bank_source: [
        "brex_primary",
        "brex_treasury",
        "brex_stripe_clearing",
        "svb_checking",
        "svb_money_market",
        "stripe",
      ],
      hire_status: ["confirmed", "offer_sent", "interviewing"],
    },
  },
} as const
