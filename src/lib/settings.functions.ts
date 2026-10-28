import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_DELIVERY_FEE, DEFAULT_PACKAGING_CHARGE } from "@/lib/order-types";
import {
  DEFAULT_PREORDER_SETTINGS,
  type PreorderPaymentMode,
  type PreorderSettings,
} from "@/lib/prepayment";

export type CafeSettings = {
  upiId: string;
  upiPayeeName: string;
  /** Flat delivery fee in ₹ (cafe_settings key: delivery_fee) */
  deliveryFee: number;
  /** Takeaway packaging charge in ₹ (cafe_settings key: packaging_charge) */
  packagingCharge: number;
} & PreorderSettings;

const DEFAULT_SETTINGS: CafeSettings = {
  upiId: "cafeq@upi",
  upiPayeeName: "Cafeq",
  deliveryFee: DEFAULT_DELIVERY_FEE,
  packagingCharge: DEFAULT_PACKAGING_CHARGE,
  ...DEFAULT_PREORDER_SETTINGS,
};

function parseMode(raw: string | undefined): PreorderPaymentMode {
  const mode = (raw || "").trim().toUpperCase();
  return mode === "NONE" || mode === "DEPOSIT" || mode === "FULL" ? mode : DEFAULT_PREORDER_SETTINGS.preorderPaymentMode;
}

function parseAmount(raw: string | undefined, fallback: number): number {
  const val = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(val) && val >= 0 ? val : fallback;
}

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
      return DEFAULT_SETTINGS;
    }

    const { data, error } = await supabase.from("cafe_settings").select("key, value");

    if (error || !data) {
      if (error) console.error("getCafeSettings error:", error);
      return DEFAULT_SETTINGS;
    }

    const map = new Map(data.map((s) => [s.key, s.value]));
    return {
      upiId: map.get("upi_id") || DEFAULT_SETTINGS.upiId,
      upiPayeeName: map.get("upi_payee_name") || DEFAULT_SETTINGS.upiPayeeName,
      deliveryFee: parseAmount(map.get("delivery_fee"), DEFAULT_SETTINGS.deliveryFee),
      packagingCharge: parseAmount(map.get("packaging_charge"), DEFAULT_SETTINGS.packagingCharge),
      preorderPaymentMode: parseMode(map.get("preorder_payment_mode")),
      depositPercent: parseAmount(map.get("deposit_percent"), DEFAULT_SETTINGS.depositPercent),
      depositMinInr: parseAmount(map.get("deposit_min_inr"), DEFAULT_SETTINGS.depositMinInr),
      refundCutoffMinutes: parseAmount(map.get("refund_cutoff_minutes"), DEFAULT_SETTINGS.refundCutoffMinutes),
    };
  } catch (err) {
    console.error("getCafeSettings unexpected error:", err);
    return DEFAULT_SETTINGS;
  }
}
