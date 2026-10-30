import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { emitKitchenEvent, playNewOrderSound } from "@/lib/kitchen.sync";
import { sendWhatsAppMessage, sendSms } from "@/lib/notifications.functions";
import { dispatchNotification } from "@/lib/notifications";
import {
  getOrCreateBill,
  getSavedBill,
  BillNotAllowedError,
  type StoredReceipt,
} from "@/lib/receipt.service";
import { createAdminNotification } from "@/lib/admin-notifications";
import { logActivity } from "@/lib/audit-logs";
import { getCafeSettings } from "@/lib/settings.functions";
import {
  ORDER_TYPE_VALUES,
  getOrderCharges,
  getOrderTypeDetails,
  normalizeOrderType,
  validateOrderDetails,
} from "@/lib/order-types";
import {
  ITEM_STATUSES,
  ItemTransitionError,
  applyItemTransition,
  backfillItemStatus,
  deriveTicketStatus,
  getNextItemStatus,
  type ItemStatus,
  type TicketStatus,
} from "@/lib/order-items";
import { getKitchenSession } from "@/lib/auth";
import type { PaymentState } from "@/lib/prepayment";
import {
  getAllowedPaymentMethods,
  isOnlinePaymentMethod,
  orderHasPreOrder,
  PAYMENT_METHODS,
  type PaymentMethodId,
} from "@/lib/payment-methods";

export const orderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  qty: z.number().int().min(1),
  price: z.number().min(0),
  prepTimeMinutes: z.number().optional().default(5),
  fulfillment: z.enum(["pre_ordered", "at_table"]).default("pre_ordered"),
  // Legacy "pending"/"done" values are accepted and mapped to the per-item stages
  status: z
    .preprocess(
      (v) => (v === "done" ? "READY" : typeof v === "string" ? v.toUpperCase() : v),
      z.enum(ITEM_STATUSES)
    )
    .default("PENDING"),
  startedAt: z.string().nullable().optional(),
  readyAt: z.string().nullable().optional(),
  servedAt: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
  category: z.string().optional(),
  isVeg: z.boolean().optional(),
});

export type OrderItem = z.infer<typeof orderItemSchema>;
export type KitchenStatus = TicketStatus;
export type { ItemStatus };

// Accepts legacy lowercase values ("dine_in") but always yields the uppercase enum.
const orderTypeSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/[\s-]/g, "_") : v),
  z.enum(ORDER_TYPE_VALUES)
);

const bookingSchema = z.object({
  code: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(1),
  party: z.number().int().min(1).max(20),
  seating: z.string().min(1),
  tableType: z.string().default("window"),
  hasPreorder: z.boolean().default(false),
  estimatedPrepTime: z.number().int().min(0).default(0),
  foodReadyTime: z.string().optional().nullable(),
  isPeakHour: z.boolean().default(false),
  depositRequired: z.boolean().default(false),
  depositAmount: z.number().int().min(0).default(0),
  kitchenLoad: z.enum(["normal", "busy", "high"]).default("normal"),
  name: z.string().min(1).max(100),
  phone: z.string().min(1).max(30),
  customerEmail: z.string().email().optional().nullable(),
  notes: z.string().max(500).optional(),
  dietary: z.array(z.string()).max(10).default([]),
  occasion: z.string().max(50).optional(),
  accessibility: z.array(z.string()).max(10).default([]),
  windowPriority: z.boolean().default(false),
  items: z.array(orderItemSchema).max(50).default([]),
  total: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["pay_on_arrival", "upi_prepay", "online_razorpay", "upi_razorpay"]).default("pay_on_arrival"),
  paymentStatus: z.enum(["pending_cash", "pending_qr", "pending_online", "pending_verification", "paid", "failed", "refunded"]).default("pending_cash"),
  paymentReference: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  // pending_payment / expired are set by the database for pre-orders awaiting online payment
  status: z.enum(["pending", "confirmed", "cancelled", "completed", "billed", "no_show", "pending_payment", "expired"]).default("confirmed"),
  kitchenStatus: z.enum(["new", "preparing", "ready", "completed", "cancelled"]).default("new"),
  orderType: orderTypeSchema.default("DINE_IN"),
  tableNumber: z.string().max(20).optional().nullable(),
  customerName: z.string().max(100).optional().nullable(),
  customerPhone: z.string().max(30).optional().nullable(),
  deliveryAddress: z.string().max(300).optional().nullable(),
  deliveryInstructions: z.string().max(300).optional().nullable(),
  pickupTime: z.string().max(50).optional().nullable(),
  deliveryFee: z.number().min(0).optional().nullable().default(0),
  packagingCharge: z.number().min(0).optional().nullable().default(0),
  cancellationReason: z.string().nullable().optional(),
  cancelledBy: z.enum(["customer", "admin", "kitchen"]).nullable().optional(),
  // Ticket-level kitchen timestamps (ISO). acceptedAt = first item started.
  acceptedAt: z.string().nullable().optional(),
  readyAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  /** When the order was placed — the KDS timer counts from here. */
  createdAt: z.string().nullable().optional(),
  // Pre-order payment (set by the database and /api/payments only; ignored on insert)
  paymentRequired: z.boolean().optional(),
  paymentState: z
    .enum(["UNPAID", "PENDING", "PARTIALLY_PAID", "PAID", "REFUNDED", "PARTIALLY_REFUNDED", "FORFEITED"])
    .optional(),
  totalAmountPaise: z.number().int().nullable().optional(),
  depositDuePaise: z.number().int().optional(),
  amountPaidPaise: z.number().int().optional(),
  balanceDuePaise: z.number().int().nullable().optional(),
  scheduledAt: z.string().nullable().optional(),
  paymentExpiresAt: z.string().nullable().optional(),
  forfeitReason: z.string().nullable().optional(),
});

import { getOutOfStockItemIds } from "@/lib/stock";
import { getStoredMenu } from "@/lib/menu";

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "billed" | "no_show" | "pending_payment" | "expired";

