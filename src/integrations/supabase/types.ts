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
      approval_actions: {
        Row: {
          action: string
          approver_id: string
          comments: string | null
          created_at: string
          expense_id: string
          id: string
          level: Database["public"]["Enums"]["approval_level"]
        }
        Insert: {
          action: string
          approver_id: string
          comments?: string | null
          created_at?: string
          expense_id: string
          id?: string
          level: Database["public"]["Enums"]["approval_level"]
        }
        Update: {
          action?: string
          approver_id?: string
          comments?: string | null
          created_at?: string
          expense_id?: string
          id?: string
          level?: Database["public"]["Enums"]["approval_level"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          expense_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          expense_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          expense_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_splits: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          friend_id: string | null
          friend_name: string
          id: string
          is_self: boolean
          items: Json | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expense_id: string
          friend_id?: string | null
          friend_name: string
          id?: string
          is_self?: boolean
          items?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          friend_id?: string | null
          friend_name?: string
          id?: string
          is_self?: boolean
          items?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_splits_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "friends"
            referencedColumns: ["id"]
          },
        ]
      }
      detected_subscriptions: {
        Row: {
          category: string
          created_at: string
          email_count: number
          email_status: string
          id: string
          last_amount: number | null
          last_email_date: string | null
          last_email_from: string | null
          last_email_subject: string | null
          service_key: string
          service_name: string
          source: string
          updated_at: string
          user_confirmed_status: string | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          email_count?: number
          email_status?: string
          id?: string
          last_amount?: number | null
          last_email_date?: string | null
          last_email_from?: string | null
          last_email_subject?: string | null
          service_key: string
          service_name: string
          source?: string
          updated_at?: string
          user_confirmed_status?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          email_count?: number
          email_status?: string
          id?: string
          last_amount?: number | null
          last_email_date?: string | null
          last_email_from?: string | null
          last_email_subject?: string | null
          service_key?: string
          service_name?: string
          source?: string
          updated_at?: string
          user_confirmed_status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          description: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      expense_receipts: {
        Row: {
          expense_id: string
          file_name: string
          file_path: string
          id: string
          uploaded_at: string
        }
        Insert: {
          expense_id: string
          file_name: string
          file_path: string
          id?: string
          uploaded_at?: string
        }
        Update: {
          expense_id?: string
          file_name?: string
          file_path?: string
          id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          content_hash: string | null
          conversion_rate: number | null
          converted_amount: number | null
          cost_center: string | null
          created_at: string
          currency: string
          description: string | null
          expense_date: string
          id: string
          merchant: string | null
          original_currency: string | null
          status: Database["public"]["Enums"]["expense_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          content_hash?: string | null
          conversion_rate?: number | null
          converted_amount?: number | null
          cost_center?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          id?: string
          merchant?: string | null
          original_currency?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          content_hash?: string | null
          conversion_rate?: number | null
          converted_amount?: number | null
          cost_center?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          id?: string
          merchant?: string | null
          original_currency?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_scan_dedup_log: {
        Row: {
          content_hash: string | null
          created_at: string
          decision: string
          doc_type: string | null
          email_from: string | null
          email_subject: string | null
          gmail_message_id: string | null
          id: string
          matched_document_id: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          decision: string
          doc_type?: string | null
          email_from?: string | null
          email_subject?: string | null
          gmail_message_id?: string | null
          id?: string
          matched_document_id?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          decision?: string
          doc_type?: string | null
          email_from?: string | null
          email_subject?: string | null
          gmail_message_id?: string | null
          id?: string
          matched_document_id?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      financial_documents: {
        Row: {
          account_label: string | null
          broker: string | null
          closing_balance: number | null
          content_hash: string | null
          counterparty: string | null
          created_at: string
          currency: string
          description: string | null
          doc_type: string
          due_date: string | null
          email_date: string | null
          email_from: string | null
          email_subject: string | null
          gmail_message_id: string | null
          id: string
          issuer: string | null
          min_due: number | null
          opening_balance: number | null
          period_end: string | null
          period_start: string | null
          raw_extracted: Json | null
          reference_number: string | null
          statement_date: string | null
          status: string
          title: string
          total_amount: number | null
          total_credits: number | null
          total_debits: number | null
          trade_date: string | null
          trade_price: number | null
          trade_quantity: number | null
          trade_side: string | null
          trade_symbol: string | null
          trade_value: number | null
          txn_date: string | null
          txn_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_label?: string | null
          broker?: string | null
          closing_balance?: number | null
          content_hash?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          doc_type: string
          due_date?: string | null
          email_date?: string | null
          email_from?: string | null
          email_subject?: string | null
          gmail_message_id?: string | null
          id?: string
          issuer?: string | null
          min_due?: number | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          raw_extracted?: Json | null
          reference_number?: string | null
          statement_date?: string | null
          status?: string
          title?: string
          total_amount?: number | null
          total_credits?: number | null
          total_debits?: number | null
          trade_date?: string | null
          trade_price?: number | null
          trade_quantity?: number | null
          trade_side?: string | null
          trade_symbol?: string | null
          trade_value?: number | null
          txn_date?: string | null
          txn_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_label?: string | null
          broker?: string | null
          closing_balance?: number | null
          content_hash?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          doc_type?: string
          due_date?: string | null
          email_date?: string | null
          email_from?: string | null
          email_subject?: string | null
          gmail_message_id?: string | null
          id?: string
          issuer?: string | null
          min_due?: number | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          raw_extracted?: Json | null
          reference_number?: string | null
          statement_date?: string | null
          status?: string
          title?: string
          total_amount?: number | null
          total_credits?: number | null
          total_debits?: number | null
          trade_date?: string | null
          trade_price?: number | null
          trade_quantity?: number | null
          trade_side?: string | null
          trade_symbol?: string | null
          trade_value?: number | null
          txn_date?: string | null
          txn_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      friends: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gmail_connections: {
        Row: {
          access_token: string
          connected_at: string
          email_address: string
          id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          email_address: string
          id?: string
          refresh_token: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          email_address?: string
          id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processed_emails: {
        Row: {
          expense_id: string | null
          gmail_message_id: string
          id: string
          processed_at: string
          received_at: string | null
          sender: string | null
          subject: string | null
          user_id: string
        }
        Insert: {
          expense_id?: string | null
          gmail_message_id: string
          id?: string
          processed_at?: string
          received_at?: string | null
          sender?: string | null
          subject?: string | null
          user_id: string
        }
        Update: {
          expense_id?: string | null
          gmail_message_id?: string
          id?: string
          processed_at?: string
          received_at?: string | null
          sender?: string | null
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_emails_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_group: string | null
          city_tier: string | null
          country: string | null
          created_at: string
          default_currency: string
          department: string
          display_name: string
          financial_goal: string | null
          full_name: string
          id: string
          income_range: string | null
          job_type: string | null
          living_situation: string | null
          manager_id: string | null
          money_profile_completed: boolean
          monthly_emi: number | null
          monthly_rent: number | null
          onboarding_completed: boolean
          phone: string | null
          phone_verified: boolean
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          age_group?: string | null
          city_tier?: string | null
          country?: string | null
          created_at?: string
          default_currency?: string
          department?: string
          display_name?: string
          financial_goal?: string | null
          full_name?: string
          id: string
          income_range?: string | null
          job_type?: string | null
          living_situation?: string | null
          manager_id?: string | null
          money_profile_completed?: boolean
          monthly_emi?: number | null
          monthly_rent?: number | null
          onboarding_completed?: boolean
          phone?: string | null
          phone_verified?: boolean
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          age_group?: string | null
          city_tier?: string | null
          country?: string | null
          created_at?: string
          default_currency?: string
          department?: string
          display_name?: string
          financial_goal?: string | null
          full_name?: string
          id?: string
          income_range?: string | null
          job_type?: string | null
          living_situation?: string | null
          manager_id?: string | null
          money_profile_completed?: boolean
          monthly_emi?: number | null
          monthly_rent?: number | null
          onboarding_completed?: boolean
          phone?: string | null
          phone_verified?: boolean
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      split_payments: {
        Row: {
          amount: number
          created_at: string
          direction: string
          friend_id: string | null
          friend_name: string
          id: string
          note: string | null
          paid_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          direction?: string
          friend_id?: string | null
          friend_name: string
          id?: string
          note?: string | null
          paid_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          direction?: string
          friend_id?: string | null
          friend_name?: string
          id?: string
          note?: string | null
          paid_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          kind: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          kind: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          days: number
          duplicates: number
          error_message: string | null
          finished_at: string | null
          id: string
          kind: string
          saved: number
          skipped: number
          started_at: string
          status: string
          total: number
          user_id: string
        }
        Insert: {
          days?: number
          duplicates?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          saved?: number
          skipped?: number
          started_at?: string
          status?: string
          total?: number
          user_id: string
        }
        Update: {
          days?: number
          duplicates?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          saved?: number
          skipped?: number
          started_at?: string
          status?: string
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      gmail_connections_safe: {
        Row: {
          connected_at: string | null
          email_address: string | null
          id: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          email_address?: string | null
          id?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          email_address?: string | null
          id?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager_of: {
        Args: { _employee_id: string; _manager_id: string }
        Returns: boolean
      }
      release_sync_lock: { Args: { _kind: string }; Returns: undefined }
      try_acquire_sync_lock: {
        Args: { _kind: string; _ttl_seconds?: number }
        Returns: boolean
      }
      update_my_profile: { Args: { _full_name: string }; Returns: undefined }
    }
    Enums: {
      app_role: "employee" | "manager" | "finance"
      approval_level: "manager" | "finance"
      expense_status:
        | "draft"
        | "submitted"
        | "manager_approved"
        | "approved"
        | "rejected"
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
      app_role: ["employee", "manager", "finance"],
      approval_level: ["manager", "finance"],
      expense_status: [
        "draft",
        "submitted",
        "manager_approved",
        "approved",
        "rejected",
      ],
    },
  },
} as const
