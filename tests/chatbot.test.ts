/**
 * Automated Test Suite for the Reservation page chatbot
 * Tests:
 * 1. The seven required queries: menu, price, pet, founder, cocktail/age, reservation, off-topic.
 * 2. POST /api/chatbot reads menu prices from the database (mocked Supabase REST), never invents.
 * 3. Unsure / unavailable data, recipe requests, quick replies, booking status by code.
 */
import { menu as seedMenu } from "../src/data/menu";
import { answerChat } from "../api/_lib/chatbot-engine.js";
import { CHATBOT_CONFIG } from "../config/chatbot.config.js";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    testsFailed++;
  }
}

const OFF_TOPIC = "I can help with CafeQ reservations, our menu, pet policy, founders, and cocktails. What would you like to know?";

async function runTests() {
  console.log("\n==================================================");
  console.log("  Running CafeQ Reservation Chatbot Test Suite");
  console.log("==================================================\n");

  const menu = seedMenu.map((m) => ({
    name: m.name,
    category: m.category,
    price: m.price,
    isVeg: m.isVeg,
    isAlcoholic: m.isAlcoholic,
    isAvailable: m.isAvailable,
  }));
  const ask = (q: string, extra: Record<string, unknown> = {}) => answerChat(q, { menu, ...extra });
  const itemNames = (a: any) => (a.sections || []).flatMap((s: any) => s.items.map((i: any) => i.name));

  // --------------------------------------------------------------------------
  console.log("Suite 1: Required Queries");

  let a = await ask("show menu");
  const categories = (a.sections || []).map((s: any) => s.title);
  assert(a.intent === "menu" && categories.length > 5, `Menu request → grouped by category (${categories.length} categories)`);
  assert(itemNames(a).length === menu.filter((m) => m.isAvailable !== false).length, "Menu lists every available item with a price");
  const cocktailSection = a.sections!.find((s: any) => /cocktail/i.test(s.title));
  assert(Boolean(cocktailSection?.note?.includes("18+")), "Cocktail category in the menu carries the 18+ note");

  const cappuccino = menu.find((m) => m.name === "Cappuccino")!;
  a = await ask("price of cappuccino");
  assert(a.intent === "price" && a.reply.includes(`Cappuccino — ₹${cappuccino.price}`), `Price query → "${a.reply.split("\n")[0]}"`);

  a = await ask("Are pets allowed?");
  assert(
    a.intent === "pet" && a.reply.includes(CHATBOT_CONFIG.petPolicy.summary) && CHATBOT_CONFIG.petPolicy.rules.every((r) => a.reply.includes(r)),
    "Pet question → policy and rules from the config file"
  );

  a = await ask("who founded CafeQ?");
  assert(
    a.intent === "founder" && CHATBOT_CONFIG.founders.names.every((n) => a.reply.includes(n)) && a.reply.includes(CHATBOT_CONFIG.founders.story),
    "Founder question → names and story from the config file (placeholders until filled in)"
  );

  a = await ask("what is the age limit for cocktails?");
  const alcoholic = menu.filter((m) => m.isAlcoholic && m.isAvailable !== false);
  assert(
    a.intent === "cocktail" && a.reply.includes(`${CHATBOT_CONFIG.MIN_ALCOHOL_AGE}+`) && /ID may be checked/i.test(a.reply),
    "Cocktail/age question → 18+ (MIN_ALCOHOL_AGE) and ID may be checked"
  );
  assert(
    itemNames(a).length === alcoholic.length && alcoholic.every((c) => itemNames(a).includes(c.name)),
    `Cocktail names and prices shown from menu data (${alcoholic.length} cocktails)`
  );

  a = await ask("how do I book a table?");
  assert(a.intent === "reservation_book" && /Reserve page/.test(a.reply), "Reservation question → booking steps");

  for (const q of ["what's the weather today?", "write me a python script", "who won the election?"]) {
    a = await ask(q);
    assert(a.intent === "out_of_scope" && a.reply === OFF_TOPIC, `Off-topic "${q}" → polite redirect`);
  }

  // --------------------------------------------------------------------------
  console.log("\nSuite 2: More Topic Coverage");

  a = await ask("veg options");
  assert(a.intent === "menu_veg" && itemNames(a).length > 0 && menu.filter((m) => itemNames(a).includes(m.name)).every((m) => m.isVeg && !m.isAlcoholic), "Veg options → only vegetarian, non-alcoholic items");
  a = await ask("do you serve cocktails");
  assert(a.intent === "cocktail" && a.reply.startsWith("Yes, we serve cocktails."), "\"Do you serve cocktails\" → yes + age rule");
  a = await ask("how do I make a mojito?");
  assert(a.intent === "cocktail" && /can't share drink recipes/i.test(a.reply), "Recipe request → declined, informative only");
  a = await ask("what time slots are available?");
  assert(a.intent === "reservation_availability" && CHATBOT_CONFIG.reservation.timeSlots.every((t) => a.reply.includes(t)), "Availability → time slots, honest about live availability");
  a = await ask("I want to cancel my reservation");
  assert(a.intent === "reservation_cancel", "Cancel/modify question");
  a = await ask("what is your reservation policy", { settings: { preorderPaymentMode: "DEPOSIT", depositPercent: 30, depositMinInr: 50, refundCutoffMinutes: 30 } });
  assert(a.intent === "reservation_policy" && /30% deposit/.test(a.reply), "Policy question includes the live pre-order deposit rule");
  a = await ask("book a table for 12 people");
  assert(/please call us/i.test(a.reply), "Groups larger than online booking allows → call the cafe");
  a = await ask("status of cq-ab12", { lookupBooking: async (c: string) => (c === "CQ-AB12" ? { status: "confirmed", date: "2026-11-02", time: "19:00" } : null) });
  assert(a.intent === "reservation_status" && a.reply.includes("CQ-AB12: Confirmed"), "Status check by booking code");
  a = await ask("Timings");
  assert(a.intent === "timings" && CHATBOT_CONFIG.timings.every((t) => a.reply.includes(t.hours)), "Timings quick reply → hours from config");
  a = await ask("hi");
  assert(a.intent === "welcome" && JSON.stringify(a.quickReplies) === JSON.stringify(CHATBOT_CONFIG.quickReplies), "Welcome shows the 7 quick replies");
  assert(
    CHATBOT_CONFIG.quickReplies.join("|") === "Book a table|Check availability|View menu|Cocktails (18+)|Pet friendly?|About founders|Timings",
    "Quick replies are exactly the requested ones"
  );
  for (const q of CHATBOT_CONFIG.quickReplies) {
    a = await ask(q);
    assert(a.intent !== "out_of_scope", `Quick reply "${q}" → ${a.intent}`);
  }

  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Never Invents Data");

  a = await ask("price of sushi");
  assert(a.intent === "price" && !/₹/.test(a.reply) && /couldn't find/i.test(a.reply), "Unknown item → says so, no price invented");
  a = await answerChat("show menu", { menu: null });
  assert(a.intent === "menu_unavailable" && !/₹/.test(a.reply) && a.reply.includes(CHATBOT_CONFIG.contact.phone), "Menu can't load → unsure, suggests contacting the cafe");
  a = await answerChat("price of cappuccino", { menu: menu.map((m) => (m.name === "Cappuccino" ? { ...m, isAvailable: false } : m)) });
  assert(!a.reply.split("\n").some((l) => l.startsWith("• Cappuccino — ")), "86'd items are not offered");

  // --------------------------------------------------------------------------
  console.log("\nSuite 4: POST /api/chatbot reads prices from the database");

  const dbRows = [
    { name: "Cappuccino", category: "Hot Beverages", price: "163.00", is_veg: true, is_alcoholic: false, is_available: true },
    { name: "Classic Mojito", category: "Cocktails (18+)", price: "349", is_veg: true, is_alcoholic: true, is_available: true },
  ];
  const seen: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    seen.push(url);
    if (url.includes("/rest/v1/menu_items")) return new Response(JSON.stringify(dbRows), { status: 200 });
    if (url.includes("/rest/v1/cafe_settings")) return new Response("[]", { status: 200 });
    return new Response("[]", { status: 200 });
  };
  Object.assign(process.env, { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "anon_key" });
  const { POST } = await import("../api/chatbot.js");
  const call = async (message: string) => (await POST(new Request("http://x/api/chatbot", { method: "POST", body: JSON.stringify({ message }) }))).json();

  let r = await call("price of cappuccino");
  assert(r.reply.includes("Cappuccino — ₹163") && seen.some((u) => u.includes("/rest/v1/menu_items")), `API price comes from the menu table (DB ₹163, seed ₹${cappuccino.price})`);
  r = await call("which cocktails do you have");
  assert(r.intent === "cocktail" && r.sections?.[0]?.items?.[0]?.price === "₹349", "API cocktail list comes from the menu table");
  r = await call("tell me a joke");
  assert(r.reply === OFF_TOPIC, "API off-topic → redirect");
  const bad = await POST(new Request("http://x/api/chatbot", { method: "POST", body: "not json" }));
  assert(bad.status === 400, "API rejects a malformed request with 400");

  console.log("\n==================================================");
  console.log(`  Tests Completed: ${testsPassed + testsFailed}`);
  console.log(`  Passed: ${testsPassed}`);
  console.log(`  Failed: ${testsFailed}`);
  console.log("==================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
