/**
 * CafeQ chatbot engine — keyword/intent matching, no external AI.
 * Used by POST /api/chatbot and, when that isn't reachable, by the Reservation page widget.
 *
 * Topics (ONLY): reservations (+ timings), menu & prices, pet policy, founders, 18+ cocktails.
 * Everything editable lives in config/chatbot.config.js. Menu items and prices come only from
 * the `menu` passed in (the live menu table) — this file never invents an item or a price.
 */
import { CHATBOT_CONFIG } from "../../config/chatbot.config.js";

const STOPWORDS = new Set(
  "a an the of for is are was what whats how much does do you have your price prices cost costs rate rates rs inr please tell me about on in at to and or can i we get show list give menu item items its it".split(" ")
);

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stem = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const tokens = (s) => normalize(s).split(" ").filter(Boolean).map(stem);
const has = (text, re) => re.test(text);

export const formatPrice = (price) => {
  const n = Number(price);
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
};

/** Live, orderable menu entries only (86'd / malformed rows are left out). */
function liveMenu(menu) {
  return (menu || [])
    .filter((i) => i && i.name && i.category && i.isAvailable !== false && Number.isFinite(Number(i.price)))
    .map((i) => ({ ...i, price: Number(i.price) }));
}

function groupByCategory(items, { ageNote } = {}) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push({
      name: item.name,
      price: formatPrice(item.price),
      ...(item.isVeg === true ? { veg: true } : {}),
    });
  }
  return [...groups.entries()].map(([title, list]) => ({
    title,
    items: list,
    ...(ageNote && /cocktail/i.test(title) ? { note: ageNote } : {}),
  }));
}

/**
 * Menu items named in the text: either the full item name appears in the message, or every
 * meaningful word of the query appears in the item name ("cappuccino" → Cappuccino, Velvet Cappuccino).
 */
export function findMenuItems(text, menu) {
  const msg = normalize(text);
  const exact = menu.filter((i) => ` ${msg} `.includes(` ${normalize(i.name)} `));
  if (exact.length > 0) return exact;
  const query = tokens(msg).filter((t) => !STOPWORDS.has(t) && t.length > 2);
  if (query.length === 0) return [];
  return menu.filter((i) => {
    const nameTokens = tokens(i.name);
    return query.every((q) => nameTokens.some((n) => n === q || (q.length >= 4 && n.startsWith(q))));
  });
}

/** True when the text names a word from any alcoholic menu item ("mojito", "margarita"…). */
function mentionsCocktail(text, menu) {
  if (!menu) return false;
  const words = new Set(tokens(text));
  const generic = new Set(["classic", "glass", "fresh", "iced", "virgin", "house", "special"]);
  return menu.some(
    (i) => i.isAlcoholic === true && tokens(i.name).some((t) => t.length > 3 && !generic.has(t) && words.has(t))
  );
}

// ─── Intent keywords ──────────────────────────────────────────────────────────

const RE = {
  greeting: /^(hi+|hello|hey|hola|namaste|good (morning|afternoon|evening)|help|start|menu please)\b/,
  bookingCode: /\bcq-[a-z0-9]{4}\b/i,
  recipe: /\b(how (do i|to|can i) (make|mix|prepare)|recipe|ingredients ratio|mixology)\b/,
  alcohol:
    /\b(cocktails?|alcohol|alcoholic|liquor|booze|beers?|wines?|whiske?y|vodka|rum|gin|tequila|sangria|margarita|cosmopolitan|drinking age|age limit|legal age|minimum age|age requirement|how old|underage|minors?|id proof|id check|carry id)\b|18\s*\+|18 plus|above 18/,
  ageQuestion: /\b(age|how old|underage|minors?|id proof|id check|carry id|legal)\b|18\s*\+|18 plus|above 18/,
  price: /\b(price|prices|cost|costs|how much|rate|rates|charges?|rs|inr)\b|₹/,
  pet: /\b(pets?|dogs?|cats?|pupp(y|ies)|kittens?|animals?|pet[- ]?friendly)\b/,
  founder: /\b(founders?|founded|co-?founders?|owners?|who (started|created|runs|owns|built)|started cafeq|story behind|behind cafeq)\b/,
  veg: /\b(veg|vegetarian|vegan|plant[- ]based|meat[- ]?free)\b/,
  nonVeg: /\b(non[- ]?veg|non[- ]?vegetarian|chicken|meat)\b/,
  menu: /\b(menu|food|dishes|dish|eat|serve|serving|options?|coffee|coffees|tea|beverages?|drinks?|desserts?|sweets?|cakes?|bakery|snacks?|starters?|bites|sides|pizzas?|pastas?|burgers?|sandwich(es)?|momos?|mocktails?|smoothies?|shakes?|juices?|breakfast|brunch|lunch|mains?|bowls?|salads?)\b/,
  timings: /\b(timings?|hours|opening|closing|open|opens|close|closes|closed|working days?)\b/,
  reservation:
    /\b(book|booking|bookings|reserv\w*|tables?|slots?|availability|available|cancel\w*|modify|reschedul\w*|change|status|party|group|deposit|refund|polic(y|ies)|rules|walk ?ins?|seats?|seating)\b/,
  status: /\b(status|confirmed|my booking|check (my )?(booking|reservation)|track)\b/,
  cancel: /\b(cancel\w*|modify|change|reschedul\w*|edit|postpone|move my)\b/,
  availability: /\b(availab\w*|slots?|free table|vacan\w*|full|time slots?)\b/,
  policy: /\b(polic(y|ies)|rules|deposit|refund|advance|large party|big group|walk ?ins?|laptops?|minimum spend)\b/,
};