/**
 * Admin order flow: pending → confirmed → completed, no skipping.
 * Mirrors public.order_status_transition_allowed (20261031000000_order_status_flow.sql).
 */
export const ORDER_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: ["billed"],
  billed: [],
  cancelled: [],
  no_show: [],
  pending_payment: ["cancelled"],
  expired: ["cancelled"],
};

export function canTransitionOrderStatus(from: BookingStatus, to: BookingStatus): boolean {
  return from === to || ORDER_STATUS_TRANSITIONS[from]?.includes(to);
}

function statusTransitionMessage(from: string, to: string): string {
  if (from === "pending" && to === "completed") return "Confirm the order before completing it.";
  if (from === "pending" && to === "no_show") return "Confirm the order before marking a no-show.";
  if (from === "cancelled") return "This order was cancelled — it can't be changed, completed or billed.";
  if (from === "billed") return "This order has already been billed and can't be changed.";
  if (to === "billed") return "Use Generate Bill to bill a completed order.";
  if (to === "cancelled" && from === "completed") return "A completed order can no longer be cancelled.";
  return `An order can't go from "${from.replace(/_/g, " ")}" to "${to.replace(/_/g, " ")}".`;
}

/** Clear message for a bill requested out of order. */
function billNotAllowedMessage(status: string): string {
  if (status === "pending") return "Confirm and complete the order before generating the bill.";
  if (status === "confirmed") return "Complete the order before generating the bill.";
  if (status === "cancelled") return "This order was cancelled — it can't be billed.";
  return `A bill can't be generated for an order that is "${status.replace(/_/g, " ")}".`;
}

/**
 * The "Generate Bill" action. Allowed only for a Completed order; generates the bill once,
 * saves it and moves the order to Billed. For an already-Billed order it returns the saved
 * bill, so reopening shows the same bill. Every other status gets a clear error.
 * The database enforces the same rules (20261101000000_billed_status.sql).
 */
export async function generateOrderBill(
  code: string
): Promise<{ success: true; bill: StoredReceipt; status: "billed" } | { success: false; error: string }> {
  const supabase = getPublicClient();
  let booking: BookingInput | null = null;
  if (supabase) {
    const { data } = await supabase.from("bookings").select("*").eq("code", code).maybeSingle();
    if (data) booking = withKitchenState(mapBookingRow(data as BookingRow));
  } else {
    const local = safeGetBookings().find((b) => b.code === code);
    booking = local ? withKitchenState(local) : null;
  }
  if (!booking) return { success: false, error: "Order not found." };

  if (booking.status === "billed") {
    const saved = await getSavedBill(code);
    return saved
      ? { success: true, bill: saved, status: "billed" }
      : { success: false, error: "This order is billed but its saved bill couldn't be found." };
  }
  if (booking.status !== "completed") {
    return { success: false, error: billNotAllowedMessage(booking.status) };
  }

  try {
    const bill = await getOrCreateBill(booking);
    if (!supabase) {
      // Local mode: the database trigger isn't there to mark the order billed
      safeSaveBookings(safeGetBookings().map((b) => (b.code === code ? { ...b, status: "billed" as const } : b)));
    }
    emitKitchenEvent("ORDER_STATUS_CHANGED", { code, bookingStatus: "billed" });
    return { success: true, bill, status: "billed" };
  } catch (err) {
    if (err instanceof BillNotAllowedError) return { success: false, error: billNotAllowedMessage(booking.status) };
    return { success: false, error: err instanceof Error ? err.message : "Could not generate the bill." };
  }
}
export type BookingInput = z.infer<typeof bookingSchema>;

import { getSupabaseClient } from "@/integrations/supabase/client";

export function getPublicClient() {
  const client = getSupabaseClient();
  if (client) return client;

  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

/** Maps the order-type and kitchen columns of a bookings row to BookingInput fields. */
function mapOrderTypeFields(d: Partial<BookingRow>) {
  return {
    orderType: normalizeOrderType(d.order_type),
    tableNumber: d.table_number ?? null,
    customerName: d.customer_name ?? null,
    customerPhone: d.customer_phone ?? null,
    deliveryAddress: d.delivery_address ?? null,
    deliveryInstructions: d.delivery_instructions ?? null,
    pickupTime: d.pickup_time ?? null,
    deliveryFee: Number(d.delivery_fee ?? 0),
    packagingCharge: Number(d.packaging_charge ?? 0),
    kitchenStatus: (d.kitchen_status as KitchenStatus | undefined) ?? "new",
    acceptedAt: d.accepted_at ?? null,
    readyAt: d.ready_at ?? null,
    completedAt: d.completed_at ?? null,
    cancellationReason: d.cancellation_reason ?? null,
    cancelledBy: (d.cancelled_by as BookingInput["cancelledBy"]) ?? null,
    createdAt: d.created_at ?? null,
    paymentRequired: d.payment_required ?? false,
    paymentState: (d.payment_state as PaymentState | undefined) ?? "UNPAID",
    totalAmountPaise: d.total_amount_paise ?? null,
    depositDuePaise: d.deposit_due_paise ?? 0,
    amountPaidPaise: d.amount_paid_paise ?? 0,
    balanceDuePaise: d.balance_due_paise ?? null,
    scheduledAt: d.scheduled_at ?? null,
    paymentExpiresAt: d.payment_expires_at ?? null,
    forfeitReason: d.forfeit_reason ?? null,
  };
}

function mapBookingRow(d: BookingRow): BookingInput {
  return {
    code: d.code,
    date: d.date,
    time: d.time,
    party: d.party,
    seating: d.seating,
    tableType: d.table_type || "window",
    hasPreorder: d.has_preorder || false,
    estimatedPrepTime: d.estimated_prep_time || 0,
    foodReadyTime: d.food_ready_time || null,
    isPeakHour: d.is_peak_hour || false,
    depositRequired: d.deposit_required || false,
    depositAmount: d.deposit_amount || 0,
    kitchenLoad: (d.kitchen_load as "normal" | "busy" | "high") || "normal",
    name: d.name,
    phone: d.phone,
    customerEmail: d.customer_email || undefined,
    notes: d.notes || undefined,
    dietary: d.dietary || [],
    occasion: d.occasion || undefined,
    accessibility: d.accessibility || [],
    windowPriority: d.window_priority || false,
    items: (d.items as OrderItem[]) || [],
    total: d.total || 0,
    paymentMethod: (d.payment_method as BookingInput["paymentMethod"]) || "pay_on_arrival",
    paymentStatus: (d.payment_status as BookingInput["paymentStatus"]) || "pending_cash",
    paymentReference: d.payment_reference || undefined,
    userId: d.user_id || undefined,
    ...mapOrderTypeFields(d),
    status: (d.status as BookingStatus) || "confirmed",
  };
}

/**
 * Normalizes item statuses (backfilling pre-per-item orders from their ticket state)
 * and derives the ticket-level kitchen status from the items.
 */
export function withKitchenState(b: BookingInput): BookingInput {
  const items = (b.items || []).map((item) => ({
    ...item,
    status: backfillItemStatus(item.status, b),
  }));
  let kitchenStatus: KitchenStatus;
  if (b.status === "cancelled") kitchenStatus = "cancelled";
  else if (b.status === "completed" || b.status === "billed") kitchenStatus = "completed";
  else kitchenStatus = items.length > 0 ? deriveTicketStatus(items) : b.kitchenStatus || "new";
  return { ...b, items, kitchenStatus };
}

const memoryBookings = new Map<string, string>();

function safeGetBookings(): BookingInput[] {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("cafeq_bookings");
      return raw ? JSON.parse(raw) : [];
    }
  } catch {
    // fallback
  }
  const rawMem = memoryBookings.get("cafeq_bookings");
  return rawMem ? JSON.parse(rawMem) : [];
}

