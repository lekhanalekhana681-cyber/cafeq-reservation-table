/**
 * POST /api/payments/pay-at-cafe  { code, phone }
 * The customer's fallback when online payment fails: the unpaid order stays placed and is paid
 * by cash or card at the cafe. The phone must match the order.
 * Talks to the database only — it must keep working when Razorpay is down or not configured.
 */
import { createSupabaseDb } from "../_lib/db.js";
import { json, readJson, route } from "../_lib/http.js";
import { PaymentError } from "../_lib/errors.js";

export const POST = route(async (request) => {
  const { code, phone } = await readJson(request);
  if (!code || !phone) throw new PaymentError(400, "BAD_REQUEST", "Order code and phone number are required.");
  const result = await createSupabaseDb().rpc("pay_choose_at_cafe", { _code: code, _phone: phone });
  console.log(`[payments] pay at cafe chosen code=${code}`);
  return json(200, { order: { code: result.booking.code, paymentStatus: result.booking.payment_status, status: result.booking.status } });
});
