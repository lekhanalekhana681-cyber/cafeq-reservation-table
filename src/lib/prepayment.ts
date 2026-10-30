/**
 * Pre-order deposit / prepayment — client side.
 * The database decides whether an order needs payment and computes the amounts
 * (supabase/migrations/20261030000000_preorder_payments.sql); the helpers here only
 * mirror those rules so checkout can show the breakdown before the order is placed.
 * All money is integer paise. All times are shown in IST.
 */
import { loadRazorpayScript, type RazorpayPaymentSuccessResponse } from "@/lib/razorpay.service";
import type { OrderType } from "@/lib/order-types";

export type PreorderPaymentMode = "NONE" | "DEPOSIT" | "FULL";

export type PaymentState =
  | "UNPAID"
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "FORFEITED";

export type PreorderSettings = {
  preorderPaymentMode: PreorderPaymentMode;
  depositPercent: number;
  depositMinInr: number;
  refundCutoffMinutes: number;
};

export const DEFAULT_PREORDER_SETTINGS: PreorderSettings = {
  preorderPaymentMode: "DEPOSIT",
  depositPercent: 30,
  depositMinInr: 50,
  refundCutoffMinutes: 30,
};

/** Unpaid pre-orders expire after this long (mirrors payment_expires_at). */
export const PAYMENT_WINDOW_MINUTES = 15;

const IST_OFFSET_MS = 330 * 60000;

// ─── IST helpers ──────────────────────────────────────────────────────────────

/** Today's date in IST as YYYY-MM-DD. */
export function istToday(now: number = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Epoch ms for an IST wall-clock date (YYYY-MM-DD) and time (HH:MM). */
export function istDateTimeToMs(date: string, time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const utc = Date.parse(`${date}T${m[1].padStart(2, "0")}:${m[2]}:00Z`);
  return Number.isFinite(utc) ? utc - IST_OFFSET_MS : null;
}

export function formatIst(ms: number | string | null | undefined, withDate = true): string {
  if (ms === null || ms === undefined) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(withDate ? { day: "numeric", month: "short" } : {}),
  });
}

