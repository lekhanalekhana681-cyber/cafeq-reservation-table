import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ─── Configurable constants ───────────────────────────────────────────────────
export const EVENT_REGISTRATION_FEE = 299; // ₹ per person — change here only

// ─── Types ────────────────────────────────────────────────────────────────────
export type EventItem = {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  event_time: string | null;
  image_url: string | null;
  price: number | null;
  booking_link: string | null;
  active?: boolean;
};

export type EventRegistration = {
  id: string;
  event_id: string;
  event_title: string;
  name: string;
  phone: string;
  email: string;
  attendees: number;
  total_amount: number;
  payment_method: "upi_prepay" | "pay_on_arrival";
  payment_status: "pending_qr" | "pending_cash" | "paid";
  transaction_ref?: string;
  registered_at: string;
};

// ─── Default events (10 curated café events) ─────────────────────────────────
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

const defaultEvents: EventItem[] = [
  {
    id: "evt-1",
    title: "Latte Art Workshop",
    description:
      "A hands-on session with our head barista. Learn to pour hearts, tulips and rosettas. All skill levels welcome — just show up curious.",
    event_date: daysFromNow(7),
    event_time: "10:00",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-2",
    title: "Coffee Tasting & Brewing Masterclass",
    description:
      "Explore single-origin beans from three continents. Learn pour-over, AeroPress and cold brew techniques with our certified Q-grader.",
    event_date: daysFromNow(12),
    event_time: "11:00",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-3",
    title: "Open Mic Night",
    description:
      "Grab the mic. Poetry, stand-up, music, spoken word — all forms welcome. Sign up at the door or DM us to reserve a slot.",
    event_date: daysFromNow(14),
    event_time: "19:30",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-4",
    title: "Book Club Meetup",
    description:
      "This month's read: \"Butter\" by Asako Yuzuki. Bring your thoughts, annotations and appetite — we'll pair the discussion with pastries.",
    event_date: daysFromNow(18),
    event_time: "17:00",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-5",
    title: "Acoustic Live Music Evening",
    description:
      "Intimate live sets by local artists in our courtyard. Expect folk, indie and bossa nova under string lights with your favourite brew.",
    event_date: daysFromNow(21),
    event_time: "18:30",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-6",
    title: "Paint & Sip Session",
    description:
      "Canvas, brushes and a curated café menu. No experience needed — just bring your imagination. Materials provided.",
    event_date: daysFromNow(25),
    event_time: "15:00",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-7",
    title: "Trivia Night",
    description:
      "Test your knowledge across categories: food & drink, pop culture, geography and more. Teams of up to 4. Winner gets a tab on us.",
    event_date: daysFromNow(28),
    event_time: "20:00",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-8",
    title: "Weekend Brunch Special",
    description:
      "Extended brunch spread with a live stations, DIY avocado toast bar and complimentary cold brew for every table. Reservations recommended.",
    event_date: daysFromNow(30),
    event_time: "09:00",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-9",
    title: "Barista Training (Beginner)",
    description:
      "Start from scratch. Learn espresso fundamentals, milk texturing and basic recipes. You'll pull your own shots and take home a bag of beans.",
    event_date: daysFromNow(35),
    event_time: "10:00",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
  {
    id: "evt-10",
    title: "Festive/Holiday Themed Meetup",
    description:
      "Celebrate with a themed evening — seasonal menu, décor and curated playlist. Dress festive, bring friends, leave full and happy.",
    event_date: daysFromNow(42),
    event_time: "18:00",
    image_url: null,
    price: EVENT_REGISTRATION_FEE,
    booking_link: null,
    active: true,
  },
];

// ─── Supabase client helper ───────────────────────────────────────────────────
function getPublicClient() {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
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

// ─── Fetch events ─────────────────────────────────────────────────────────────
export async function getEvents(): Promise<EventItem[]> {
  const supabase = getPublicClient();
  if (!supabase) return defaultEvents;

  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, event_date, event_time, image_url, price, booking_link")
    .eq("active", true)
    .order("event_date", { ascending: true });

  if (error || !data || data.length === 0) {
    if (error) console.error("getEvents error:", error);
    return defaultEvents;
  }
  return data;
}

// ─── Register for event ───────────────────────────────────────────────────────
export async function registerForEvent(
  reg: Omit<EventRegistration, "id" | "registered_at">
): Promise<EventRegistration> {
  const id = `reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const registered_at = new Date().toISOString();
  const full: EventRegistration = { ...reg, id, registered_at };

  const supabase = getPublicClient();
  if (supabase) {
    try {
      await (supabase as any)
        .from("event_registrations")
        .insert([full]);
    } catch (e) {
      console.warn("Supabase insert failed, falling back to localStorage", e);
    }
  }

  // Always persist to localStorage as fallback
  const existing: EventRegistration[] = JSON.parse(
    localStorage.getItem("cafeq_event_registrations") ?? "[]"
  );
  existing.push(full);
  localStorage.setItem("cafeq_event_registrations", JSON.stringify(existing));

  return full;
}

export async function updateEventRegistrationPayment(
  id: string,
  status: "paid",
  transaction_ref?: string
): Promise<void> {
  const supabase = getPublicClient();
  if (supabase) {
    try {
      await (supabase as any)
        .from("event_registrations")
        .update({ payment_status: status, transaction_ref })
        .eq("id", id);
    } catch (e) {
      console.warn("Supabase update failed", e);
    }
  }

  const existing: EventRegistration[] = JSON.parse(
    localStorage.getItem("cafeq_event_registrations") ?? "[]"
  );
  const idx = existing.findIndex((r) => r.id === id);
  if (idx !== -1) {
    existing[idx].payment_status = status;
    if (transaction_ref) existing[idx].transaction_ref = transaction_ref;
    localStorage.setItem("cafeq_event_registrations", JSON.stringify(existing));
  }
}
