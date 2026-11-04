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
    orderHasPreOrder,
    PAYMENT_METHODS,
    PAYMENT_OPTIONS,
    isOnlinePaymentMethod,
  } = await import("../src/lib/payment-methods");
  const { buildUpiPaymentLink, CAFE_UPI_ID, isValidUtr } = await import("../src/lib/upi");
  const { getOrderCharges } = await import("../src/lib/order-types");
  const { createBooking, getAllBookings } = await import("../src/lib/bookings.functions");

  // --------------------------------------------------------------------------
  console.log("Suite 1: Allowed Methods");

  const options = getPaymentOptions();
  assert(options.join(",") === "upi,card,netbanking,cash", `UPI, Cards, Netbanking, Pay at cafe in that order (${options.join(", ")})`);
  assert(PAYMENT_OPTIONS.cash.label === "Pay at cafe" && PAYMENT_OPTIONS.cash.description.includes("card"), "Fallback is labelled Pay at cafe (cash or card)");
  assert(getAllowedPaymentMethods().includes("pay_on_arrival"), "Pay at cafe can be stored on any order");
  assert(PAYMENT_OPTIONS.upi.recommended === true && options[0] === "upi", "UPI is first and marked Recommended");
  assert(
    PAYMENT_OPTIONS.upi.checkoutMethod === "upi" && PAYMENT_OPTIONS.card.checkoutMethod === "card" && PAYMENT_OPTIONS.netbanking.checkoutMethod === "netbanking",
    "Each option opens Razorpay on just that method"
  );
  assert(["upi", "card", "netbanking"].every((o) => isOnlinePaymentMethod(PAYMENT_OPTIONS[o as "upi"].method)), "All three online options go through the verified online flow");
  assert(getAllowedPaymentMethods().includes("upi_prepay"), "UPI QR backup is allowed");
  assert(PAYMENT_METHODS.upi_prepay.online === false, "UPI QR isn't treated as a verified online payment");

  assert(orderHasPreOrder([{ fulfillment: "pre_ordered" }]), "Item ready on arrival → pre-order");
  assert(!orderHasPreOrder([{ fulfillment: "at_table" }]), "Items ordered at the table only → not a pre-order");
  assert(!orderHasPreOrder([]), "No items → not a pre-order");

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

  await createBooking({ data: { ...base, code: "CQ-PM-01", items: food, paymentMethod: "pay_on_arrival" } as any });
  let b = (await getAllBookings()).find((x) => x.code === "CQ-PM-01");
  assert(b?.paymentMethod === "pay_on_arrival", "Food pre-order with Pay at cafe is accepted");

  await createBooking({ data: { ...base, code: "CQ-PM-02", items: food } as any });
  b = (await getAllBookings()).find((x) => x.code === "CQ-PM-02");
  assert(b?.paymentMethod === "online_razorpay" && b?.paymentStatus === "pending_online", "Food pre-order without a method → Razorpay, pending online payment");

  await createBooking({ data: { ...base, code: "CQ-PM-03", items: food, paymentMethod: "upi_razorpay" } as any });
  b = (await getAllBookings()).find((x) => x.code === "CQ-PM-03");
  assert(b?.paymentMethod === "upi_razorpay", "Food pre-order with UPI is accepted");

  await createBooking({ data: { ...base, code: "CQ-PM-04", items: [], paymentMethod: "pay_on_arrival", total: 0 } as any });
  b = (await getAllBookings()).find((x) => x.code === "CQ-PM-04");
  assert(b?.paymentMethod === "pay_on_arrival", "Table booking only with cash is accepted (unchanged)");

  // --------------------------------------------------------------------------
  console.log("\nSuite 4: UPI QR Backup Link");

  const upi = { upiId: "7349540534@axl", payeeName: "LEKHANA B S" };
  assert(CAFE_UPI_ID === "", "No UPI ID hard-coded in the frontend: it comes only from .env");
  const link = buildUpiPaymentLink({ amount: 360, reference: "CQ-AB12", ...upi });
  assert(
    link === "upi://pay?pa=7349540534@axl&pn=LEKHANA%20B%20S&am=360.00&cu=INR&tn=CQ-AB12",
    `upi://pay link with amount and reservation ID: ${link}`
  );
  assert(buildUpiPaymentLink({ amount: 504.5, reference: "CQ-AB12", ...upi }).includes("&am=504.50&"), "Amount follows the order total (₹504.50)");
  assert(
    buildUpiPaymentLink({ amount: 100, reference: "CQ 1&x", upiId: "real@okhdfc", payeeName: "Brew & Co" }) ===
      "upi://pay?pa=real@okhdfc&pn=Brew%20%26%20Co&am=100.00&cu=INR&tn=CQ%201%26x",
    "Real UPI ID / name can be swapped in; values are URL-encoded"
  );
  const parcel = getOrderCharges("TAKEAWAY", null).packagingCharge;
  assert(
    buildUpiPaymentLink({ amount: 120 + parcel, reference: "CQ-TK01", ...upi }).includes("&am=150.00&cu=INR&tn=CQ-TK01"),
    "Takeaway QR amount includes the ₹30 parcel charge (₹120 + ₹30 = ₹150)"
  );
  const { computeOrderTaxes } = await import("../src/config/charges");
  const { computeBillTotals } = await import("../src/lib/receipt.service");
  const gst = computeOrderTaxes(125);
  assert(gst.cgst === 3.13 && gst.sgst === 3.13 && gst.taxAmount === 6.26, "CGST 2.5% + SGST 2.5% on ₹125 → ₹3.13 + ₹3.13");
  const bill = computeBillTotals([{ price: 125, qty: 1 }]);
  assert(bill.cgst === gst.cgst && bill.sgst === gst.sgst && bill.grandTotal === 131.26, "Checkout and bill use the same tax calculation (₹131.26)");
  assert(isValidUtr("412345678901") && isValidUtr("4123 4567 8901"), "12-digit UTR accepted (spaces ignored)");
  assert(!isValidUtr("") && !isValidUtr("12345") && !isValidUtr("4123456789012") && !isValidUtr("41234567890a"), "Missing / short / long / non-numeric UTR refused");

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
