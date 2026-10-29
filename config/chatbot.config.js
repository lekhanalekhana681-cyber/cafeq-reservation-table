/**
 * CafeQ chatbot — editable content.
 * The Reservation page chatbot (and POST /api/chatbot) answers ONLY from this file plus the
 * live menu in the database. Edit the text below; no code changes needed.
 * Menu items and prices are never written here — they always come from the menu table.
 */
export const CHATBOT_CONFIG = {
  cafeName: "CafeQ",

  contact: {
    phone: "+91 7349540534",
    address: "Old Tumkur Road, Near Sir C V Raman Road, Malleshwaram, Bangalore.",
  },

  // Opening hours (same as the Visit page)
  timings: [
    { days: "Mon–Thu", hours: "7am – 7pm" },
    { days: "Fri", hours: "7am – 10pm" },
    { days: "Sat", hours: "8am – 10pm" },
    { days: "Sun", hours: "8am – 5pm" },
  ],

  reservation: {
    // Bookable slots shown on the Reserve page (keep in sync with `times` in src/routes/reserve.tsx)
    timeSlots: ["07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "11:00", "12:00", "13:00", "14:30", "16:00", "17:30"],
    maxPartyOnline: 8,
    howToBook: [
      "Choose Dine-in, Takeaway or Delivery at the top of the Reserve page.",
      "For Dine-in, pick a date, party size, time slot and table type.",
      "Optionally pre-order food so it's ready when you arrive.",
      "Enter your name and phone, then confirm. You'll get a booking code like CQ-AB12.",
    ],
    availability:
      "Pick your date and party size on this page to see the available time slots and table types. I can't confirm live table availability in chat — if a slot is full, the booking won't go through and you can choose another.",
    statusCheck:
      "Open My Bookings (top menu) to see your bookings and their status, or send me your booking code (e.g. CQ-AB12) and I'll check it.",
    cancelModify:
      "To cancel, open My Bookings and press Cancel on the booking. To change the date, time or party size, cancel and book again, or call us. Orders that the cafe has already completed can't be cancelled.",
    policies: [
      "New bookings are confirmed by our team; you'll see the status in My Bookings.",
      "Groups of 9 or more: please call us to book.",
      "Pre-orders (food prepared ahead for a later time) may need an online deposit; the exact amount and the free-cancellation cutoff are shown at checkout.",
      "Laptops are welcome until 11am; after that tables go to shared seating.",
      "Walk-ins are always welcome, subject to availability.",
    ],
  },

  petPolicy: {
    allowed: true,
    summary: "Yes — CafeQ is pet friendly! Leashed, well-behaved pets are welcome at our outdoor courtyard seating.",
    rules: [
      "Pets are allowed in the outdoor seating area only.",
      "Please keep pets on a leash at all times.",
      "Please keep pets off the furniture.",
      "No pets in the kitchen or food-preparation areas.",
    ],
  },

  // TODO(cafe): replace the placeholders below with the real founder names and story.
  founders: {
    names: ["[Founder name 1]", "[Founder name 2]"],
    story: "[One-line founder story — edit `founders.story` in config/chatbot.config.js]",
  },

  // Alcoholic cocktails are served only to guests at or above this age; valid ID may be checked.
  MIN_ALCOHOL_AGE: 18,

  quickReplies: ["Book a table", "Check availability", "View menu", "Cocktails (18+)", "Pet friendly?", "About founders", "Timings"],

  welcome:
    "Hi! I'm the CafeQ assistant. I can help with table reservations, our menu and prices, pet policy, our founders, and our 18+ cocktails.",

  outOfScopeReply: "I can help with CafeQ reservations, our menu, pet policy, founders, and cocktails. What would you like to know?",
};

export default CHATBOT_CONFIG;
