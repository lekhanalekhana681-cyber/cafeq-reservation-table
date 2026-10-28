export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      bookings: {
        Row: {
          id: string;
          code: string;
          date: string;
          time: string;
          party: number;
          seating: string;
          table_type?: string;
          has_preorder?: boolean;
          estimated_prep_time?: number;
          food_ready_time?: string | null;
          is_peak_hour?: boolean;
          deposit_required?: boolean;
          deposit_amount?: number;
          kitchen_load?: string;
          name: string;
          phone: string;
          customer_email?: string | null;
          notes: string | null;
          dietary: string[];
          occasion: string | null;
          accessibility: string[];
          window_priority: boolean;
          items: Json;
          total: number;
          paid_amount: number;
          payment_method: string;
          payment_status: string;
          payment_reference?: string | null;
          status: string;
          actual_arrival_time?: string | null;
          confirmed_at?: string;
          created_at: string;
          user_id?: string | null;
          order_type?: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
          table_number?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          delivery_instructions?: string | null;
          pickup_time?: string | null;
          delivery_fee?: number | null;
          packaging_charge?: number | null;
        };
        Insert: {
          id?: string;
          code: string;
          date: string;
          time: string;
          party: number;
          seating: string;
          table_type?: string;
          has_preorder?: boolean;
          estimated_prep_time?: number;
          food_ready_time?: string | null;
          is_peak_hour?: boolean;
          deposit_required?: boolean;
          deposit_amount?: number;
          kitchen_load?: string;
          name: string;
          phone: string;
          customer_email?: string | null;
          notes?: string | null;
          dietary?: string[];
          occasion?: string | null;
          accessibility?: string[];
          window_priority?: boolean;
          items?: Json;
          total?: number;
          paid_amount?: number;
          payment_method?: string;
          payment_status?: string;
          payment_reference?: string | null;
          status?: string;
          actual_arrival_time?: string | null;
          confirmed_at?: string;
          created_at?: string;
          user_id?: string | null;
          order_type?: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
          table_number?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          delivery_instructions?: string | null;
          pickup_time?: string | null;
          delivery_fee?: number | null;
          packaging_charge?: number | null;
        };
        Update: {
          id?: string;
          code?: string;
          date?: string;
          time?: string;
          party?: number;
          seating?: string;
          table_type?: string;
          has_preorder?: boolean;
          estimated_prep_time?: number;
          food_ready_time?: string | null;
          is_peak_hour?: boolean;
          deposit_required?: boolean;
          deposit_amount?: number;
          kitchen_load?: string;
          name?: string;
          phone?: string;
          customer_email?: string | null;
          notes?: string | null;
          dietary?: string[];
          occasion?: string | null;
          accessibility?: string[];
          window_priority?: boolean;
          items?: Json;
          total?: number;
          paid_amount?: number;
          payment_method?: string;
          payment_status?: string;
          payment_reference?: string | null;
          status?: string;
          actual_arrival_time?: string | null;
          confirmed_at?: string;
          created_at?: string;
          user_id?: string | null;
          order_type?: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
          table_number?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          delivery_instructions?: string | null;
          pickup_time?: string | null;
          delivery_fee?: number | null;
          packaging_charge?: number | null;
        };
      };
      users: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string;
          role: string;
          password_hash: string;
          username?: string | null;
          created_at: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone: string;
          role?: string;
          password_hash: string;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          phone?: string;
          role?: string;
          password_hash?: string;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          phone: string;
          name: string;
          email: string | null;
          visit_count: number;
          total_spent: number;
          favorite_items: Json;
          first_visited_at: string;
          last_visited_at: string;
        };
        Insert: {
          id?: string;
          phone: string;
          name: string;
          email?: string | null;
          visit_count?: number;
          total_spent?: number;
          favorite_items?: Json;
          first_visited_at?: string;
          last_visited_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          name?: string;
          email?: string | null;
          visit_count?: number;
          total_spent?: number;
          favorite_items?: Json;
          first_visited_at?: string;
          last_visited_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          event_date: string | null;
          event_time: string | null;
          image_url: string | null;
          price: number | null;
          booking_link: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          event_date?: string | null;
          event_time?: string | null;
          image_url?: string | null;
          price?: number | null;
          booking_link?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          event_date?: string | null;
          event_time?: string | null;
          image_url?: string | null;
          price?: number | null;
          booking_link?: string | null;
          active?: boolean;
          created_at?: string;
        };
      };
      cafe_settings: {
        Row: {
          id: string;
          key: string;
          value: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: string;
        };
      };
      menu_items: {
        Row: {
          id: string;
          name: string;
          category: string;
          price: number;
          description: string | null;
          is_veg: boolean;
          is_alcoholic: boolean;
          is_available: boolean;
          tag: string | null;
          image_url: string | null;
          prep_time_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          price: number;
          description?: string | null;
          is_veg?: boolean;
          is_alcoholic?: boolean;
          is_available?: boolean;
          tag?: string | null;
          image_url?: string | null;
          prep_time_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          price?: number;
          description?: string | null;
          is_veg?: boolean;
          is_alcoholic?: boolean;
          is_available?: boolean;
          tag?: string | null;
          image_url?: string | null;
          prep_time_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      receipts: {
        Row: {
          id: string;
          booking_code: string;
          receipt_number: string;
          order_id: string | null;
          payment_id: string | null;
          payment_method: string;
          amount: number;
          tax_amount: number;
          items: Json;
          customer_name: string;
          customer_phone: string;
          customer_email: string | null;
          pdf_data: string | null;
          created_at: string;
          emailed_at: string | null;
        };
        Insert: {
          id?: string;
          booking_code: string;
          receipt_number: string;
          order_id?: string | null;
          payment_id?: string | null;
          payment_method?: string;
          amount: number;
          tax_amount?: number;
          items?: Json;
          customer_name: string;
          customer_phone: string;
          customer_email?: string | null;
          pdf_data?: string | null;
          created_at?: string;
          emailed_at?: string | null;
        };
        Update: {
          id?: string;
          booking_code?: string;
          receipt_number?: string;
          order_id?: string | null;
          payment_id?: string | null;
          payment_method?: string;
          amount?: number;
          tax_amount?: number;
          items?: Json;
          customer_name?: string;
          customer_phone?: string;
          customer_email?: string | null;
          pdf_data?: string | null;
          created_at?: string;
          emailed_at?: string | null;
        };
      };
      notification_logs: {
        Row: {
          id: string;
          event_type: string;
          channel: string;
          recipient: string;
          status: string;
          provider: string;
          message_preview: string | null;
          error_message: string | null;
          attempts: number;
          booking_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          channel: string;
          recipient: string;
          status?: string;
          provider: string;
          message_preview?: string | null;
          error_message?: string | null;
          attempts?: number;
          booking_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          channel?: string;
          recipient?: string;
          status?: string;
          provider?: string;
          message_preview?: string | null;
          error_message?: string | null;
          attempts?: number;
          booking_code?: string | null;
          created_at?: string;
        };
      };
      notification_preferences: {
        Row: {
          id: string;
          user_id: string | null;
          phone: string | null;
          email: string | null;
          sms_enabled: boolean;
          email_enabled: boolean;
          whatsapp_enabled: boolean;
          reminders_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          phone?: string | null;
          email?: string | null;
          sms_enabled?: boolean;
          email_enabled?: boolean;
          whatsapp_enabled?: boolean;
          reminders_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          phone?: string | null;
          email?: string | null;
          sms_enabled?: boolean;
          email_enabled?: boolean;
          whatsapp_enabled?: boolean;
          reminders_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      record_customer_visit: {
        Args: {
          _phone: string;
          _name: string;
          _email: string;
          _amount: number;
        };
        Returns: void;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
