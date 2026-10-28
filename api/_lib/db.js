/**
 * Service-role database access for the payment functions.
 * Every operation is a pay_* SQL function (see supabase/migrations/*_preorder_payments.sql),
 * called through PostgREST's RPC endpoint. Plain fetch on purpose: supabase-js also starts a
 * realtime client, which throws on Node 20 runtimes without a native WebSocket.
 * SUPABASE_SERVICE_ROLE_KEY must never reach the browser.
 */
import { PaymentError } from "./errors.js";

export function createSupabaseDb(env = process.env, fetchImpl = fetch) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new PaymentError(503, "NOT_CONFIGURED", "Online payments are not configured yet. Please contact the cafe.");
  }

  return {
    async rpc(name, args) {
      let res;
      try {
        res = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args ?? {}),
        });
      } catch (err) {
        console.error(`[payments:db] ${name} unreachable:`, err?.message);
        throw new PaymentError(503, "DB_UNAVAILABLE", "The order database is unreachable. Please try again.");
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        // PostgREST error body: { code, message, details, hint }
        const err = new Error(data?.message || `RPC ${name} failed (${res.status})`);
        err.code = data?.code;
        throw err;
      }
      return data;
    },
  };
}