const CATEGORY_FILTERS = [
  { re: /\b(coffees?|espresso|latte|hot (drinks?|beverages?)|tea)\b/, needles: ["coffee", "hot beverage"], label: "coffee & hot drinks" },
  { re: /\b(desserts?|sweets?|cakes?|bakery|pastr(y|ies))\b/, needles: ["dessert", "bakery"], label: "desserts" },
  { re: /\b(snacks?|starters?|bites|sides|appetizers?|fries)\b/, needles: ["starter", "snack", "bites"], label: "snacks & starters" },
  { re: /\b(pizzas?|pastas?)\b/, needles: ["pizza", "pasta"], label: "pizza & pasta" },
  { re: /\b(burgers?|sandwich(es)?)\b/, needles: ["burger", "sandwich"], label: "burgers & sandwiches" },
  { re: /\bmomos?\b/, needles: ["momo"], label: "momos" },
  { re: /\bmocktails?\b/, needles: ["mocktail"], label: "mocktails" },
  { re: /\b(cold (drinks?|beverages?)|smoothies?|shakes?|juices?|coolers?)\b/, needles: ["cold"], label: "cold beverages" },
  { re: /\b(mains?|lunch|dinner)\b/, needles: ["mains"], label: "mains" },
  { re: /\b(bowls?|salads?|healthy|fresh)\b/, needles: ["fresh", "bowl"], label: "fresh & bowls" },
  { re: /\b(drinks?|beverages?)\b/, needles: ["beverage", "drinks", "coffee", "mocktail"], label: "drinks" },
];

const QUICK_REPLY_INTENTS = {
  "book a table": "book a table",
  "check availability": "check availability of tables",
  "view menu": "show menu",
  "cocktails (18+)": "cocktails",
  "pet friendly?": "are pets allowed",
  "about founders": "who are the founders",
  timings: "what are your timings",
};

// ─── Answers ──────────────────────────────────────────────────────────────────

function unsureMenu(cfg) {
  return {
    intent: "menu_unavailable",
    reply: `I couldn't load our live menu right now, so I don't want to guess prices. Please check the Menu page or call us on ${cfg.contact.phone}.`,
  };
}

function ageLine(cfg) {
  return `Alcoholic cocktails are served only to guests aged ${cfg.MIN_ALCOHOL_AGE}+, and valid government photo ID may be checked at the venue.`;
}

function answerCocktails(text, menu, cfg) {
  const age = ageLine(cfg);
  const recipe = has(text, RE.recipe);
  if (!menu) {
    return { intent: "cocktail", reply: `${age} I couldn't load the live cocktail list right now — please check the Menu page or call us on ${cfg.contact.phone}.` };
  }
  const cocktails = menu.filter((i) => i.isAlcoholic === true);
  if (cocktails.length === 0) {
    return { intent: "cocktail", reply: `We don't have any cocktails on the menu right now. ${age}` };
  }
  const intro = recipe
    ? `I can't share drink recipes or mixing instructions. ${age}`
    : has(text, RE.ageQuestion)
    ? age
    : `Yes, we serve cocktails. ${age}`;
  return {
    intent: "cocktail",
    reply: `${intro}\nHere are the cocktails on our menu (prices from our live menu). Please drink responsibly — non-alcoholic mocktails are available too.`,
    sections: groupByCategory(cocktails, { ageNote: `${cfg.MIN_ALCOHOL_AGE}+ only · ID may be checked` }),
  };
}

