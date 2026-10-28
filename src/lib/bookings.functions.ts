import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { emitKitchenEvent, playNewOrderSound } from "@/lib/kitchen.sync";
import { sendWhatsAppMessage, sendSms } from "@/lib/notifications.functions";
import { dispatchNotification } from "@/lib/notifications";
import { verifyRazorpayPaymentSignature } from "@/lib/razorpay.service";
import { storeReceipt, generateReceiptNumber } from "@/lib/receipt.service";
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

export const orderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  qty: z.number().int().min(1),
  price: z.number().min(0),
  prepTimeMinutes: z.number().optional().default(5),
  fulfillment: z.enum(["pre_ordered", "at_table"]).default("pre_ordered"),
  status: z.enum(["pending", "done"]).default("pending"),
  category: z.string().optional(),
  isVeg: z.boolean().optional(),
});

export type OrderItem = z.infer<typeof orderItemSchema>;
export type KitchenStatus = "new" | "preparing" | "ready" | "completed" | "cancelled";

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
  paymentMethod: z.enum(["pay_on_arrival", "upi_prepay", "online_razorpay"]).default("pay_on_arrival"),
  paymentStatus: z.enum(["pending_cash", "pending_qr", "pending_online", "paid", "failed", "refunded"]).default("pending_cash"),
  paymentReference: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  status: z.enum(["confirmed", "cancelled", "completed", "no_show"]).default("confirmed"),
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
  cancellationReason: z.string().optional(),
  cancelledBy: z.enum(["customer", "admin", "kitchen"]).optional(),
  acceptedAt: z.string().optional(),
  readyAt: z.string().optional(),
  completedAt: z.string().optional(),
});

import { getOutOfStockItemIds } from "@/lib/stock";
import { getStoredMenu } from "@/lib/menu";

export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";
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