export function formatPaise(paise: number | null | undefined): string {
  const value = (paise ?? 0) / 100;
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// ─── Rule mirrors (display only — the database is authoritative) ───────────────

/** When the customer is due (mirrors public.preorder_scheduled_at). */
export function estimateScheduledAt(
  input: { orderType: OrderType; date: string; time: string; pickupTime?: string | null },
  now: number = Date.now()
): number | null {
  if (input.orderType === "DINE_IN") return istDateTimeToMs(input.date, input.time);
  if (input.orderType !== "TAKEAWAY") return null;

  const p = (input.pickupTime || "").trim().toLowerCase();
  let m = /in\s+(\d+)\s*min/.exec(p);
  if (m) return now + Number(m[1]) * 60000;
  m = /in\s+(\d+)\s*h/.exec(p);
  if (m) return now + Number(m[1]) * 3600000;
  m = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/.exec(p);
  if (m) {
    const raw = Number(m[1]);
    const hour = (raw % 12) + (m[3] === "pm" || (!m[3] && raw === 12) ? 12 : 0);
    if (hour <= 23 && Number(m[2]) <= 59) {
      const t = istDateTimeToMs(istToday(now), `${hour}:${m[2]}`);
      if (t !== null && t > now) return t;
    }
  }
  return now + 20 * 60000;
}

/** Mirrors public.is_preorder: food to prepare ahead + a future pickup/arrival. */
export function isPreorder(
  input: {
    orderType: OrderType;
    date: string;
    time: string;
    pickupTime?: string | null;
    items: Array<{ fulfillment?: string }>;
  },
  now: number = Date.now()
): boolean {
  const hasPrep = input.items.some((i) => (i.fulfillment ?? "pre_ordered") === "pre_ordered");
  if (!hasPrep) return false;
  if (input.orderType === "TAKEAWAY") return true;
  if (input.orderType !== "DINE_IN") return false;
  const at = estimateScheduledAt(input, now);
  return at !== null && at > now + 15 * 60000;
}

/** Mirrors public.compute_deposit_paise (whole rupees, never above the total). */
export function computeDuePaise(totalPaise: number, settings: PreorderSettings): number {
  if (settings.preorderPaymentMode === "FULL") return totalPaise;
  if (settings.preorderPaymentMode !== "DEPOSIT") return 0;
  const pct = Math.round((totalPaise * settings.depositPercent) / 10000) * 100;
  return Math.min(totalPaise, Math.max(Math.round(settings.depositMinInr) * 100, pct));
}

export function refundCutoffMs(scheduledAt: number | string | null | undefined, cutoffMinutes: number): number | null {
  if (scheduledAt === null || scheduledAt === undefined) return null;
  const at = typeof scheduledAt === "number" ? scheduledAt : Date.parse(scheduledAt);
  return Number.isFinite(at) ? at - cutoffMinutes * 60000 : null;
}

/** Customer-facing policy sentence shown before the Pay button. */
export function refundPolicyText(cutoffAt: number | null, cutoffMinutes: number, full: boolean): string {
  const what = full ? "your payment" : "your deposit";
  if (cutoffAt === null) {
    return `Cancel at least ${cutoffMinutes} minutes before your time for a full refund of ${what}. After that, or if you don't arrive, ${what} is non-refundable.`;
  }
  return `Free cancellation until ${formatIst(cutoffAt)} IST (${cutoffMinutes} min before your time) with a full refund of ${what}. After that, or if you don't arrive, ${what} is non-refundable.`;
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  UNPAID: "Unpaid",
  PENDING: "Awaiting payment",
  PARTIALLY_PAID: "Deposit paid",
  PAID: "Fully paid",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
  FORFEITED: "Deposit forfeited",
};

export const PAYMENT_STATE_BADGE_CLASS: Record<PaymentState, string> = {
  UNPAID: "bg-muted text-muted-foreground border-border",
  PENDING: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  PARTIALLY_PAID: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  PAID: "bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  REFUNDED: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PARTIALLY_REFUNDED: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  FORFEITED: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

// ─── API client (/api/payments/*, Vercel functions) ───────────────────────────

export type PaymentOrderSummary = {
  code: string;
  status: string;
  paymentState: PaymentState;
  totalAmountPaise: number;
  depositDuePaise: number;
  amountPaidPaise: number;
  balanceDuePaise: number;
  scheduledAt: string | null;
  paymentExpiresAt: string | null;
};

export type PaymentReceipt = {
  paymentId: string;
  razorpayOrderId: string;
  amountPaise: number;
  method: string | null;
  paidAt: string;
};

export class PaymentApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) {
    super(message);
    this.name = "PaymentApiError";
  }
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PaymentApiError("Couldn't reach the payment server. Check your connection and try again.", "NETWORK");
  }
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // Vite dev server answers /api/* with index.html — the functions only run on Vercel (or `vercel dev`)
    throw new PaymentApiError(
      "The payment server isn't running here. Online payments work on the deployed site or with `vercel dev`.",
      "NO_SERVER",
      res.status
    );
  }
  if (!res.ok) throw new PaymentApiError(data?.error || "Payment request failed.", data?.code, res.status);
  return data as T;
}

export type CheckoutMethod = "razorpay" | "upi";

export type CreatePaymentOrderResponse = {
  method: CheckoutMethod;
  kind: "deposit" | "full";
  keyId: string;
  testMode: boolean;
  razorpayOrderId: string;
  amountPaise: number;
  currency: "INR";
  expiresAt: string | null;
  customer: { name: string; phone: string; email: string };
  order: PaymentOrderSummary;
};

export const createPaymentOrder = (code: string, method: CheckoutMethod = "razorpay") =>
  postJson<CreatePaymentOrderResponse>("/api/payments/create-order", { code, method });

export const verifyPayment = (code: string, payment: RazorpayPaymentSuccessResponse) =>
  postJson<{ order: PaymentOrderSummary; receipt: PaymentReceipt; refunded: boolean }>("/api/payments/verify", {
    code,
    ...payment,
  });

export const cancelPreorder = (code: string, phone: string, reason?: string) =>
  postJson<{ action: "refund" | "forfeit" | "none"; refundedPaise: number; order: PaymentOrderSummary }>(
    "/api/payments/cancel",
    { code, phone, reason }
  );

export const paymentsAdminApi = <T = any>(token: string | null, action: string, params: Record<string, unknown> = {}) =>
  postJson<T>("/api/payments/admin", { action, ...params }, token || undefined);

// ─── Checkout ────────────────────────────────────────────────────────────────