function answerPrice(text, menu, cfg) {
  if (!menu) return unsureMenu(cfg);
  const matches = findMenuItems(text, menu);
  if (matches.length === 0) {
    return {
      intent: "price",
      reply: `I couldn't find that item on our current menu, so I can't give a price. Tap "View menu" to see everything we serve, or call us on ${cfg.contact.phone}.`,
    };
  }
  const shown = matches.slice(0, 8);
  const lines = shown.map((i) => `• ${i.name} — ${formatPrice(i.price)}${i.isAlcoholic ? ` (${cfg.MIN_ALCOHOL_AGE}+ only)` : ""}`);
  const more = matches.length > shown.length ? `\n…and ${matches.length - shown.length} more. Try a more specific name.` : "";
  const alcoholNote = shown.some((i) => i.isAlcoholic) ? `\n${ageLine(cfg)}` : "";
  return { intent: "price", reply: `${lines.join("\n")}${more}${alcoholNote}` };
}

function answerMenu(text, menu, cfg) {
  if (!menu) return unsureMenu(cfg);
  const ageNote = `${cfg.MIN_ALCOHOL_AGE}+ only · ID may be checked`;

  if (has(text, RE.veg) && !has(text, /\bnon[- ]?veg/)) {
    const veg = menu.filter((i) => i.isVeg === true && i.isAlcoholic !== true);
    const vegan = has(text, /\bvegan\b/)
      ? " We mark vegetarian items on the menu; for strictly vegan options please ask our staff."
      : "";
    return veg.length > 0
      ? { intent: "menu_veg", reply: `Here are our vegetarian options (prices from our live menu).${vegan}`, sections: groupByCategory(veg) }
      : { intent: "menu_veg", reply: "I couldn't find vegetarian items on the current menu — please ask our staff." };
  }
  if (has(text, RE.nonVeg)) {
    const nonVeg = menu.filter((i) => i.isVeg === false && i.isAlcoholic !== true);
    return nonVeg.length > 0
      ? { intent: "menu_nonveg", reply: "Here are our non-vegetarian dishes:", sections: groupByCategory(nonVeg) }
      : { intent: "menu_nonveg", reply: "I couldn't find non-vegetarian items on the current menu." };
  }

  const filter = CATEGORY_FILTERS.find((f) => has(text, f.re));
  if (filter) {
    const items = menu.filter(
      (i) => i.isAlcoholic !== true && filter.needles.some((n) => i.category.toLowerCase().includes(n))
    );
    if (items.length > 0) {
      return { intent: "menu_category", reply: `Here are our ${filter.label} (prices from our live menu):`, sections: groupByCategory(items) };
    }
  }

  return {
    intent: "menu",
    reply: "Here's our menu, grouped by category (prices from our live menu):",
    sections: groupByCategory(menu, { ageNote }),
  };
}

function answerPet(cfg) {
  const p = cfg.petPolicy;
  return { intent: "pet", reply: `${p.summary}\n${p.rules.map((r) => `• ${r}`).join("\n")}` };
}

function answerFounder(cfg) {
  const f = cfg.founders;
  const names = f.names.length > 1 ? `${f.names.slice(0, -1).join(", ")} and ${f.names[f.names.length - 1]}` : f.names[0];
  return { intent: "founder", reply: `${cfg.cafeName} was founded by ${names}.\n${f.story}` };
}

function answerTimings(cfg) {
  return {
    intent: "timings",
    reply: `Our opening hours:\n${cfg.timings.map((t) => `• ${t.days}: ${t.hours}`).join("\n")}\nTable reservations are available from ${cfg.reservation.timeSlots[0]} to ${cfg.reservation.timeSlots[cfg.reservation.timeSlots.length - 1]}.`,
  };
}

function policyLines(cfg, settings) {
  const lines = [...cfg.reservation.policies];
  if (settings && settings.preorderPaymentMode && settings.preorderPaymentMode !== "NONE") {
    const amount =
      settings.preorderPaymentMode === "FULL"
        ? "full prepayment"
        : `a ${settings.depositPercent}% deposit (minimum ₹${settings.depositMinInr})`;
    lines.push(
      `Current pre-order rule: ${amount}; free cancellation until ${settings.refundCutoffMinutes} minutes before your time, after which the deposit is non-refundable.`
    );
  }
  return lines;
}

