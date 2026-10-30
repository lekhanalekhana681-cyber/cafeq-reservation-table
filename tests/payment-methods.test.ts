/**
 * Automated Test Suite for checkout payment-method rules
 * Tests:
 * 1. Options in order UPI (recommended) → Cards → Netbanking; cash only for table bookings without food.
 * 2. Auto-switch when the cart changes (cash selected + food added → UPI).
 * 3. createBooking refuses cash for a food pre-order and defaults pre-orders to Razorpay.
 * 4. UPI QR backup link: amount follows the order total, reservation ID as the note, UPI ID from config.
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

  const {
    getAllowedPaymentMethods,
    getPaymentOptions,
    resolvePaymentOption,
    resolvePaymentMethod,
    orderHasPreOrder,
    PAYMENT_METHODS,
    PAYMENT_OPTIONS,
    isOnlinePaymentMethod,
  } = await import("../src/lib/payment-methods");
  const { buildUpiPaymentLink, CAFE_UPI_ID } = await import("../src/lib/upi");
  const { createBooking, getAllBookings } = await import("../src/lib/bookings.functions");

  // --------------------------------------------------------------------------
  console.log("Suite 1: Allowed Methods");

  const pre = getPaymentOptions(true);
  assert(pre.join(",") === "upi,card,netbanking", `Food pre-order → UPI, Cards, Netbanking in that order (${pre.join(", ")})`);
  assert(!pre.some((o) => PAYMENT_OPTIONS[o].cash), "Food pre-order → no cash option");
  assert(!getAllowedPaymentMethods(true).includes("pay_on_arrival"), "Food pre-order → cash can't be stored either");
  assert(PAYMENT_OPTIONS.upi.recommended === true && pre[0] === "upi", "UPI is first and marked Recommended");
  assert(
    PAYMENT_OPTIONS.upi.checkoutMethod === "upi" && PAYMENT_OPTIONS.card.checkoutMethod === "card" && PAYMENT_OPTIONS.netbanking.checkoutMethod === "netbanking",
    "Each option opens Razorpay on just that method"
  );
  assert(pre.every((o) => isOnlinePaymentMethod(PAYMENT_OPTIONS[o].method)), "All three go through the verified online flow");
  const tableOnly = getPaymentOptions(false);
  assert(tableOnly.join(",") === "upi,card,netbanking,cash", "Table booking only → same three + Pay at Counter (cash)");
  assert(getAllowedPaymentMethods(true).includes("upi_prepay"), "UPI QR backup is allowed for pre-orders (it isn't cash)");
  assert(PAYMENT_METHODS.upi_prepay.online === false, "UPI QR isn't treated as a verified online payment");

  assert(orderHasPreOrder([{ fulfillment: "pre_ordered" }]), "Item ready on arrival → pre-order");
  assert(!orderHasPreOrder([{ fulfillment: "at_table" }]), "Items ordered at the table only → not a pre-order");
  assert(!orderHasPreOrder([]), "No items → not a pre-order");

  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Cart Changes");

  assert(resolvePaymentOption("cash", true) === "upi", "Cash selected, food added → auto-switch to UPI");
  assert(resolvePaymentOption("netbanking", true) === "netbanking", "Netbanking stays selected with food");
  assert(resolvePaymentOption("cash", false) === "cash", "Food removed → cash allowed again, selection kept");
  assert(resolvePaymentMethod("pay_on_arrival", true) === "online_razorpay", "Stored method: cash on a pre-order → Razorpay");

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

  // --------------------------------------------------------------------------
  console.log("\nSuite 4: UPI QR Backup Link");

  assert(CAFE_UPI_ID === "dummycafe@upi", "Dummy UPI ID until VITE_CAFE_UPI_ID is set");
  const link = buildUpiPaymentLink({ amount: 360, reference: "CQ-AB12" });
  assert(
    link === "upi://pay?pa=dummycafe@upi&pn=Cafe%20Name&am=360.00&cu=INR&tn=CQ-AB12",
    `upi://pay link with amount and reservation ID: ${link}`
  );
  assert(buildUpiPaymentLink({ amount: 504.5, reference: "CQ-AB12" }).includes("&am=504.50&"), "Amount follows the order total (₹504.50)");
  assert(
    buildUpiPaymentLink({ amount: 100, reference: "CQ 1&x", upiId: "real@okhdfc", payeeName: "Brew & Co" }) ===
      "upi://pay?pa=real@okhdfc&pn=Brew%20%26%20Co&am=100.00&cu=INR&tn=CQ%201%26x",
    "Real UPI ID / name can be swapped in; values are URL-encoded"
  );

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
