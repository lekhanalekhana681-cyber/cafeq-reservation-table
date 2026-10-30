/**
 * Razorpay Checkout — browser side.
 * Only loads checkout.js and holds the response type. Orders are created and payments verified
 * on the server (/api/payments/*, api/_lib/razorpay.js) with RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET,
 * which never reach the browser. Checkout is opened by payOnline() in src/lib/prepayment.ts.
 */

export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptLoadingPromise: Promise<boolean> | null = null;

/** Loads checkout.js once. Call early (page load) so the Pay button opens instantly. */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as any).Razorpay) return Promise.resolve(true);
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn("[payments] Failed to load Razorpay checkout.js (network or ad blocker).");
      scriptLoadingPromise = null; // allow a retry on the next attempt
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}
