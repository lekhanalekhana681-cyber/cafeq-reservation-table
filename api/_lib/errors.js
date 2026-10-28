/**
 * Payment errors with an HTTP status and a customer-safe message.
 * Database functions raise short codes (e.g. "ORDER_EXPIRED", "UNKNOWN_MENU_ITEM:Latte");
 * toPaymentError() maps them to friendly messages.
 */
export class PaymentError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PaymentError";
    this.status = status;
    this.code = code;
  }
}

const DB_ERRORS = {
  ORDER_NOT_FOUND: [404, "Order not found."],
  PAYMENT_ORDER_NOT_FOUND: [404, "Payment not found for this order."],
  PAYMENT_NOT_FOUND: [404, "Payment not found."],
  PAYMENT_NOT_REQUIRED: [400, "This order doesn't need an online payment."],
  ORDER_EXPIRED: [410, "This order expired because it wasn't paid within 15 minutes. Please place it again."],
  ORDER_ALREADY_PAID: [409, "This order has already been paid."],
  AMOUNT_MISMATCH: [400, "The paid amount doesn't match the order. Please contact the cafe."],
  NOT_CANCELLABLE: [409, "This order can no longer be cancelled."],
  NOT_COLLECTABLE: [409, "A balance can't be collected for this order."],
  NOTHING_DUE: [409, "Nothing is due on this order."],
  NOTHING_TO_FORFEIT: [409, "Nothing was paid on this order."],
  REFUND_EXCEEDS_PAYMENT: [400, "The refund is larger than what was paid."],
  INVALID_METHOD: [400, "Choose cash or UPI."],
  INVALID_STATUS: [400, "Invalid order status."],
  INVALID_SETTING: [400, "Invalid payment setting."],
  UNKNOWN_MENU_ITEM: [400, "An item in your order is no longer on the menu."],
  ITEM_UNAVAILABLE: [409, "An item in your order is out of stock."],
  INVALID_QUANTITY: [400, "Invalid item quantity."],
};

export function toPaymentError(err) {
  if (err instanceof PaymentError) return err;
  const raw = String(err?.message || "");
  const [code, detail] = raw.split(":");
  const known = DB_ERRORS[code];
  if (known) {
    const message = detail && (code === "UNKNOWN_MENU_ITEM" || code === "ITEM_UNAVAILABLE")
      ? `${known[1].replace(/\.$/, "")}: ${detail.trim()}.`
      : known[1];
    return new PaymentError(known[0], code, message);
  }
  console.error("[payments] unexpected error:", err);
  return new PaymentError(500, "INTERNAL", "Something went wrong with the payment. Please try again.");
}
