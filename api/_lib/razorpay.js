/**
 * Server-side Razorpay client (Orders, Payments, Refunds) and signature checks.
 * Keys come from env only: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
 */
import crypto from "node:crypto";
import { PaymentError } from "./errors.js";

const API_BASE = "https://api.razorpay.com/v1";

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function hmacSha256Hex(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret) */
export function verifyPaymentSignature({ orderId, paymentId, signature, keySecret }) {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  return safeEqualHex(hmacSha256Hex(`${orderId}|${paymentId}`, keySecret), signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret) */
export function verifyWebhookSignature({ rawBody, signature, webhookSecret }) {
  if (!rawBody || !signature || !webhookSecret) return false;
  return safeEqualHex(hmacSha256Hex(rawBody, webhookSecret), signature);
}

export function getRazorpayConfig(env = process.env) {
  return {
    keyId: env.RAZORPAY_KEY_ID || "",
    keySecret: env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || "",
  };
}

export function createRazorpayClient({ keyId, keySecret, fetchImpl = fetch }) {
  if (!keyId || !keySecret) {
    throw new PaymentError(503, "NOT_CONFIGURED", "Online payments are not configured yet. Please contact the cafe.");
  }
  const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  async function call(method, path, body) {
    const res = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[razorpay] ${method} ${path} failed:`, res.status, data?.error);
      throw new PaymentError(502, "GATEWAY_ERROR", data?.error?.description || "The payment gateway is unavailable. Please try again.");
    }
    return data;
  }

  return {
    keyId,
    keySecret,
    isTestMode: keyId.startsWith("rzp_test_"),
    createOrder: ({ amountPaise, receipt, notes }) =>
      call("POST", "/orders", { amount: amountPaise, currency: "INR", receipt, notes, payment_capture: 1 }),
    fetchPayment: (paymentId) => call("GET", `/payments/${encodeURIComponent(paymentId)}`),
    capturePayment: (paymentId, amountPaise) =>
      call("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" }),
    refund: (paymentId, amountPaise, notes) =>
      call("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, speed: "normal", notes }),
    verifyPaymentSignature: ({ orderId, paymentId, signature }) =>
      verifyPaymentSignature({ orderId, paymentId, signature, keySecret }),
  };
}
