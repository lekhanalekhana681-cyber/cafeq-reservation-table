/**
 * POST /api/payments/webhook — Razorpay webhook
 * Events: payment.captured, payment.failed, refund.processed
 * Signature: X-Razorpay-Signature = HMAC_SHA256(raw body, RAZORPAY_WEBHOOK_SECRET)
 * Idempotency: X-Razorpay-Event-Id is stored; repeats are acknowledged without reprocessing.
 */
import { json, route, servicesFromEnv } from "../_lib/http.js";

export const POST = route(async (request) => {
  const rawBody = await request.text();
  const { service } = servicesFromEnv();
  const result = await service.handleWebhook({
    rawBody,
    signature: request.headers.get("x-razorpay-signature"),
    eventId: request.headers.get("x-razorpay-event-id"),
  });
  return json(200, { ok: true, ...result });
});
