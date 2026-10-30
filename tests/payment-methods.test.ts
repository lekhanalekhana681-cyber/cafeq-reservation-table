/**
 * Automated Test Suite for checkout payment-method rules
 * Tests:
 * 1. getAllowedPaymentMethods(hasPreOrder): food pre-order → Razorpay + UPI only; table only → existing options.
 * 2. Auto-switch when the cart changes (cash selected + food added → Razorpay).
 * 3. createBooking refuses cash for a food pre-order and defaults pre-orders to Razorpay.
 * (Database / API enforcement and the Razorpay flow are covered in preorder-payments.test.ts.)
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
  console.log("  Running CafeQ Payment Method Rules Test Suite");
  console.log("==================================================\n");

  const { getAllowedPaymentMethods, resolvePaymentMethod, orderHasPreOrder, PAYMENT_METHODS, isOnlinePaymentMethod } =
    await import("../src/lib/payment-methods");
  const { createBooking, getAllBookings } = await import("../src/lib/bookings.functions");

  // --------------------------------------------------------------------------
  console.log("Suite 1: Allowed Methods");

  const pre = getAllowedPaymentMethods(true);
  assert(pre.join(",") === "online_razorpay,upi_razorpay", `Food pre-order → only Razorpay + UPI (${pre.join(", ")})`);
  assert(!pre.some((m) => PAYMENT_METHODS[m].cash), "Food pre-order → no cash option");
  assert(pre.every((m) => isOnlinePaymentMethod(m)), "Both pre-order options go through the verified online flow");
  assert(PAYMENT_METHODS.upi_razorpay.checkoutMethod === "upi", "UPI uses Razorpay's UPI method");
  const tableOnly = getAllowedPaymentMethods(false);
  assert(tableOnly.join(",") === "online_razorpay,upi_prepay,pay_on_arrival", "Table booking only → existing options unchanged");

  assert(orderHasPreOrder([{ fulfillment: "pre_ordered" }]), "Item ready on arrival → pre-order");
  assert(!orderHasPreOrder([{ fulfillment: "at_table" }]), "Items ordered at the table only → not a pre-order");
  assert(!orderHasPreOrder([]), "No items → not a pre-order");

  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Cart Changes");

  assert(resolvePaymentMethod("pay_on_arrival", true) === "online_razorpay", "Cash selected, food added → auto-switch to Razorpay");
  assert(resolvePaymentMethod("upi_prepay", true) === "online_razorpay", "QR UPI selected, food added → auto-switch to Razorpay");
  assert(resolvePaymentMethod("upi_razorpay", true) === "upi_razorpay", "UPI (Razorpay) stays selected with food");
  assert(resolvePaymentMethod("pay_on_arrival", false) === "pay_on_arrival", "Food removed → cash allowed again, selection kept");
  assert(resolvePaymentMethod("upi_razorpay", false) === "online_razorpay", "Food removed while on UPI (Razorpay) → Razorpay (still online)");

  // --------------------------------------------------------------------------
  console.log("\nSuite 3: createBooking Enforcement");

  const base = {
    date: "2026-11-02",
    time: "12:00",
    party: 2,
    seating: "T-4",
    tableNumber: "T-4",
    tableType: "window",
    name: "Neha Rao",
    phone: "+91 98765 43210",
    total: 360,
    orderType: "DINE_IN",
  };
  const food = [{ id: "cafe-latte", name: "Cafe Latte", qty: 2, price: 180, prepTimeMinutes: 4, fulfillment: "pre_ordered" }];

  let message = "";
  try {
    await createBooking({ data: { ...base, code: "CQ-PM-01", items: food, paymentMethod: "pay_on_arrival" } as any });
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  assert(/Cash payment is not available for food pre-orders/.test(message), `Cash + food pre-order → refused: "${message}"`);

  await createBooking({ data: { ...base, code: "CQ-PM-02", items: food } as any });
  let b = (await getAllBookings()).find((x) => x.code === "CQ-PM-02");
  assert(b?.paymentMethod === "online_razorpay" && b?.paymentStatus === "pending_online", "Food pre-order without a method → Razorpay, pending online payment");

  await createBooking({ data: { ...base, code: "CQ-PM-03", items: food, paymentMethod: "upi_razorpay" } as any });
  b = (await getAllBookings()).find((x) => x.code === "CQ-PM-03");
  assert(b?.paymentMethod === "upi_razorpay", "Food pre-order with UPI is accepted");

  await createBooking({ data: { ...base, code: "CQ-PM-04", items: [], paymentMethod: "pay_on_arrival", total: 0 } as any });
  b = (await getAllBookings()).find((x) => x.code === "CQ-PM-04");
  assert(b?.paymentMethod === "pay_on_arrival", "Table booking only with cash is accepted (unchanged)");

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
