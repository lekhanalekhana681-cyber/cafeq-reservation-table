import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type BookingInput } from "./bookings.functions";

function getPublicClient() {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type CafeAnalytics = {
  totalBookings: number;
  totalRevenue: number;
  repeatCustomersCount: number;
  mostOrderedItems: { name: string; count: number; revenue: number }[];
  peakHoursDistribution: { hour: string; count: number }[];
  paymentBreakdown: { qrCount: number; cashCount: number; paidCount: number; pendingCount: number };
};

export async function getCafeAnalytics(): Promise<CafeAnalytics> {
  let allBookings: BookingInput[] = [];

  const supabase = getPublicClient();
  if (supabase) {
    const { data } = await supabase.from("bookings").select("*");
    if (data) {
      allBookings = data.map((d) => ({
        code: d.code,
        date: d.date,
        time: d.time,
        party: d.party,
        seating: d.seating,
        name: d.name,
        phone: d.phone,
        items: (d.items as any) || [],
        total: d.total || 0,
        paymentMethod: (d.payment_method as any) || "pay_on_arrival",
        paymentStatus: (d.payment_status as any) || "pending_cash",
        isPeakHour: d.is_peak_hour || false,
      }));
    }
  }

  if (allBookings.length === 0) {
    try {
      allBookings = JSON.parse(localStorage.getItem("cafeq_bookings") || "[]");
    } catch {
      allBookings = [];
    }
  }

  // Aggregate stats
  const totalBookings = allBookings.length;
  const totalRevenue = allBookings.reduce((sum, b) => sum + (b.total || 0), 0);

  // Customer frequency
  const phoneCounts: Record<string, number> = {};
  allBookings.forEach((b) => {
    const p = b.phone.replace(/\D/g, "");
    if (p) phoneCounts[p] = (phoneCounts[p] || 0) + 1;
  });
  const repeatCustomersCount = Object.values(phoneCounts).filter((c) => c > 1).length;

  // Item counts
  const itemMap: Record<string, { count: number; revenue: number }> = {};
  allBookings.forEach((b) => {
    b.items?.forEach((it) => {
      if (!itemMap[it.name]) itemMap[it.name] = { count: 0, revenue: 0 };
      itemMap[it.name]!.count += it.qty;
      itemMap[it.name]!.revenue += it.price * it.qty;
    });
  });

  const mostOrderedItems = Object.entries(itemMap)
    .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Peak hours
  const hourMap: Record<string, number> = {};
  allBookings.forEach((b) => {
    const hr = b.time.split(":")[0] || "09";
    const label = `${hr}:00`;
    hourMap[label] = (hourMap[label] || 0) + 1;
  });

  const peakHoursDistribution = Object.entries(hourMap).map(([hour, count]) => ({ hour, count }));

  // Payment breakdown
  let qrCount = 0;
  let cashCount = 0;
  let paidCount = 0;
  let pendingCount = 0;

  allBookings.forEach((b) => {
    if (b.paymentMethod === "upi_prepay") qrCount++;
    else cashCount++;

    if (b.paymentStatus === "paid") paidCount++;
    else pendingCount++;
  });

  return {
    totalBookings,
    totalRevenue,
    repeatCustomersCount,
    mostOrderedItems,
    peakHoursDistribution,
    paymentBreakdown: { qrCount, cashCount, paidCount, pendingCount },
  };
}