function safeSaveBookings(bookings: BookingInput[]): void {
  const json = JSON.stringify(bookings);
  memoryBookings.set("cafeq_bookings", json);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("cafeq_bookings", json);
    }
  } catch {
    // fallback
  }
}

export function evaluateSlotAndCustomer({
  date,
  time,
  phone,
  hasPriorBookings,
  existingSlotOrders = 0,
}: {
  date: string;
  time: string;
  phone?: string;
  hasPriorBookings?: boolean;
  existingSlotOrders?: number;
}) {
  const dateObj = new Date(date + "T" + (time.includes(":") ? time : "10:00"));
  const dayOfWeek = isNaN(dateObj.getDay()) ? 0 : dateObj.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const [hourStr, minStr] = time.split(":");
  const hour = parseInt(hourStr || "9", 10);
  const minute = parseInt(minStr || "0", 10);
  const timeMinutes = hour * 60 + minute;

  let isPeakHour = false;
  if (isWeekend) {
    isPeakHour = (timeMinutes >= 510 && timeMinutes <= 780) || (timeMinutes >= 990 && timeMinutes <= 1110);
  } else {
    isPeakHour = (timeMinutes >= 480 && timeMinutes <= 630) || (timeMinutes >= 1020 && timeMinutes <= 1140);
  }

  const isTrustedUser = Boolean(hasPriorBookings);
  const depositRequired = isPeakHour || !isTrustedUser;
  const depositAmount = depositRequired ? 100 : 0;

  let kitchenLoad: "normal" | "busy" | "high" = "normal";
  let kitchenBufferMinutes = 0;

  if (existingSlotOrders >= 6) {
    kitchenLoad = "high";
    kitchenBufferMinutes = 10;
  } else if (existingSlotOrders >= 3 || isPeakHour) {
    kitchenLoad = "busy";
    kitchenBufferMinutes = 5;
  }

  return {
    isPeakHour,
    isTrustedUser,
    depositRequired,
    depositAmount,
    kitchenLoad,
    kitchenBufferMinutes,
  };
}

