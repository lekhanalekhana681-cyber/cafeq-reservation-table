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
