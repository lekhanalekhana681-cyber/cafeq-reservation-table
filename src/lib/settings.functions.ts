import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type CafeSettings = {
  upiId: string;
  upiPayeeName: string;
};

function getPublicClient() {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export async function getCafeSettings(): Promise<CafeSettings> {
  try {
    const supabase = getPublicClient();
    if (!supabase) {
      return { upiId: "cafeq@upi", upiPayeeName: "Cafeq" };
    }

    const { data, error } = await supabase.from("cafe_settings").select("key, value");

    if (error || !data) {
      if (error) console.error("getCafeSettings error:", error);
      return { upiId: "cafeq@upi", upiPayeeName: "Cafeq" };
    }

    const map = new Map(data.map((s) => [s.key, s.value]));
    return {
      upiId: map.get("upi_id") || "cafeq@upi",
      upiPayeeName: map.get("upi_payee_name") || "Cafeq",
    };
  } catch (err) {
    console.error("getCafeSettings unexpected error:", err);
    return { upiId: "cafeq@upi", upiPayeeName: "Cafeq" };
  }
}
