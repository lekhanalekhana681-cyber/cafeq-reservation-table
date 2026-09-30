// src/lib/reservations.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const supabase = createClient<Database>(
  import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"],
  import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_ANON_KEY"]
);

/** Fetch all available tables with capacity info */
export async function fetchTables() {
  const { data, error } = await supabase.from("tables").select("*");
  if (error) throw error;
  return data;
}

/** Fetch menu items for pre‑order */
export async function fetchMenuItems() {
  const { data, error } = await supabase.from("menu_items").select("*");
  if (error) throw error;
  return data;
}

/** Wrapper around existing booking creation */
import { createBooking } from "./bookings.functions";
export async function makeReservation(input: Parameters<typeof createBooking>[0]) {
  // Delegates to the existing function which already validates via Zod
  return await createBooking(input);
}
