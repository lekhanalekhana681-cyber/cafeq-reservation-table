/**
 * POST /api/payments/upi-claim  { code, phone, reference }  (reference = 12-digit UPI UTR, required)
 * The customer tapped "I have paid" after scanning the UPI QR (backup when the gateway fails).
 * Marks the order "Pending verification" for staff to confirm in Admin › Payments.
 * Talks to the database only — it must keep working when Razorpay is down or not configured.
 */
import { createSupabaseDb } from "../_lib/db.js";
import { json, readJson, route } from "../_lib/http.js";
import { PaymentError } from "../_lib/errors.js";

export const POST = route(async (request) => {
  const { code, phone, reference } = await readJson(request);
  if (!code || !phone) throw new PaymentError(400, "BAD_REQUEST", "Order code and phone number are required.");
  const db = createSupabaseDb();
  const result = await db.rpc("pay_claim_upi_qr", {
    _code: code,
    _phone: phone,
    _reference: typeof reference === "string" ? reference.slice(0, 64) : null,
  });
  console.log(`[payments] upi-qr claimed code=${code} ref=${reference ? "yes" : "no"}`);
  return json(200, { order: { code: result.booking.code, paymentStatus: result.booking.payment_status, status: result.booking.status } });
});
