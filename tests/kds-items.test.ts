/**
 * Automated Test Suite for CafeQ per-item Kitchen (KDS) statuses
 * Tests:
 * 1. Item transitions and the ticket status derived from its items.
 * 2. Legacy backfill, progress text, timer formatting and prep-time KPI.
 * 3. End-to-end: a 3-item ticket moved one item at a time until it auto-completes.
 * 4. Edge cases: conflicts between stations, double clicks, cancellations,
 *    single-item tickets, invalid jumps and staff authorization.
 */

// Mock localStorage for node environment
const mockStorage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => {
    mockStorage[key] = String(val);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const k in mockStorage) delete mockStorage[k];
  },
  key: (i: number) => Object.keys(mockStorage)[i] || null,
  length: Object.keys(mockStorage).length,
};

// Mock window and CustomEvent (jsPDF needs atob/btoa at import time)
(global as any).btoa = (str: string) => Buffer.from(str, "binary").toString("base64");
(global as any).atob = (b64: string) => Buffer.from(b64, "base64").toString("binary");
(global as any).window = {
  btoa: (global as any).btoa,
  atob: (global as any).atob,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(global as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params: any = {}) {
    this.type = type;
    this.detail = params.detail;
  }
};

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

async function runTests() {
  console.log("\n==================================================");
  console.log("  Running CafeQ Per-Item KDS Test Suite");
  console.log("==================================================\n");

  // Dynamic import after mocks
  const {
    canTransitionItem,
    deriveTicketStatus,
    applyItemTransition,
    backfillItemStatus,
    formatItemProgress,
    formatElapsed,
    averagePrepMinutes,
  } = await import("../src/lib/order-items");
  const { seedDefaultKitchen, loginKitchen, logoutKitchen } = await import("../src/lib/auth");
  const { createBooking, getAllBookings, updateOrderItemStatus, setOrderItemsStatus, updateKitchenOrderStatus, updateBookingStatus } =
    await import("../src/lib/bookings.functions");

  // --------------------------------------------------------------------------
  // SUITE 1: Transitions & derived ticket status
  // --------------------------------------------------------------------------
  console.log("Suite 1: Transitions & Derived Ticket Status");

  assert(canTransitionItem("PENDING", "PREPARING"), "PENDING → PREPARING allowed");
  assert(canTransitionItem("PREPARING", "READY"), "PREPARING → READY allowed");
  assert(canTransitionItem("READY", "SERVED"), "READY → SERVED allowed");
  assert(!canTransitionItem("PENDING", "READY"), "PENDING → READY (skipping prep) rejected");
  assert(!canTransitionItem("READY", "PREPARING"), "READY → PREPARING (backwards) rejected");
  assert(canTransitionItem("PREPARING", "CANCELLED"), "Unfinished item can be cancelled");
  assert(!canTransitionItem("SERVED", "CANCELLED"), "Served item cannot be cancelled");

  const s = (...statuses: string[]) => statuses.map((status) => ({ status }));
  assert(deriveTicketStatus(s("PENDING", "PENDING")) === "new", "All items PENDING → ticket NEW");
  assert(deriveTicketStatus(s("PREPARING", "PENDING")) === "preparing", "Any item PREPARING → IN PREP");
  assert(deriveTicketStatus(s("READY", "PENDING")) === "preparing", "Mixed READY + PENDING → IN PREP");
  assert(deriveTicketStatus(s("READY", "READY", "CANCELLED")) === "ready", "All non-cancelled READY → READY");
  assert(deriveTicketStatus(s("READY", "SERVED")) === "ready", "READY + SERVED (nothing cooking) → READY");
  assert(deriveTicketStatus(s("SERVED", "SERVED", "CANCELLED")) === "completed", "All non-cancelled SERVED → COMPLETED");
  assert(deriveTicketStatus(s("CANCELLED", "CANCELLED")) === "cancelled", "All items cancelled → CANCELLED");

  const moved = applyItemTransition([{ id: "a", status: "PENDING" }, { id: "b", status: "PENDING" }], ["a"], "PREPARING", "2026-10-29T10:00:00.000Z");
  assert(moved[0].status === "PREPARING" && moved[0].startedAt === "2026-10-29T10:00:00.000Z", "Transition stamps startedAt");
  assert(moved[1].status === "PENDING", "Other items untouched by a transition");
  let threw = false;
  try {
    applyItemTransition([{ id: "a", status: "PENDING" }], ["a"], "SERVED");
  } catch {
    threw = true;
  }
  assert(threw, "applyItemTransition throws on an invalid jump");

  // --------------------------------------------------------------------------
  // SUITE 2: Backfill, progress, timer, KPIs
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Legacy Backfill, Progress & Time Helpers");

  assert(backfillItemStatus("pending", { kitchenStatus: "preparing" }) === "PREPARING", "Legacy item on an in-prep ticket → PREPARING");
  assert(backfillItemStatus("done", { kitchenStatus: "preparing" }) === "READY", "Legacy checked item on an in-prep ticket → READY");
  assert(backfillItemStatus(undefined, { kitchenStatus: "completed" }) === "SERVED", "Legacy item on a completed ticket → SERVED");
  assert(backfillItemStatus("pending", { status: "cancelled" }) === "CANCELLED", "Legacy item on a cancelled booking → CANCELLED");
  assert(backfillItemStatus("READY", { kitchenStatus: "new" }) === "READY", "Already-migrated status is kept");

  assert(formatItemProgress(s("READY", "SERVED", "PREPARING")) === "2 of 3 items ready", 'Progress text "2 of 3 items ready"');
  assert(formatItemProgress(s("SERVED", "CANCELLED")) === "1 of 1 item served", "Cancelled items are excluded from progress");

  assert(formatElapsed(75) === "01:15", "Timer under an hour formats as mm:ss");
  assert(formatElapsed(3 * 3600 + 5 * 60 + 9) === "3:05:09", "Timer over an hour formats as h:mm:ss");
  assert(formatElapsed(-40) === "00:00", "Negative elapsed time clamps to 00:00");

  assert(
    averagePrepMinutes([
      { id: "a", startedAt: "2026-10-29T10:00:00Z", readyAt: "2026-10-29T10:06:00Z" },
      { id: "b", startedAt: "2026-10-29T10:00:00Z", readyAt: "2026-10-29T10:10:00Z" },
      { id: "c", startedAt: "2026-10-29T10:00:00Z" },
    ]) === 8,
    "Avg prep time = mean of per-item startedAt → readyAt (items not ready ignored)"
  );
  assert(averagePrepMinutes([]) === null, "Avg prep time is null when nothing has been readied");

  // --------------------------------------------------------------------------
  // SUITE 3: End-to-end, one item at a time
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: 3-Item Ticket Moved One Item at a Time");

  await seedDefaultKitchen();
  await loginKitchen({ identifier: "Kitchen", password: "Kitchen@123" });

  const code = "CQ-ITEM-01";
  await createBooking({
    data: {
      code,
      date: new Date().toISOString().slice(0, 10),
      time: "12:00",
      party: 2,
      seating: "T-07",
      tableNumber: "T-07",
      tableType: "window",
      name: "Neha Rao",
      phone: "+91 98765 43210",
      items: [
        { id: "hot-chocolate", name: "Hot Chocolate", qty: 1, price: 180, prepTimeMinutes: 4, fulfillment: "pre_ordered", status: "SERVED" },
        { id: "chicken-steamed-momos", name: "Chicken Steamed Momos", qty: 1, price: 220, prepTimeMinutes: 10, fulfillment: "pre_ordered" },
        { id: "french-fries", name: "French Fries", qty: 2, price: 120, prepTimeMinutes: 6, fulfillment: "pre_ordered" },
      ],
      total: 640,
      orderType: "DINE_IN",
    } as any,
  });

  const get = async () => (await getAllBookings()).find((b) => b.code === code)!;
  const blocked = await updateOrderItemStatus({ code, itemId: "hot-chocolate", status: "PREPARING", expectedStatus: "PENDING" });
  assert(!blocked.success && /confirmed/i.test(blocked.error || ""), "Kitchen cannot start items before the admin confirms the order");
  await updateBookingStatus({ code, status: "confirmed" });
  const statusOf = async () => (await get()).items.map((i) => i.status).join(",");

  let t = await get();
  assert(t.kitchenStatus === "new" && (await statusOf()) === "PENDING,PENDING,PENDING", "New ticket: every item PENDING (client-sent status ignored)");
  assert(Boolean(t.createdAt), "Ticket records createdAt for the KDS timer");

  let res = await updateOrderItemStatus({ code, itemId: "hot-chocolate", status: "PREPARING", expectedStatus: "PENDING" });
  t = await get();
  assert(res.success && (await statusOf()) === "PREPARING,PENDING,PENDING", "Start item 1 only — the other two stay PENDING (NEW column)");
  assert(t.kitchenStatus === "preparing" && Boolean(t.acceptedAt), "Ticket derived as IN PREP with acceptedAt");

  await updateOrderItemStatus({ code, itemId: "hot-chocolate", status: "READY", expectedStatus: "PREPARING" });
  await updateOrderItemStatus({ code, itemId: "chicken-steamed-momos", status: "PREPARING", expectedStatus: "PENDING" });
  t = await get();
  assert(
    (await statusOf()) === "READY,PREPARING,PENDING" && t.kitchenStatus === "preparing",
    "Hot Chocolate READY, Momos PREPARING, Fries PENDING — ticket spans all three columns"
  );

  // Two staff press the same item at once: the second gets a conflict, nothing is applied twice
  const [a, b] = await Promise.all([
    updateOrderItemStatus({ code, itemId: "chicken-steamed-momos", status: "READY", expectedStatus: "PREPARING" }),
    updateOrderItemStatus({ code, itemId: "chicken-steamed-momos", status: "READY", expectedStatus: "PREPARING" }),
  ]);
  assert(a.success && b.success, "Same action pressed twice at once is idempotent (both succeed, one change)");
  res = await updateOrderItemStatus({ code, itemId: "chicken-steamed-momos", status: "PREPARING", expectedStatus: "PENDING" });
  assert(!res.success && res.conflict === true && res.booking !== undefined, "Stale action on an item another station moved → conflict with fresh ticket");

  res = await updateOrderItemStatus({ code, itemId: "french-fries", status: "READY" });
  assert(!res.success && (await statusOf()).endsWith("PENDING"), "Invalid jump PENDING → READY rejected, item unchanged");

  await updateOrderItemStatus({ code, itemId: "french-fries", status: "PREPARING", expectedStatus: "PENDING" });
  await updateOrderItemStatus({ code, itemId: "french-fries", status: "READY", expectedStatus: "PREPARING" });
  t = await get();
  assert(t.kitchenStatus === "ready" && Boolean(t.readyAt), "All items READY → ticket READY with readyAt");

  await setOrderItemsStatus({ code, itemIds: ["hot-chocolate", "chicken-steamed-momos"], status: "SERVED", expectedStatus: "READY" });
  t = await get();
  assert(t.kitchenStatus === "ready", "Two of three served, one still READY → ticket stays READY");
  await updateOrderItemStatus({ code, itemId: "french-fries", status: "SERVED", expectedStatus: "READY" });
  t = await get();
  assert(
    t.kitchenStatus === "completed" && t.status === "completed" && Boolean(t.completedAt),
    "Last item served → ticket auto-completes (booking status completed)"
  );
  assert(t.items.every((i) => i.startedAt && i.readyAt && i.servedAt), "Every item has startedAt, readyAt and servedAt");

  // --------------------------------------------------------------------------
  // SUITE 4: Cancellation & authorization edge cases
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Cancellation & Authorization");

  const code2 = "CQ-ITEM-02";
  await createBooking({
    data: {
      code: code2,
      date: new Date().toISOString().slice(0, 10),
      time: "12:30",
      party: 1,
      seating: "T-02",
      tableNumber: "T-02",
      tableType: "window",
      name: "Arjun",
      phone: "+91 91234 56789",
      items: [
        { id: "cafe-latte", name: "Cafe Latte", qty: 1, price: 180, prepTimeMinutes: 5, fulfillment: "pre_ordered" },
        { id: "tiramisu", name: "Tiramisu", qty: 1, price: 260, prepTimeMinutes: 3, fulfillment: "pre_ordered" },
      ],
      total: 440,
      orderType: "DINE_IN",
    } as any,
  });
  const get2 = async () => (await getAllBookings()).find((b) => b.code === code2)!;
  await updateBookingStatus({ code: code2, status: "confirmed" });

  await updateOrderItemStatus({ code: code2, itemId: "tiramisu", status: "CANCELLED", expectedStatus: "PENDING" });
  let t2 = await get2();
  assert(t2.kitchenStatus === "new", "Cancelling one item (86'd) leaves the rest of the ticket in NEW");
  await updateOrderItemStatus({ code: code2, itemId: "cafe-latte", status: "PREPARING" });
  await updateOrderItemStatus({ code: code2, itemId: "cafe-latte", status: "READY" });
  t2 = await get2();
  assert(t2.kitchenStatus === "ready", "Remaining item READY (cancelled ignored) → ticket READY");

  res = await updateOrderItemStatus({ code: code2, itemId: "tiramisu", status: "PREPARING" });
  assert(!res.success, "A cancelled item cannot be restarted");

  await updateKitchenOrderStatus({ code: code2, status: "cancelled", reason: "Guest left", cancelledBy: "kitchen" });
  t2 = await get2();
  assert(
    t2.kitchenStatus === "cancelled" && t2.status === "cancelled" && t2.items.every((i) => i.status === "CANCELLED") && t2.cancellationReason === "Guest left",
    "Ticket cancel cancels every unfinished item and records the reason"
  );

  // Single-item ticket, using the ticket-level Start All / Serve All
  const code3 = "CQ-ITEM-03";
  await createBooking({
    data: {
      code: code3,
      date: new Date().toISOString().slice(0, 10),
      time: "13:00",
      party: 1,
      seating: "T-03",
      tableNumber: "T-03",
      tableType: "window",
      name: "Meera",
      phone: "+91 99887 76655",
      items: [{ id: "espresso", name: "Espresso", qty: 1, price: 120, prepTimeMinutes: 2, fulfillment: "pre_ordered" }],
      total: 150,
      packagingCharge: 30,
      orderType: "TAKEAWAY",
    } as any,
  });
  await updateBookingStatus({ code: code3, status: "confirmed" });
  await updateKitchenOrderStatus({ code: code3, status: "completed" });
  const t3 = (await getAllBookings()).find((b) => b.code === code3)!;
  assert(t3.kitchenStatus === "completed" && t3.items[0].status === "SERVED", "Single-item ticket steps through every stage to COMPLETED");

  logoutKitchen();
  res = await updateOrderItemStatus({ code: code3, itemId: "espresso", status: "CANCELLED" });
  assert(!res.success && /sign in as kitchen staff/i.test(res.error || ""), "Item updates require a kitchen/admin session");

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
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
