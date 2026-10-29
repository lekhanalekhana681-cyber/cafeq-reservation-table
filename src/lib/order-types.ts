/**
 * Order Type & Lifecycle Status Utilities
 * Supports three order types:
 * - Dine-in (DINE_IN): Placed → Preparing → Served
 * - Takeaway (TAKEAWAY): Placed → Preparing → Ready for pickup → Completed
 * - Delivery (DELIVERY): Placed → Preparing → Out for delivery → Delivered
 *
 * The validation rules here are shared by the checkout form and createBooking,
 * and are mirrored by the `enforce_order_type_rules` trigger in Supabase.
 */

export const ORDER_TYPE_VALUES = ["DINE_IN", "TAKEAWAY", "DELIVERY"] as const;

export type OrderType = (typeof ORDER_TYPE_VALUES)[number];

export const DEFAULT_DELIVERY_FEE = 40;
export const DEFAULT_PACKAGING_CHARGE = 0;

export interface OrderTypeDetails {
  type: OrderType;
  label: "Dine-in" | "Takeaway" | "Delivery";
  description: string;
  badgeClass: string;
  iconName: "Utensils" | "ShoppingBag" | "Bike";
}

/**
 * Normalizes any order type string (legacy "dine_in", "take-away", etc.) to the
 * uppercase enum value. Missing or unknown values fall back to DINE_IN, which is
 * what every order placed before order types existed was.
 */
export function normalizeOrderType(raw?: string | null): OrderType {
  if (!raw) return "DINE_IN";
  const clean = raw.trim().toUpperCase().replace(/[\s-]/g, "_");
  if (clean === "TAKEAWAY" || clean === "TAKE_AWAY") return "TAKEAWAY";
  if (clean === "DELIVERY") return "DELIVERY";
  return "DINE_IN";
}

/**
 * Returns UI metadata (label, styling, icon name) for a given order type.
 */
export function getOrderTypeDetails(raw?: string | null): OrderTypeDetails {
  const norm = normalizeOrderType(raw);
  switch (norm) {
    case "TAKEAWAY":
      return {
        type: "TAKEAWAY",
        label: "Takeaway",
        description: "Pickup at Cafe Counter",
        badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
        iconName: "ShoppingBag",
      };
    case "DELIVERY":
      return {
        type: "DELIVERY",
        label: "Delivery",
        description: "Direct Doorstep Delivery",
        badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
        iconName: "Bike",
      };
    case "DINE_IN":
    default:
      return {
        type: "DINE_IN",
        label: "Dine-in",
        description: "Fresh Table Service",
        badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        iconName: "Utensils",
      };
  }
}

/**
 * Maps a booking's overall status + kitchen status to the type-specific label.
 * Admin-set booking statuses (cancelled, no-show, completed) take precedence over
 * the kitchen status, which defaults to "new" and may never have been advanced.
 */
export function getOrderStatusLabel(orderType?: string | null, status?: string | null, kitchenStatus?: string | null): string {
  const normType = normalizeOrderType(orderType);
  const bookingStatus = (status || "").toLowerCase();
  const kitchen = (kitchenStatus || "").toLowerCase();

  if (bookingStatus === "cancelled" || kitchen === "cancelled") return "Cancelled";
  if (bookingStatus === "no_show") return "No-Show";
  if (bookingStatus === "pending") return "Pending";

  const steps = getOrderTypePipelineSteps(normType);
  const finalStep = steps[steps.length - 1];
  if (bookingStatus === "completed" || kitchen === "completed") return finalStep;

  if (kitchen === "preparing") return "Preparing";
  if (kitchen === "ready") {
    if (normType === "TAKEAWAY") return "Ready for pickup";
    if (normType === "DELIVERY") return "Out for delivery";
    return "Plated / Ready";
  }
  return "Placed";
}

/**
 * Returns the sequence of lifecycle steps for a given order type.
 */
