/**
 * Payment method rules for checkout.
 * - Food pre-order in the cart → online only: Razorpay (cards/netbanking/wallets) or UPI (via Razorpay).
 * - Table booking only → the existing options (Razorpay, UPI QR, pay at the cafe).
 * Enforced again in the database (check_payment_method_rules, 20261102000000_online_payment_methods.sql)
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
    label: "QR Code Payment (UPI)",
    description: "Scan with a UPI app on the confirmation page & mark as paid",
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

const PREORDER_METHODS: PaymentMethodId[] = ["online_razorpay", "upi_razorpay"];
const TABLE_ONLY_METHODS: PaymentMethodId[] = ["online_razorpay", "upi_prepay", "pay_on_arrival"];

/** The payment methods to offer for this order. */
export function getAllowedPaymentMethods(hasPreOrder: boolean): PaymentMethodId[] {
  return hasPreOrder ? PREORDER_METHODS : TABLE_ONLY_METHODS;
}

/** True when the order has food to prepare ahead (mirrors public.order_has_preorder). */
export function orderHasPreOrder(items: Array<{ fulfillment?: string | null }>): boolean {
  return items.some((i) => (i.fulfillment ?? "pre_ordered") === "pre_ordered");
}

/**
 * The method to keep selected after the cart changes: the current one if still allowed,
 * otherwise Razorpay (e.g. cash was selected and the guest added food).
 */
export function resolvePaymentMethod(current: PaymentMethodId, hasPreOrder: boolean): PaymentMethodId {
  return getAllowedPaymentMethods(hasPreOrder).includes(current) ? current : "online_razorpay";
}

export const isOnlinePaymentMethod = (id: string): boolean => PAYMENT_METHODS[id as PaymentMethodId]?.online === true;
