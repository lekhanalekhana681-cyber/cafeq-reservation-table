/**
 * POST /api/payments/report-failed  { code, phone, reason? }
 * Razorpay Checkout failed in the browser: stores payment status "failed" on the order so it
 * shows in Admin › Payments. It can never mark anything paid; a later success replaces it.
 */
import { createSupabaseDb } from "../_lib/db.js";
import { json, readJson, route } from "../_lib/http.js";
import { PaymentError } from "../_lib/errors.js";

export const POST = route(async (request) => {
  const { code, phone, reason } = await readJson(request);
  if (!code || !phone) throw new PaymentError(400, "BAD_REQUEST", "Order code and phone number are required.");
  const result = await createSupabaseDb().rpc("pay_report_failed", {
    _code: code,
    _phone: phone,
    _reason: typeof reason === "string" ? reason.slice(0, 500) : null,
  });
  return json(200, { order: { code: result.booking.code, paymentStatus: result.booking.payment_status } });
});