export async function createBooking({ data }: { data: BookingInput }) {
  const validated = bookingSchema.parse(data);
  const supabase = getPublicClient();

  // Food pre-orders are paid online only (Razorpay or UPI) — never cash.
  // The database enforces the same rule (check_payment_method_rules).
  const hasPreOrder = orderHasPreOrder(validated.items);
  if (hasPreOrder && !(data as Partial<BookingInput>).paymentMethod) {
    validated.paymentMethod = "online_razorpay";
  }
  if (hasPreOrder && !getAllowedPaymentMethods(true).includes(validated.paymentMethod)) {
    throw new Error(
      PAYMENT_METHODS[validated.paymentMethod].cash
        ? "Cash payment is not available for food pre-orders. Please pay online with Razorpay or UPI."
        : "Food pre-orders must be paid online with Razorpay or UPI."
    );
  }
  if (isOnlinePaymentMethod(validated.paymentMethod) && validated.paymentStatus !== "paid") {
    validated.paymentStatus = "pending_online";
  }

  // New orders always start in the kitchen queue with every item pending
  validated.items = validated.items.map((item) => ({
    ...item,
    status: "PENDING" as const,
    startedAt: null,
    readyAt: null,
    servedAt: null,
    cancelledAt: null,
  }));
  validated.kitchenStatus = "new";
  // Every new order waits for an admin to confirm it (the database enforces this too)
  validated.status = "pending";
  validated.createdAt = new Date().toISOString();

  // ─── Order type rules (mirrored by the enforce_order_type_rules DB trigger) ───
  const orderType = validated.orderType;
  validated.customerName = (validated.customerName || validated.name).trim();
  validated.customerPhone = (validated.customerPhone || validated.phone).trim();

  const fieldErrors = validateOrderDetails({
    orderType,
    customerName: validated.customerName,
    customerPhone: validated.customerPhone,
    tableNumber: validated.tableNumber,
    deliveryAddress: validated.deliveryAddress,
    itemCount: validated.items.length,
  });
  const firstFieldError = Object.values(fieldErrors)[0];
  if (firstFieldError) {
    throw new Error(firstFieldError);
  }

  // Charges come from cafe settings; a mismatch means the client total is stale or tampered with.
  const charges = getOrderCharges(orderType, await getCafeSettings());
  if (
    (validated.deliveryFee ?? 0) !== charges.deliveryFee ||
    (validated.packagingCharge ?? 0) !== charges.packagingCharge
  ) {
    throw new Error("Delivery or packaging charges have changed. Please review your order total and try again.");
  }

  // Drop fields that don't belong to this order type
  validated.tableNumber = orderType === "DINE_IN" ? validated.tableNumber!.trim() : null;
  validated.pickupTime = orderType === "TAKEAWAY" ? validated.pickupTime?.trim() || null : null;
  validated.deliveryAddress = orderType === "DELIVERY" ? validated.deliveryAddress!.trim() : null;
  validated.deliveryInstructions =
    orderType === "DELIVERY" ? validated.deliveryInstructions?.trim() || null : null;
  validated.deliveryFee = charges.deliveryFee;
  validated.packagingCharge = charges.packagingCharge;

  // ─── Server-side validation: Ensure no out-of-stock items can be booked/ordered ───
  if (validated.items && validated.items.length > 0) {
    const outOfStockIds = new Set(getOutOfStockItemIds());
    const storedMenu = getStoredMenu();

    let dbMenuMap: Map<string, boolean> | null = null;
    if (supabase) {
      try {
        const { data: dbItems } = await supabase
          .from("menu_items")
          .select("id, name, is_available");
        if (dbItems && dbItems.length > 0) {
          dbMenuMap = new Map();
          for (const item of dbItems) {
            if (item.id) dbMenuMap.set(item.id.toLowerCase(), item.is_available);
            if (item.name) dbMenuMap.set(item.name.toLowerCase(), item.is_available);
          }
        }
      } catch (err) {
        console.warn("Supabase live stock check note:", err);
      }
    }

    const unavailableNames: string[] = [];
    for (const item of validated.items) {
      let unavailable = false;
      if (outOfStockIds.has(item.id)) {
        unavailable = true;
      }
      const stored = storedMenu.find(
        (m) => m.id === item.id || m.name.toLowerCase() === item.name.toLowerCase()
      );
      if (stored && stored.isAvailable === false) {
        unavailable = true;
      }
      if (dbMenuMap) {
        const dbAvailable =
          dbMenuMap.get(item.id.toLowerCase()) ?? dbMenuMap.get(item.name.toLowerCase());
        if (dbAvailable === false) {
          unavailable = true;
        }
      }
      if (unavailable) {
        unavailableNames.push(item.name);
      }
    }

    if (unavailableNames.length > 0) {
      const uniqueNames = Array.from(new Set(unavailableNames));
      throw new Error(
        `Cannot complete reservation: "${uniqueNames.join('", "')}" ${
          uniqueNames.length === 1 ? "is" : "are"
        } currently out of stock. Please remove from your order.`
      );
    }
  }

  if (supabase) {
    const { data: insertedRow, error } = await supabase.from("bookings").insert({
      code: validated.code,
      date: validated.date,
      time: validated.time,
      party: validated.party,
      seating: validated.seating,
      table_type: validated.tableType,
      has_preorder: validated.hasPreorder,
      estimated_prep_time: validated.estimatedPrepTime,
      food_ready_time: validated.foodReadyTime,
      is_peak_hour: validated.isPeakHour,
      deposit_required: validated.depositRequired,
      deposit_amount: validated.depositAmount,
      kitchen_load: validated.kitchenLoad,
      name: validated.name,
      phone: validated.phone,
      customer_email: validated.customerEmail ?? null,
      notes: validated.notes ?? null,
      dietary: validated.dietary,
      occasion: validated.occasion ?? null,
      accessibility: validated.accessibility,
      window_priority: validated.windowPriority,
      items: validated.items,
      total: validated.total,
      payment_method: validated.paymentMethod,
      payment_status: validated.paymentStatus,
      payment_reference: validated.paymentReference ?? null,
      user_id: validated.userId ?? null,
      status: validated.status || "confirmed",
      order_type: validated.orderType,
      table_number: validated.tableNumber,
      customer_name: validated.customerName,
      customer_phone: validated.customerPhone,
      delivery_address: validated.deliveryAddress,
      delivery_instructions: validated.deliveryInstructions,
      pickup_time: validated.pickupTime,
      delivery_fee: validated.deliveryFee,
      packaging_charge: validated.packagingCharge,
      kitchen_status: "new",
    }).select("status, payment_required, total_amount_paise, deposit_due_paise, payment_expires_at, scheduled_at").single();

    if (error) {
      console.error("createBooking error:", error);
      // 23514 = check_violation raised by the enforce_order_type_rules trigger; its message is customer-facing
      const [dbCode, detail] = error.message.split(":");
      throw new Error(
        error.code === "23514"
          ? error.message
          : dbCode === "ITEM_UNAVAILABLE"
          ? `"${detail}" just went out of stock. Please remove it from your order.`
          : dbCode === "UNKNOWN_MENU_ITEM"
          ? `"${detail}" is no longer on the menu. Please remove it from your order.`
          : "Could not save your reservation. Please try again."
      );
    }

    const inserted = insertedRow as Pick<
      BookingRow,
      "payment_required" | "total_amount_paise" | "deposit_due_paise" | "payment_expires_at" | "scheduled_at"
    > | null;

    // The database parked this pre-order until it is paid online: it must not reach
    // the kitchen and the customer isn't confirmed yet (see /api/payments/*).
    if (inserted?.payment_required) {
      return {
        code: validated.code,
        requiresPayment: true as const,
        payment: {
          totalAmountPaise: inserted.total_amount_paise ?? 0,
          depositDuePaise: inserted.deposit_due_paise,
          paymentExpiresAt: inserted.payment_expires_at ?? null,
          scheduledAt: inserted.scheduled_at ?? null,
        },
      };
    }

    // Record customer visit for analytics
    await supabase.rpc("record_customer_visit", {
      _phone: validated.phone,
      _name: validated.name,
      _email: validated.customerEmail || "",
      _amount: validated.total,
    }).then(({ error: rpcErr }) => {
      if (rpcErr) console.warn("Customer visit tracking note:", rpcErr.message);
    });
  } else {
    // Fallback persistence
    try {
      const existing = safeGetBookings();
      existing.push(validated);
      safeSaveBookings(existing);
    } catch {
      // Non-browser fallback
    }
  }

  // Trigger real-time Kitchen display notification if order has food items
  if (validated.items && validated.items.length > 0) {
    emitKitchenEvent("NEW_ORDER", { booking: validated });
    playNewOrderSound();
  }

  // Automatically dispatch reservation confirmed notification across opted-in channels (SMS, Email, WhatsApp)
  const itemsSummary = validated.items && validated.items.length > 0
    ? validated.items.map((i) => `${i.qty}x ${i.name}`).join(", ")
    : undefined;

  dispatchNotification("reservation_confirmed", {
    bookingCode: validated.code,
    customerName: validated.name,
    customerPhone: validated.phone,
    customerEmail: validated.customerEmail || undefined,
    date: validated.date,
    time: validated.time,
    tableType: validated.tableType,
    partySize: validated.party,
    itemsSummary,
    totalAmount: validated.total,
  }).catch((err) => console.warn("Background confirmation notification error:", err));

  // Create in-app admin notification for management console
  const orderTypeLabel = getOrderTypeDetails(orderType).label;
  createAdminNotification({
    title: orderType === "DINE_IN" ? "New Reservation" : `New ${orderTypeLabel} Order`,
    message:
      orderType === "DINE_IN"
        ? `New reservation by ${validated.name} for ${validated.date} at ${validated.time} (${validated.party} ${validated.party === 1 ? "guest" : "guests"}, Table ${validated.tableNumber})`
        : `New ${orderTypeLabel.toLowerCase()} order by ${validated.name} (${validated.customerPhone})${
            orderType === "DELIVERY" ? ` to ${validated.deliveryAddress}` : ` — pickup ${validated.pickupTime || "ASAP"}`
          }`,
    type: "reservation",
    bookingCode: validated.code,
    customerName: validated.name,
  }).catch((err) => console.warn("Admin notification creation error:", err));

  // Record key system activity log
  logActivity({
    user: validated.name || "Customer",
    action: "RESERVATION_CREATED",
    category: "reservation",
    details: `Reservation #${validated.code} booked for ${validated.date} at ${validated.time} (${validated.party} guests, Table: ${validated.tableType}, ${validated.paymentMethod})`,
    status: "success",
  }).catch((err) => console.warn("Activity logging error:", err));

  return { code: validated.code };
}

