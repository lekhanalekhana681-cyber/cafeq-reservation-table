/**
 * Helpers for the /api/payments/* Vercel functions (Web Request/Response signature,
 * which gives the exact raw body needed for webhook signature checks).
 */
import { PaymentError, toPaymentError } from "./errors.js";
import { createSupabaseDb } from "./db.js";
import { createRazorpayClient, getRazorpayConfig } from "./razorpay.js";
import { createSmsNotifier } from "./notify.js";
import { createPaymentService } from "./payments.js";

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function errorResponse(err) {
  const e = toPaymentError(err);
  return json(e.status, { error: e.message, code: e.code });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new PaymentError(400, "BAD_REQUEST", "Invalid request body.");
  }
}

/** Builds the payment service from env (production wiring). */
export function servicesFromEnv(env = process.env) {
  const db = createSupabaseDb(env);
  const config = getRazorpayConfig(env);
  return {
    db,
    service: createPaymentService({
      db,
      razorpay: createRazorpayClient(config),
      webhookSecret: config.webhookSecret,
      notify: createSmsNotifier(env),
    }),
  };
}

/** Wraps a handler so thrown PaymentErrors become JSON responses. */
export function route(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