const STATUS_LABELS = {
  pending: "Pending — waiting for the cafe to confirm",
  confirmed: "Confirmed",
  completed: "Completed",
  billed: "Completed and billed",
  cancelled: "Cancelled",
  no_show: "Marked as a no-show",
  pending_payment: "Awaiting online payment",
  expired: "Expired (not paid in time)",
};

async function answerReservation(text, rawText, cfg, ctx) {
  const r = cfg.reservation;
  const code = (rawText.match(RE.bookingCode) || [])[0];

  if (code) {
    if (!ctx.lookupBooking) {
      return { intent: "reservation_status", reply: `I can't look up bookings here right now. ${r.statusCheck}` };
    }
    const booking = await ctx.lookupBooking(code.toUpperCase());
    if (!booking) {
      return { intent: "reservation_status", reply: `I couldn't find a booking with code ${code.toUpperCase()}. Please check the code, or open My Bookings.` };
    }
    const label = STATUS_LABELS[booking.status] || booking.status;
    return {
      intent: "reservation_status",
      reply: `Booking ${code.toUpperCase()}: ${label}.${booking.date ? ` Date: ${booking.date}${booking.time ? ` at ${booking.time}` : ""}.` : ""}`,
    };
  }
  if (has(text, RE.status)) return { intent: "reservation_status", reply: r.statusCheck };
  if (has(text, RE.cancel)) return { intent: "reservation_cancel", reply: r.cancelModify };
  if (has(text, RE.availability)) {
    return { intent: "reservation_availability", reply: `${r.availability}\nBookable time slots: ${r.timeSlots.join(", ")}.` };
  }
  if (has(text, RE.policy)) {
    return { intent: "reservation_policy", reply: `Our reservation policies:\n${policyLines(cfg, ctx.settings).map((l) => `• ${l}`).join("\n")}` };
  }

  const party = Number((text.match(/\b(\d{1,3})\s*(people|persons|guests|pax|members|of us)\b/) || [])[1]);
  const bigGroup =
    party > r.maxPartyOnline ? `\nFor ${party} guests, please call us on ${cfg.contact.phone} — online booking takes up to ${r.maxPartyOnline}.` : "";
  return {
    intent: "reservation_book",
    reply: `Booking a table is easy:\n${r.howToBook.map((s, i) => `${i + 1}. ${s}`).join("\n")}${bigGroup}`,
  };
}

/**
 * Answers one chat message.
 * @param {string} message
 * @param {{ menu?: Array|null, settings?: object|null, lookupBooking?: (code: string) => Promise<object|null>, config?: object }} [ctx]
 *   menu: live menu rows { name, category, price, isVeg, isAlcoholic, isAvailable }; null = couldn't load
 */
export async function answerChat(message, ctx = {}) {
  const cfg = ctx.config || CHATBOT_CONFIG;
  const menu = ctx.menu === null || ctx.menu === undefined ? null : liveMenu(ctx.menu);
  const raw = String(message || "").slice(0, 500);
  const quick = QUICK_REPLY_INTENTS[normalize(raw).replace(/\s*\?$/, "")] || QUICK_REPLY_INTENTS[raw.trim().toLowerCase()];
  const text = normalize(quick || raw) + (/18\s*\+/.test(raw) ? " 18+" : "");

  if (!text || (has(text, RE.greeting) && text.split(" ").length <= 4 && !has(text, RE.menu) && !has(text, RE.price))) {
    return { intent: "welcome", reply: cfg.welcome, quickReplies: cfg.quickReplies };
  }
  if (RE.bookingCode.test(raw)) return answerReservation(text, raw, cfg, ctx);
  if (has(text, RE.alcohol) || (has(text, RE.recipe) && mentionsCocktail(text, menu))) {
    return answerCocktails(text, menu, cfg);
  }
  if (has(text, RE.price)) return answerPrice(text, menu, cfg);
  if (has(text, RE.pet)) return answerPet(cfg);
  if (has(text, RE.founder)) return answerFounder(cfg);
  if (has(text, RE.menu) || has(text, RE.veg)) return answerMenu(text, menu, cfg);
  if (has(text, RE.reservation) && (has(text, RE.availability) || !has(text, RE.timings))) {
    return answerReservation(text, raw, cfg, ctx);
  }
  if (has(text, RE.timings)) return answerTimings(cfg);
  // A bare item name ("cappuccino?") is a price question
  if (menu && menu.some((i) => ` ${text} `.includes(` ${normalize(i.name)} `))) return answerPrice(text, menu, cfg);

  return { intent: "out_of_scope", reply: cfg.outOfScopeReply, quickReplies: cfg.quickReplies };
}
