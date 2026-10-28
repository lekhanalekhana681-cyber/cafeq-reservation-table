/**
 * POST /api/payments/verify
 * { code, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Verifies the Checkout signature on the server, confirms the payment with Razorpay,
 * then marks the order paid and releases it to the kitchen.
 */
import { json, readJson, route, servicesFromEnv } from "../_lib/http.js";

export const POST = route(async (request) => {
  const body = await readJson(request);
  const { service } = servicesFromEnv();
  return json(200, await service.verify(body));
});
