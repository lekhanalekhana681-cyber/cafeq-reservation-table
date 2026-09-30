import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const orderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  qty: z.number().int().min(1),
  price: z.number().int().min(0),
  prepTimeMinutes: z.number().optional().default(5),
  fulfillment: z.enum(["pre_ordered", "at_table"]).default("pre_ordered"),
});

export type OrderItem = z.infer<typeof orderItemSchema>;

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
  paymentMethod: z.enum(["pay_on_arrival", "upi_prepay"]).default("pay_on_arrival"),
  paymentStatus: z.enum(["pending_cash", "pending_qr", "paid"]).default("pending_cash"),
  paymentReference: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  status: z.enum(["confirmed", "cancelled", "completed", "no_show"]).default("confirmed"),
});

export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";
export type BookingInput = z.infer<typeof bookingSchema>;

function getPublicClient() {
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
    });

    if (error) {
      console.error("createBooking error:", error);
      throw new Error("Could not save your reservation. Please try again.");
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
    // Local fallback persistence
    try {
      const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
      existing.push(validated);
      localStorage.setItem("cafeq_bookings", JSON.stringify(existing));
    } catch {
      // Non-browser fallback
    }
  }

  return { code: validated.code };
}

// Update payment status (e.g. Mark as Paid for QR code)
export async function updateBookingPaymentStatus({
  code,
  status,
  reference,
}: {
  code: string;
  status: "paid" | "pending_cash" | "pending_qr";
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
    const updated = existing.map((b) => {
      if (b.code === code) {
        return { ...b, paymentStatus: status, paymentReference: reference || b.paymentReference };
      }
      return b;
    });
    localStorage.setItem("cafeq_bookings", JSON.stringify(updated));
  } catch {
    // Non-browser
  }

  return { success: true };
}

export async function cancelBooking({
  code,
  userId,
}: {
  code: string;
  userId?: string;
}): Promise<{ success: boolean; error?: string }> {
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
  }

  // Update in local storage
  try {
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    const updated = existing.map((b) => {
      if (b.code === code) {
        return { ...b, status: "cancelled" as const };
      }
      return b;
    });
    localStorage.setItem("cafeq_bookings", JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to cancel in localStorage:", err);
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

    if (userId) {
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
        status: (d.status as "confirmed" | "cancelled") || "confirmed",
      }));
    }
  }

  // Fallback to local storage
  try {
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
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
    const existing: BookingInput[] = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    const updated = existing.map((b) => (b.code === code ? { ...b, status } : b));
    localStorage.setItem("cafeq_bookings", JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to update status in localStorage:", err);
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