// Update payment status (e.g. Mark as Paid for QR code or Razorpay)
export async function updateBookingPaymentStatus({
  code,
  status,
  reference,
  method,
}: {
  code: string;
  status: "paid" | "pending_cash" | "pending_qr" | "pending_online" | "pending_verification" | "failed" | "refunded";
  reference?: string;
  /** Switch the payment method too (e.g. to upi_prepay when the customer paid by UPI QR) */
  method?: PaymentMethodId;
}) {
  const supabase = getPublicClient();
  if (supabase) {
    const { error } = await supabase
      .from("bookings")
      .update({
        payment_status: status,
        payment_reference: reference || null,
        paid_amount: status === "paid" ? 1 : 0, // indicates payment recorded
        ...(method ? { payment_method: method } : {}),
      })
      .eq("code", code);

    if (error) {
      console.error("updateBookingPaymentStatus error:", error);
    }
  }

  // Also update local storage fallback
  try {
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    let targetBooking: BookingInput | null = null;
    const updated = existing.map((b) => {
      if (b.code === code) {
        targetBooking = {
          ...b,
          paymentStatus: status as any,
          paymentReference: reference || b.paymentReference,
          ...(method ? { paymentMethod: method } : {}),
        };
        return targetBooking;
      }
      return b;
    });
    localStorage.setItem("cafeq_bookings", JSON.stringify(updated));

    if (status === "paid" && targetBooking) {
      emitKitchenEvent("NEW_ORDER", { booking: targetBooking });
      playNewOrderSound();
    }
  } catch {
    // Non-browser
  }

  return { success: true };
}

/** Customer-facing text for errors raised by the guard_payment_fields trigger. */
function paymentGuardMessage(message: string): string {
  if (message.startsWith("PAID_ORDER_USE_PAYMENTS")) {
    return "This pre-order has been paid. Cancel it through My Bookings (refund policy applies) or Admin › Payments.";
  }
  if (message.startsWith("PAYMENT_REQUIRED")) return "This pre-order hasn't been paid yet.";
  if (message.startsWith("INVALID_STATUS_TRANSITION")) {
    const [from, to] = message.slice("INVALID_STATUS_TRANSITION:".length).split("->").map((s) => s.trim());
    return statusTransitionMessage(from || "", to || "");
  }
  if (message.startsWith("ORDER_NOT_CONFIRMED")) return "Confirm the order first.";
  if (message.startsWith("BILL_NOT_GENERATED")) return "Use Generate Bill to bill a completed order.";
  if (message.startsWith("PAYMENT_FIELDS_READ_ONLY")) return "Payment details can only be changed by the payment system.";
  return "Could not update the booking. Please try again.";
}