export type CheckoutOutcome =
  | { status: "paid"; order: PaymentOrderSummary; receipt: PaymentReceipt }
  | { status: "dismissed" }
  | { status: "failed"; message: string };

/** Razorpay Checkout display config: UPI only, or cards/netbanking/wallets without UPI. */
function checkoutDisplayConfig(method: CheckoutMethod) {
  return method === "upi"
    ? {
        display: {
          blocks: { upi: { name: "Pay with UPI", instruments: [{ method: "upi" }] } },
          sequence: ["block.upi"],
          preferences: { show_default_blocks: false },
        },
      }
    : { display: { hide: [{ method: "upi" }], preferences: { show_default_blocks: true } } };
}

const log = (...args: unknown[]) => console.info("[payments]", ...args);

/**
 * Opens Razorpay Checkout for an order paying online (pre-order deposit or full payment)
 * and verifies the result on the server. Flow:
 *   create order (server: razorpay.orders.create, amount from the DB) → Checkout → verify
 *   signature (server, HMAC-SHA256) → order marked paid.
 * Nothing here sets a price, and the key secret never reaches the browser.
 */
export async function payOnline(
  code: string,
  method: CheckoutMethod = "razorpay",
  opts: { onOrderCreated?: (order: CreatePaymentOrderResponse) => void } = {}
): Promise<CheckoutOutcome> {
  log(`1/4 creating Razorpay order for ${code} (${method})`);
  const [loaded, order] = await Promise.all([loadRazorpayScript(), createPaymentOrder(code, method)]);
  log(`2/4 order ${order.razorpayOrderId}: ${order.amountPaise} paise, ${order.kind}, key ${order.keyId.slice(0, 9)}… (${order.testMode ? "test" : "live"} mode)`);
  opts.onOrderCreated?.(order);
  const Razorpay = typeof window !== "undefined" ? (window as any).Razorpay : undefined;
  if (!loaded || !Razorpay) {
    console.error("[payments] Razorpay checkout.js failed to load");
    return { status: "failed", message: "Couldn't load Razorpay Checkout. Disable ad blockers and try again." };
  }

  const secondsLeft = order.expiresAt ? Math.floor((Date.parse(order.expiresAt) - Date.now()) / 1000) : 0;

  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: CheckoutOutcome) => {
      if (!settled) {
        settled = true;
        resolve(outcome);
      }
    };

    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "CafeQ",
      description: order.kind === "deposit" ? `Pre-order deposit ${code}` : `Order ${code}`,
      prefill: {
        name: order.customer.name,
        email: order.customer.email,
        contact: order.customer.phone,
        ...(method === "upi" ? { method: "upi" } : {}),
      },
      notes: { booking_code: code },
      theme: { color: "#c2410c" },
      config: checkoutDisplayConfig(method),
      // Close Checkout when the 15-minute payment window ends (Razorpay minimum is 60s)
      ...(secondsLeft > 60 ? { timeout: secondsLeft } : {}),
      handler: async (response: RazorpayPaymentSuccessResponse) => {
        log(`3/4 payment ${response.razorpay_payment_id} completed, verifying signature on the server`);
        try {
          const verified = await verifyPayment(code, response);
          log(`4/4 verified — order ${code} is ${verified.order.paymentState}`);
          settle({ status: "paid", order: verified.order, receipt: verified.receipt });
        } catch (err) {
          console.error("[payments] verification failed:", err);
          settle({
            status: "failed",
            message:
              err instanceof Error
                ? `${err.message} If money was debited, your order will be confirmed automatically within a few minutes.`
                : "Payment verification failed.",
          });
        }
      },
      modal: {
        ondismiss: () => {
          log(`checkout closed for ${code}${lastError ? ` after a failed attempt: ${lastError}` : " without paying"}`);
          settle(lastError ? { status: "failed", message: lastError } : { status: "dismissed" });
        },
      },
    });
    // Checkout stays open after a failed attempt so the customer can retry in place;
    // only report the failure if they close it without a successful payment.
    let lastError: string | null = null;
    rzp.on("payment.failed", (response: any) => {
      console.warn("[payments] payment attempt failed:", response?.error?.code, response?.error?.description);
      lastError = response?.error?.description || "The payment failed. Please try again.";
    });
    rzp.open();
  });
}

/** Pre-order deposit checkout (kept for existing callers). */
export const payForPreorder = (code: string, method: CheckoutMethod = "razorpay") => payOnline(code, method);