/** Maps the order-type columns of a bookings row to BookingInput fields. */
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
  };
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
    const { error } = await supabase.from("bookings").insert({
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
    });

    if (error) {
      console.error("createBooking error:", error);
      // 23514 = check_violation raised by the enforce_order_type_rules trigger; its message is customer-facing
      throw new Error(
        error.code === "23514" ? error.message : "Could not save your reservation. Please try again."
      );
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

// ─── Razorpay Online Payment Verification & Receipt Flow ───────────────────────

export async function verifyAndCompleteRazorpayPayment({
  code,
  orderId,
  paymentId,
  signature,
}: {
  code: string;
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<{ success: boolean; error?: string; receipt?: any }> {
  // 1. Verify signature
  const verification = await verifyRazorpayPaymentSignature({
    orderId,
    paymentId,
    signature,
  });

  if (!verification.verified) {
    // Record failed payment attempt
    await updateBookingPaymentStatus({
      code,
      status: "failed",
      reference: paymentId,
    });
    return { success: false, error: verification.error || "Payment verification failed" };
  }

  // 2. Fetch booking details to compute receipt
  let booking: BookingInput | null = null;
  const supabase = getPublicClient();
  if (supabase) {
    const { data } = await supabase.from("bookings").select("*").eq("code", code).maybeSingle();
    if (data) {
      booking = {
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
        paymentMethod: "online_razorpay",
        paymentStatus: "paid",
        paymentReference: paymentId,
        userId: data.user_id || undefined,
        ...mapOrderTypeFields(data),
        status: (data.status as any) || "confirmed",
      };
    }
  }

  if (!booking) {
    try {
      const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
      booking = existing.find((b) => b.code === code) || null;
    } catch {
      // Local error
    }
  }

  // 3. Mark payment as paid in DB & localStorage
  await updateBookingPaymentStatus({
    code,
    status: "paid",
    reference: paymentId,
  });

  if (!booking) {
    return { success: true };
  }

  // 4. Calculate Taxes and Generate Digital Receipt
  const total = booking.total;
  const deposit = booking.depositAmount || 0;
  const itemsTotal = total - deposit;
  const taxAmount = Math.round(itemsTotal * 0.05 * 100) / 100; // 5% GST
  const subtotal = itemsTotal - taxAmount;
  const cgst = Math.round((taxAmount / 2) * 100) / 100;
  const sgst = Math.round((taxAmount / 2) * 100) / 100;
  const receiptNumber = generateReceiptNumber(code);

  const receiptRecord = await storeReceipt({
    receiptNumber,
    bookingCode: code,
    orderId,
    paymentId,
    paymentMethod: "Razorpay (Online UPI/Card/Wallet)",
    paymentStatus: "paid",
    date: booking.date,
    time: booking.time,
    customerName: booking.name,
    customerPhone: booking.phone,
    customerEmail: booking.customerEmail,
    tableType: booking.tableType,
    partySize: booking.party,
    items: booking.items || [],
    subtotal: Math.max(0, subtotal),
    cgst,
    sgst,
    taxAmount,
    depositAmount: deposit,
    total,
    createdAt: new Date().toISOString(),
  });

  // 5. Trigger payment_success notification with PDF receipt attached
  dispatchNotification("payment_success", {
    bookingCode: code,
    customerName: booking.name,
    customerPhone: booking.phone,
    customerEmail: booking.customerEmail,
    totalAmount: total,
    receiptNumber,
    paymentId,
    attachments: receiptRecord.pdfDataUri
      ? [
          {
            filename: `CafeQ-Receipt-${code}.pdf`,
            contentType: "application/pdf",
            dataUri: receiptRecord.pdfDataUri,
          },
        ]
      : undefined,
  }).catch((err) => console.warn("Background payment success notification error:", err));

  return { success: true, receipt: receiptRecord };
}

// Update payment status (e.g. Mark as Paid for QR code or Razorpay)
export async function updateBookingPaymentStatus({
  code,
  status,
  reference,
}: {
  code: string;
  status: "paid" | "pending_cash" | "pending_qr" | "pending_online" | "failed" | "refunded";
  reference?: string;
}) {
  const supabase = getPublicClient();
  if (supabase) {
    const { error } = await supabase
      .from("bookings")
      .update({
        payment_status: status,
        payment_reference: reference || null,
        paid_amount: status === "paid" ? 1 : 0, // indicates payment recorded
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
      return data.map((d) => ({
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
        paymentMethod: (d.payment_method as "pay_on_arrival" | "upi_prepay") || "pay_on_arrival",
        paymentStatus: (d.payment_status as "pending_cash" | "pending_qr" | "paid") || "pending_cash",
        paymentReference: d.payment_reference || undefined,
        userId: d.user_id || undefined,
        ...mapOrderTypeFields(d),
        status: (d.status as "confirmed" | "cancelled") || "confirmed",
      }));
    }
  }

  // Fallback persistence
  try {
    const existing = safeGetBookings();
    return existing.filter((b) => {
      if (userId && b.userId === userId) return true;
      if (cleanEmail && b.customerEmail?.toLowerCase() === cleanEmail) return true;
      if (cleanPhone && b.phone.replace(/\D/g, "") === cleanPhone.replace(/\D/g, "")) return true;
      return false;
    });
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
  const supabase = getPublicClient();
  if (supabase) {
    const { error } = await supabase.from("bookings").update({ status }).eq("code", code);
    if (error) {
      console.error("updateBookingStatus error:", error);
    }
  }

  try {
    const existing = safeGetBookings();
    const updated = existing.map((b) => (b.code === code ? { ...b, status } : b));
    safeSaveBookings(updated);
  } catch (err) {
    console.error("Failed to update status in storage:", err);
  }

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
      return data.map((d) => ({
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
        paymentMethod: (d.payment_method as "pay_on_arrival" | "upi_prepay") || "pay_on_arrival",
        paymentStatus: (d.payment_status as "pending_cash" | "pending_qr" | "paid") || "pending_cash",
        paymentReference: d.payment_reference || undefined,
        userId: d.user_id || undefined,
        ...mapOrderTypeFields(d),
        status: (d.status as BookingStatus) || "confirmed",
      }));
    }
  }

  try {
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    return [...existing].reverse();
  } catch {
    return [];
  }
}

// ----------------- Kitchen Specific Order Controls -----------------

export async function updateKitchenOrderStatus({
  code,
  status,
  reason,
  cancelledBy,
}: {
  code: string;
  status: KitchenStatus;
  reason?: string;
  cancelledBy?: "customer" | "admin" | "kitchen";
}): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  // If status is completed or cancelled, sync overall booking status as well
  const overallBookingStatus: BookingStatus =
    status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "confirmed";

  const supabase = getPublicClient();
  if (supabase) {
    try {
      const updatePayload: Record<string, any> = {
        status: overallBookingStatus,
      };
      if (status === "preparing") updatePayload["accepted_at"] = now;
      if (status === "ready") updatePayload["food_ready_time"] = now;
      if (status === "completed") updatePayload["completed_at"] = now;
      if (reason) updatePayload["notes"] = reason;

      await supabase.from("bookings").update(updatePayload).eq("code", code);
    } catch (err) {
      console.warn("Supabase kitchen status update note:", err);
    }
  }

  try {
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    let updatedBooking: BookingInput | null = null;

    const updated = existing.map((b) => {
      if (b.code === code) {
        const itemStatus = status === "completed" || status === "ready" ? "done" : b.items?.every(i => i.status === "done") ? "done" : "pending";
        const newItems = b.items?.map(i => ({
          ...i,
          status: status === "completed" ? "done" as const : i.status || "pending",
        })) || [];

        updatedBooking = {
          ...b,
          kitchenStatus: status,
          status: overallBookingStatus,
          acceptedAt: status === "preparing" ? now : b.acceptedAt,
          readyAt: status === "ready" ? now : b.readyAt,
          completedAt: status === "completed" ? now : b.completedAt,
          cancellationReason: reason || b.cancellationReason,
          cancelledBy: cancelledBy || b.cancelledBy,
          items: newItems,
        };
        return updatedBooking;
      }
      return b;
    });

    localStorage.setItem("cafeq_bookings", JSON.stringify(updated));

    // Emit event to KDS, customer order tracking, and admin dashboard
    emitKitchenEvent("ORDER_STATUS_CHANGED", { code, status, reason, booking: updatedBooking });

    // Multi-channel lifecycle notifications (SMS, Email, WhatsApp)
    if (updatedBooking) {
      if (status === "preparing") {
        dispatchNotification("order_accepted", {
          bookingCode: code,
          customerName: updatedBooking.name,
          customerPhone: updatedBooking.phone,
          customerEmail: updatedBooking.customerEmail,
          foodReadyTime: updatedBooking.foodReadyTime || undefined,
        }).catch((err) => console.warn("Order accepted notification error:", err));
      } else if (status === "ready") {
        dispatchNotification("order_ready", {
          bookingCode: code,
          customerName: updatedBooking.name,
          customerPhone: updatedBooking.phone,
          customerEmail: updatedBooking.customerEmail,
          tableType: updatedBooking.seating ? `Table ${updatedBooking.seating}` : updatedBooking.tableType || "your table",
        }).catch((err) => console.warn("Order ready notification error:", err));
      }
    }

    return { success: true };
  } catch (err) {
    console.error("Failed to update kitchen order status in localStorage:", err);
    return { success: false, error: "Failed to update order status." };
  }
}

export async function updateOrderItemStatus({
  code,
  itemId,
  status,
}: {
  code: string;
  itemId: string;
  status: "pending" | "done";
}): Promise<{ success: boolean }> {
  try {
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    let updatedBooking: BookingInput | null = null;

    const updated = existing.map((b) => {
      if (b.code === code) {
        const items = b.items?.map((item) => {
          if (item.id === itemId) {
            return { ...item, status };
          }
          return item;
        }) || [];

        // If all items are done, can advance kitchenStatus to ready
        const allDone = items.length > 0 && items.every((i) => i.status === "done");
        const nextKitchenStatus = allDone && b.kitchenStatus === "preparing" ? "ready" : b.kitchenStatus;

        updatedBooking = {
          ...b,
          items,
          kitchenStatus: nextKitchenStatus,
          readyAt: nextKitchenStatus === "ready" && !b.readyAt ? new Date().toISOString() : b.readyAt,
        };
        return updatedBooking;
      }
      return b;
    });

    localStorage.setItem("cafeq_bookings", JSON.stringify(updated));
    emitKitchenEvent("ITEM_STATUS_CHANGED", { code, itemId, status, booking: updatedBooking });
    return { success: true };
  } catch {
    return { success: false };
  }
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



