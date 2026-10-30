/**
 * Payment method rules for checkout.
 * - Options shown, top to bottom: UPI (recommended) → Cards → Netbanking, all through Razorpay.
 *   Table bookings without food also keep Pay at Counter (cash).
 * - Food pre-order in the cart → never cash.
 * - UPI QR (upi_prepay) is the backup under UPI when the gateway fails; staff verify it.
 * Enforced again in the database (check_payment_method_rules, 20261104000000_upi_qr_backup.sql)
 * and in /api/payments/create-order, so the browser can't bypass it.
 */

export type PaymentMethodId = "online_razorpay" | "upi_razorpay" | "upi_prepay" | "pay_on_arrival";

export type PaymentMethodInfo = {
  id: PaymentMethodId;
  label: string;
  description: string;
  /** Paid online through Razorpay Checkout and verified on the server */
  online: boolean;
  /** Razorpay Checkout method to open (online methods only) */
  checkoutMethod?: "razorpay" | "upi";
  cash: boolean;
};

export const PAYMENT_METHODS: Record<PaymentMethodId, PaymentMethodInfo> = {
  online_razorpay: {
    id: "online_razorpay",
    label: "Razorpay",
    description: "Cards, netbanking & wallets — instant digital receipt",
    online: true,
    checkoutMethod: "razorpay",
    cash: false,
  },
  upi_razorpay: {
    id: "upi_razorpay",
    label: "UPI",
    description: "Google Pay, PhonePe, Paytm or any UPI app (via Razorpay)",
    online: true,
    checkoutMethod: "upi",
    cash: false,
  },
  upi_prepay: {
    id: "upi_prepay",
    label: "UPI QR",
    description: "Scanned the cafe's UPI QR — staff verify the payment",
    online: false,
    cash: false,
  },
  pay_on_arrival: {
    id: "pay_on_arrival",
    label: "Pay at Counter (Cash)",
    description: "Order confirmed for counter payment",
    online: false,
    cash: true,
  },
};

const PREORDER_METHODS: PaymentMethodId[] = ["upi_razorpay", "online_razorpay", "upi_prepay"];
const TABLE_ONLY_METHODS: PaymentMethodId[] = ["upi_razorpay", "online_razorpay", "upi_prepay", "pay_on_arrival"];

/** The payment methods this order may be stored with. */
export function getAllowedPaymentMethods(hasPreOrder: boolean): PaymentMethodId[] {
  return hasPreOrder ? PREORDER_METHODS : TABLE_ONLY_METHODS;
}

/** True when the order has food to prepare ahead (mirrors public.order_has_preorder). */
export function orderHasPreOrder(items: Array<{ fulfillment?: string | null }>): boolean {
  return items.some((i) => (i.fulfillment ?? "pre_ordered") === "pre_ordered");
}

/**
 * The method to keep after the cart changes: the current one if still allowed,
 * otherwise Razorpay (e.g. cash was selected and the guest added food).
 */
export function resolvePaymentMethod(current: PaymentMethodId, hasPreOrder: boolean): PaymentMethodId {
  return getAllowedPaymentMethods(hasPreOrder).includes(current) ? current : "online_razorpay";
}

export const isOnlinePaymentMethod = (id: string): boolean => PAYMENT_METHODS[id as PaymentMethodId]?.online === true;

// ─── Checkout options (what the customer picks) ─────────────────────────────

export type PaymentOptionId = "upi" | "card" | "netbanking" | "cash";

export type PaymentOptionInfo = {
  id: PaymentOptionId;
  label: string;
  description: string;
  /** How the order is stored */
  method: PaymentMethodId;
  /** Razorpay Checkout opens on just this method */
  checkoutMethod?: "upi" | "card" | "netbanking";
  recommended?: boolean;
  cash: boolean;
};

export const PAYMENT_OPTIONS: Record<PaymentOptionId, PaymentOptionInfo> = {
  upi: {
    id: "upi",
    label: "UPI",
    description: "Google Pay, PhonePe, Paytm or any UPI app",
    method: "upi_razorpay",
    checkoutMethod: "upi",
    recommended: true,
    cash: false,
  },
  card: {
    id: "card",
    label: "Cards",
    description: "Credit or debit card — Visa, Mastercard, RuPay",
    method: "online_razorpay",
    checkoutMethod: "card",
    cash: false,
  },
  netbanking: {
    id: "netbanking",
    label: "Netbanking",
    description: "Pay from your bank account — all major banks",
    method: "online_razorpay",
    checkoutMethod: "netbanking",
    cash: false,
  },
  cash: {
    id: "cash",
    label: "Pay at Counter (Cash)",
    description: "Order confirmed for counter payment",
    method: "pay_on_arrival",
    cash: true,
  },
};

/** Options in display order: UPI first (recommended), then Cards, then Netbanking; cash for table-only. */
export function getPaymentOptions(hasPreOrder: boolean): PaymentOptionId[] {
  return hasPreOrder ? ["upi", "card", "netbanking"] : ["upi", "card", "netbanking", "cash"];
}

/** Keeps the current option if still offered, otherwise UPI (the recommended one). */
export function resolvePaymentOption(current: PaymentOptionId, hasPreOrder: boolean): PaymentOptionId {
  return getPaymentOptions(hasPreOrder).includes(current) ? current : "upi";
}