export function getOrderTypePipelineSteps(orderType?: string | null): string[] {
  const normType = normalizeOrderType(orderType);
  switch (normType) {
    case "TAKEAWAY":
      return ["Placed", "Preparing", "Ready for pickup", "Completed"];
    case "DELIVERY":
      return ["Placed", "Preparing", "Out for delivery", "Delivered"];
    case "DINE_IN":
    default:
      return ["Placed", "Preparing", "Served"];
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Indian mobile number: optional +91 / 91 / 0 prefix, then 10 digits starting 6-9.
 * Spaces, dashes and brackets are ignored.
 */
export function isValidPhone(raw?: string | null): boolean {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits);
}

export function isValidPincode(raw?: string | null): boolean {
  return /^[1-9]\d{5}$/.test((raw || "").trim());
}

/** Finds a 6-digit Indian pincode inside a free-form address string. */
export function extractPincode(address?: string | null): string | null {
  const match = (address || "").match(/(?:^|\D)([1-9]\d{5})(?!\d)/);
  return match ? match[1] : null;
}

export type OrderDetailsInput = {
  orderType: OrderType;
  customerName?: string | null;
  customerPhone?: string | null;
  tableNumber?: string | null;
  /** Full single-line address (as stored). Used when the split fields are absent. */
  deliveryAddress?: string | null;
  /** Split address fields from the checkout form. */
  deliveryStreet?: string | null;
  deliveryPincode?: string | null;
  itemCount: number;
};

export type OrderFieldErrors = Partial<
  Record<"name" | "phone" | "tableNumber" | "deliveryStreet" | "deliveryPincode" | "cart", string>
>;

/**
 * Validates the fields required for the chosen order type.
 * Returns a map of field → message; an empty object means the order is valid.
 */
export function validateOrderDetails(input: OrderDetailsInput): OrderFieldErrors {
  const errors: OrderFieldErrors = {};

  if (!input.customerName?.trim()) {
    errors.name = "Please enter your name.";
  }
  if (!input.customerPhone?.trim()) {
    errors.phone = "Please enter your phone number.";
  } else if (!isValidPhone(input.customerPhone)) {
    errors.phone = "Enter a valid 10-digit mobile number (e.g. +91 98765 43210).";
  }

  switch (input.orderType) {
    case "DINE_IN":
      if (!input.tableNumber?.trim()) {
        errors.tableNumber = "Table number is required for Dine-in (e.g. 4 or T-12).";
      }
      break;
    case "TAKEAWAY":
      if (input.itemCount === 0) {
        errors.cart = "Your cart is empty. Add at least one item to place a takeaway order.";
      }
      break;
    case "DELIVERY": {
      if (input.itemCount === 0) {
        errors.cart = "Your cart is empty. Add at least one item to place a delivery order.";
      }
      const hasSplitFields = input.deliveryStreet !== undefined || input.deliveryPincode !== undefined;
      if (hasSplitFields) {
        if (!input.deliveryStreet?.trim()) {
          errors.deliveryStreet = "Street address is required for delivery.";
        }
        if (!isValidPincode(input.deliveryPincode)) {
          errors.deliveryPincode = "Enter a valid 6-digit pincode.";
        }
      } else if (!input.deliveryAddress?.trim()) {
        errors.deliveryStreet = "Delivery address is required for delivery.";
      } else if (!extractPincode(input.deliveryAddress)) {
        errors.deliveryPincode = "Delivery address must include a valid 6-digit pincode.";
      }
      break;
    }
  }

  return errors;
}

/** Joins the split checkout address fields into the single stored address line. */
export function formatDeliveryAddress(street: string, landmark: string, pincode: string): string {
  return [street.trim(), landmark.trim(), pincode.trim() ? `PIN ${pincode.trim()}` : ""]
    .filter(Boolean)
    .join(", ");
}

// ─── Charges ──────────────────────────────────────────────────────────────────

/**
 * Extra charges per order type, in whole rupees (bookings.total is an integer).
 * Delivery pays the delivery fee, takeaway pays the packaging charge, dine-in pays neither.
 */
export function getOrderCharges(
  orderType: OrderType,
  settings?: { deliveryFee?: number | null; packagingCharge?: number | null } | null
): { deliveryFee: number; packagingCharge: number } {
  const toRupees = (val: number | null | undefined, fallback: number) =>
    Number.isFinite(val) && (val as number) >= 0 ? Math.round(val as number) : fallback;

  return {
    deliveryFee: orderType === "DELIVERY" ? toRupees(settings?.deliveryFee, DEFAULT_DELIVERY_FEE) : 0,
    packagingCharge: orderType === "TAKEAWAY" ? toRupees(settings?.packagingCharge, DEFAULT_PACKAGING_CHARGE) : 0,
  };
}