export async function cancelBooking({
  code,
  userId,
  reason,
}: {
  code: string;
  userId?: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  let targetBooking: BookingInput | null = null;
  const supabase = getPublicClient();
  if (supabase) {
    let query = supabase.from("bookings").update({ status: "cancelled" }).eq("code", code);
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { error } = await query;
    if (error) {
      console.error("cancelBooking supabase error:", error);
      return { success: false, error: paymentGuardMessage(error.message) };
    }

    const { data } = await supabase.from("bookings").select("*").eq("code", code).maybeSingle();
    if (data) {
      targetBooking = {
        code: data.code,
        date: data.date,
        time: data.time,
        party: data.party,
        seating: data.seating,
        tableType: data.table_type || "window",
        hasPreorder: data.has_preorder || false,
        estimatedPrepTime: data.estimated_prep_time || 0,
        foodReadyTime: data.food_ready_time || null,
        isPeakHour: data.is_peak_hour || false,
        depositRequired: data.deposit_required || false,
        depositAmount: data.deposit_amount || 0,
        kitchenLoad: (data.kitchen_load as any) || "normal",
        name: data.name,
        phone: data.phone,
        customerEmail: data.customer_email || undefined,
        notes: data.notes || undefined,
        dietary: data.dietary || [],
        occasion: data.occasion || undefined,
        accessibility: data.accessibility || [],
        windowPriority: data.window_priority || false,
        items: (data.items as any) || [],
        total: data.total || 0,
        paymentMethod: (data.payment_method as any) || "pay_on_arrival",
        paymentStatus: (data.payment_status as any) || "pending_cash",
        paymentReference: data.payment_reference || undefined,
        userId: data.user_id || undefined,
        ...mapOrderTypeFields(data),
        status: "cancelled",
      };
    }
  }

  // Update in local storage
  try {
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    const updated = existing.map((b) => {
      if (b.code === code) {
        targetBooking = { ...b, status: "cancelled" as const };
        return targetBooking;
      }
      return b;
    });
    localStorage.setItem("cafeq_bookings", JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to cancel in localStorage:", err);
  }

  // Dispatch cancellation notification
  if (targetBooking) {
    dispatchNotification("cancellation", {
      bookingCode: code,
      customerName: targetBooking.name,
      customerPhone: targetBooking.phone,
      customerEmail: targetBooking.customerEmail,
      date: targetBooking.date,
      time: targetBooking.time,
      cancellationReason: reason || "Customer requested cancellation",
    }).catch((err) => console.warn("Cancellation notification error:", err));

    createAdminNotification({
      title: "Reservation Cancelled",
      message: `Reservation #${code} for ${targetBooking.name} was cancelled${reason ? ` (${reason})` : ""}`,
      type: "cancellation",
      bookingCode: code,
      customerName: targetBooking.name,
    }).catch((err) => console.warn("Admin notification error:", err));

    logActivity({
      user: targetBooking.name || "Customer",
      action: "RESERVATION_CANCELLED",
      category: "reservation",
      details: `Reservation #${code} was cancelled${reason ? `: ${reason}` : ""}`,
      status: "warning",
    }).catch((err) => console.warn("Activity logging error:", err));
  }

  return { success: true };
}

export type UserBookingsQuery =
  | string
  | {
      phone?: string;
      userId?: string;
      email?: string;
    };

export async function getUserBookings(query: UserBookingsQuery): Promise<BookingInput[]> {
  const queryObj = typeof query === "string" ? { phone: query } : query;
  const cleanPhone = (queryObj.phone || "").trim();
  const userId = queryObj.userId;
  const cleanEmail = (queryObj.email || "").trim().toLowerCase();

  if (!cleanPhone && !userId && !cleanEmail) return [];

  const supabase = getPublicClient();
  if (supabase) {
    let dbQuery = supabase.from("bookings").select("*").order("created_at", { ascending: false });

    if (userId && cleanEmail && cleanPhone) {
      dbQuery = dbQuery.or(`user_id.eq.${userId},customer_email.eq.${cleanEmail},phone.eq.${cleanPhone}`);
    } else if (userId && cleanEmail) {
      dbQuery = dbQuery.or(`user_id.eq.${userId},customer_email.eq.${cleanEmail}`);
    } else if (userId && cleanPhone) {
      dbQuery = dbQuery.or(`user_id.eq.${userId},phone.eq.${cleanPhone}`);
    } else if (userId) {
      dbQuery = dbQuery.eq("user_id", userId);
    } else if (cleanPhone) {
      dbQuery = dbQuery.eq("phone", cleanPhone);
    } else if (cleanEmail) {
      dbQuery = dbQuery.eq("customer_email", cleanEmail);
    }

    const { data, error } = await dbQuery;

    if (!error && data && data.length > 0) {
      return data.map((d) => withKitchenState(mapBookingRow(d)));
    }
  }

  // Fallback persistence
  try {
    const existing = safeGetBookings();
    return existing
      .filter((b) => {
        if (userId && b.userId === userId) return true;
        if (cleanEmail && b.customerEmail?.toLowerCase() === cleanEmail) return true;
        if (cleanPhone && b.phone.replace(/\D/g, "") === cleanPhone.replace(/\D/g, "")) return true;
        return false;
      })
      .map(withKitchenState);
  } catch {
    return [];
  }
}

export async function updateBookingStatus({
  code,
  status,
}: {
  code: string;
  status: BookingStatus;
}): Promise<{ success: boolean; error?: string }> {
  // Billed is only reached through generateOrderBill (which saves the bill first)
  if (status === "billed") {
    return { success: false, error: statusTransitionMessage("completed", "billed") };
  }
  const supabase = getPublicClient();
  if (supabase) {
    const { error } = await supabase.from("bookings").update({ status }).eq("code", code);
    if (error) {
      console.error("updateBookingStatus error:", error);
      return { success: false, error: paymentGuardMessage(error.message) };
    }
  } else {
    // Local mode: same flow rules the database enforces
    const current = safeGetBookings().find((b) => b.code === code);
    if (current && !canTransitionOrderStatus(current.status || "confirmed", status)) {
      return { success: false, error: statusTransitionMessage(current.status || "confirmed", status) };
    }
  }

  try {
    const existing = safeGetBookings();
    const updated = existing.map((b) => (b.code === code ? { ...b, status } : b));
    safeSaveBookings(updated);
  } catch (err) {
    console.error("Failed to update status in storage:", err);
  }

  // Confirming releases the order to the KDS; refresh other screens in this browser
  emitKitchenEvent("ORDER_STATUS_CHANGED", { code, bookingStatus: status });
  return { success: true };
}

export async function getAllBookings(): Promise<BookingInput[]> {
  const supabase = getPublicClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("date", { ascending: false })
      .order("time", { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((d) => withKitchenState(mapBookingRow(d)));
    }
  }

  try {
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    return [...existing].reverse().map(withKitchenState);
  } catch {
    return [];
  }
}

// ----------------- Kitchen Specific Order Controls -----------------
// Every item moves on its own (PENDING → PREPARING → READY → SERVED, or CANCELLED);
// the ticket's kitchen status is derived from its items after every change.

export type ItemUpdateResult = {
  success: boolean;
  error?: string;
  /** Another station changed the item first; `booking` holds the latest state. */
  conflict?: boolean;
  booking?: BookingInput;
};

type KitchenActor = "customer" | "admin" | "kitchen";

/** Fetches one booking with normalized item statuses. */
async function getKitchenBooking(code: string): Promise<BookingInput | null> {
  const supabase = getPublicClient();
  if (supabase) {
    const { data } = await supabase.from("bookings").select("*").eq("code", code).maybeSingle();
    if (data) return withKitchenState(mapBookingRow(data));
  }
  const local = safeGetBookings().find((b) => b.code === code);
  return local ? withKitchenState(local) : null;
}

/** Applies a derived ticket status and its timestamps to a booking. */
function applyTicketState(
  b: BookingInput,
  items: OrderItem[],
  nowIso: string,
  reason?: string,
  actor?: KitchenActor
): BookingInput {
  const kitchenStatus = deriveTicketStatus(items);
  return {
    ...b,
    items,
    kitchenStatus,
    status: kitchenStatus === "completed" ? "completed" : kitchenStatus === "cancelled" ? "cancelled" : b.status,
    acceptedAt: kitchenStatus !== "new" ? b.acceptedAt || nowIso : b.acceptedAt,
    readyAt: kitchenStatus === "ready" ? b.readyAt || nowIso : b.readyAt,
    completedAt: kitchenStatus === "completed" ? b.completedAt || nowIso : b.completedAt,
    cancellationReason: kitchenStatus === "cancelled" ? reason || b.cancellationReason : b.cancellationReason,
    cancelledBy: kitchenStatus === "cancelled" ? actor || b.cancelledBy : b.cancelledBy,
  };
}

/** Translates kds_set_item_status errors (see the per-item migration) into results. */
async function rpcErrorToResult(code: string, error: { code?: string; message: string }): Promise<ItemUpdateResult> {
  const msg = error.message || "";
  if (msg.startsWith("ITEM_CONFLICT")) {
    return {
      success: false,
      conflict: true,
      error: "Another station already updated this item. The board has been refreshed.",
      booking: (await getKitchenBooking(code)) ?? undefined,
    };
  }
  if (msg.startsWith("INVALID_TRANSITION")) return { success: false, error: "That status change isn't allowed for this item." };
  if (msg.startsWith("ORDER_CANCELLED")) return { success: false, error: "This order has been cancelled." };
  if (msg.startsWith("PAYMENT_REQUIRED")) return { success: false, error: "This pre-order hasn't been paid yet." };
  if (msg.startsWith("ORDER_NOT_CONFIRMED")) return { success: false, error: "This order hasn't been confirmed by the admin yet." };
  if (msg.startsWith("PAID_ORDER_USE_PAYMENTS")) {
    return { success: false, error: "This is a paid pre-order — cancel it from Admin › Payments so the deposit is refunded." };
  }
  if (msg.startsWith("ORDER_NOT_FOUND") || msg.startsWith("ITEM_NOT_FOUND")) {
    return { success: false, error: "Order or item not found." };
  }
  if (error.code === "PGRST202") {
    return { success: false, error: "Kitchen database is out of date — run the latest Supabase migrations." };
  }
  console.error("kds_set_item_status error:", error);
  return { success: false, error: "Could not update the item. Please try again." };
}

/**
 * Moves one or more items of a ticket to `status`.
 * - Only single-step forward moves (or cancelling an unfinished item) are allowed.
 * - Items already at `status` are left alone, so a double tap or two stations
 *   pressing the same button at once is harmless.
 * - With `expectedStatus`, the move is rejected as a conflict if another station
 *   moved the item somewhere else first.
 */
export async function setOrderItemsStatus({
  code,
  itemIds,
  status,
  expectedStatus,
  reason,
  actor = "kitchen",
}: {
  code: string;
  itemIds: string[];
  status: ItemStatus;
  expectedStatus?: ItemStatus;
  reason?: string;
  actor?: KitchenActor;
}): Promise<ItemUpdateResult> {
  if (!getKitchenSession()) {
    return { success: false, error: "Access denied. Please sign in as kitchen staff." };
  }
  if (itemIds.length === 0) return { success: false, error: "No items selected." };

  const nowIso = new Date().toISOString();
  const before = await getKitchenBooking(code);
  if (!before) return { success: false, error: "Order or item not found." };
  let updated: BookingInput;

  const supabase = getPublicClient();
  if (supabase) {
    const { data, error } = await supabase.rpc("kds_set_item_status", {
      _code: code,
      _item_ids: itemIds,
      _next: status,
      _expected: expectedStatus ?? null,
      _reason: reason ?? null,
      _actor: actor,
    });
    if (error || !data) return rpcErrorToResult(code, error ?? { message: "" });
    updated = withKitchenState(mapBookingRow(data as BookingRow));
  } else {
    if (before.status === "pending") {
      return { success: false, error: "This order hasn't been confirmed by the admin yet." };
    }
    if (before.status === "cancelled" && status !== "CANCELLED") {
      return { success: false, error: "This order has been cancelled." };
    }
    for (const id of itemIds) {
      const item = before.items.find((i) => i.id === id);
      if (!item) return { success: false, error: "Order or item not found." };
      if (expectedStatus && item.status !== status && item.status !== expectedStatus) {
        return {
          success: false,
          conflict: true,
          error: "Another station already updated this item. The board has been refreshed.",
          booking: before,
        };
      }
    }
    try {
      updated = applyTicketState(before, applyItemTransition(before.items, itemIds, status, nowIso), nowIso, reason, actor);
    } catch (err) {
      if (err instanceof ItemTransitionError) {
        return { success: false, error: "That status change isn't allowed for this item." };
      }
      throw err;
    }
    safeSaveBookings(safeGetBookings().map((b) => (b.code === code ? updated : b)));
  }

  emitKitchenEvent("ITEM_STATUS_CHANGED", { code, itemIds, status, booking: updated });
  notifyTicketTransition(before.kitchenStatus, updated);
  return { success: true, booking: updated };
}

/** Moves a single item (orderId = booking code). */
export async function updateOrderItemStatus({
  code,
  itemId,
  status,
  expectedStatus,
}: {
  code: string;
  itemId: string;
  status: ItemStatus;
  expectedStatus?: ItemStatus;
}): Promise<ItemUpdateResult> {
  return setOrderItemsStatus({ code, itemIds: [itemId], status, expectedStatus });
}

/** Customer notifications when the derived ticket status advances. */
function notifyTicketTransition(previous: KitchenStatus | undefined, booking: BookingInput) {
  const next = booking.kitchenStatus;
  if (next === previous) return;
  if (previous === "new" && next !== "cancelled") {
    dispatchNotification("order_accepted", {
      bookingCode: booking.code,
      customerName: booking.name,
      customerPhone: booking.phone,
      customerEmail: booking.customerEmail || undefined,
      foodReadyTime: booking.foodReadyTime || undefined,
    }).catch((err) => console.warn("Order accepted notification error:", err));
  }
  if (next === "ready") {
    dispatchNotification("order_ready", {
      bookingCode: booking.code,
      customerName: booking.name,
      customerPhone: booking.phone,
      customerEmail: booking.customerEmail || undefined,
      tableType: booking.tableNumber ? `Table ${booking.tableNumber}` : booking.tableType || "your table",
    }).catch((err) => console.warn("Order ready notification error:", err));
  }
}

const ITEM_TARGET_FOR_TICKET: Partial<Record<KitchenStatus, ItemStatus>> = {
  preparing: "PREPARING",
  ready: "READY",
  completed: "SERVED",
};

/**
 * Ticket-level action, built on item transitions:
 * - "cancelled" cancels every unfinished item (the existing ticket reject).
 * - "preparing" / "ready" / "completed" advance every live item up to that stage
 *   (Start All / Serve All).
 */
export async function updateKitchenOrderStatus({
  code,
  status,
  reason,
  cancelledBy,
}: {
  code: string;
  status: KitchenStatus;
  reason?: string;
  cancelledBy?: KitchenActor;
}): Promise<{ success: boolean; error?: string }> {
  let booking = await getKitchenBooking(code);
  if (!booking) return { success: false, error: "Order not found." };

  if (status === "cancelled") {
    const ids = booking.items.filter((i) => i.status !== "SERVED" && i.status !== "CANCELLED").map((i) => i.id);
    if (ids.length === 0) return { success: false, error: "Every item has already been served." };
    const res = await setOrderItemsStatus({ code, itemIds: ids, status: "CANCELLED", reason, actor: cancelledBy || "kitchen" });
    if (res.success) emitKitchenEvent("ORDER_REJECTED", { code, reason, booking: res.booking });
    return { success: res.success, error: res.error };
  }

  const target = ITEM_TARGET_FOR_TICKET[status];
  if (!target) return { success: false, error: "Tickets cannot be moved back to New." };

  // Step each live item forward one stage at a time until it reaches the target
  for (const stage of ["PREPARING", "READY", "SERVED"] as const) {
    const ids = booking.items.filter((i) => getNextItemStatus(i.status) === stage).map((i) => i.id);
    if (ids.length > 0) {
      const res = await setOrderItemsStatus({ code, itemIds: ids, status: stage });
      if (!res.success || !res.booking) return { success: false, error: res.error };
      booking = res.booking;
    }
    if (stage === target) break;
  }
  return { success: true };
}

/**
 * Sends order ready notification to customer (backward compatible wrapper)
 */
export async function sendOrderReadyNotification(booking: BookingInput): Promise<boolean> {
  if (!booking.phone && !booking.customerEmail) return false;

  const tableInfo = booking.seating ? `Table ${booking.seating}` : booking.tableType || "your table";
  try {
    const result = await dispatchNotification("order_ready", {
      bookingCode: booking.code,
      customerName: booking.name,
      customerPhone: booking.phone,
      customerEmail: booking.customerEmail,
      tableType: tableInfo,
    });
    return Boolean(result.channels.whatsapp?.success || result.channels.sms?.success || result.channels.email?.success);
  } catch (err) {
    console.warn("Could not dispatch ready notification:", err);
    return false;
  }
}

/**
 * Sends reservation reminder notification to customer
 */
export async function sendReservationReminder(booking: BookingInput): Promise<boolean> {
  try {
    const result = await dispatchNotification("reservation_reminder", {
      bookingCode: booking.code,
      customerName: booking.name,
      customerPhone: booking.phone,
      customerEmail: booking.customerEmail,
      date: booking.date,
      time: booking.time,
      tableType: booking.tableType,
      partySize: booking.party,
    });
    return Boolean(result.channels.whatsapp?.success || result.channels.sms?.success || result.channels.email?.success);
  } catch (err) {
    console.warn("Could not dispatch reminder notification:", err);
    return false;
  }
}



