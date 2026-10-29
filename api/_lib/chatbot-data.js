/**
 * Live data for the chatbot, read from Supabase (PostgREST) with plain fetch:
 * - menu_items (names, categories, prices, veg/alcohol flags, availability)
 * - cafe_settings (pre-order deposit / refund cutoff)
 * - a booking's status by its code (status, date and time only — no personal details)
 */
const MENU_CACHE_MS = 60_000;
let menuCache = { at: 0, rows: null };

function restConfig(env) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

async function get(env, fetchImpl, path) {
  const cfg = restConfig(env);
  if (!cfg) return null;
  const res = await fetchImpl(`${cfg.url}/rest/v1/${path}`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Supabase ${path.split("?")[0]} ${res.status}`);
  return res.json();
}

/** Live menu, or null if it can't be loaded (the bot then says it's unsure instead of guessing). */
export async function fetchMenu(env = process.env, fetchImpl = fetch, now = Date.now()) {
  if (menuCache.rows && now - menuCache.at < MENU_CACHE_MS) return menuCache.rows;
  try {
    const rows = await get(env, fetchImpl, "menu_items?select=name,category,price,is_veg,is_alcoholic,is_available&order=category.asc,name.asc");
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const menu = rows.map((r) => ({
      name: r.name,
      category: r.category,
      price: Number(r.price),
      isVeg: r.is_veg,
      isAlcoholic: r.is_alcoholic,
      isAvailable: r.is_available,
    }));
    menuCache = { at: now, rows: menu };
    return menu;
  } catch (err) {
    console.warn("[chatbot] menu unavailable:", err?.message);
    return null;
  }
}

export async function fetchPreorderSettings(env = process.env, fetchImpl = fetch) {
  try {
    const rows = await get(
      env,
      fetchImpl,
      "cafe_settings?select=key,value&key=in.(preorder_payment_mode,deposit_percent,deposit_min_inr,refund_cutoff_minutes)"
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      preorderPaymentMode: String(map.preorder_payment_mode || "DEPOSIT").toUpperCase(),
      depositPercent: Number(map.deposit_percent ?? 30),
      depositMinInr: Number(map.deposit_min_inr ?? 50),
      refundCutoffMinutes: Number(map.refund_cutoff_minutes ?? 30),
    };
  } catch {
    return null;
  }
}

export function bookingLookup(env = process.env, fetchImpl = fetch) {
  if (!restConfig(env)) return undefined;
  return async (code) => {
    try {
      const rows = await get(env, fetchImpl, `bookings?select=status,date,time&code=eq.${encodeURIComponent(code)}&limit=1`);
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    } catch {
      return null;
    }
  };
}
