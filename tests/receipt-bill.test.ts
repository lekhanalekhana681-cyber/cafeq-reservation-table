/**
 * Automated Test Suite for the Admin bill (receipt) rules
 * Tests:
 * 1. Tax maths: Subtotal = Σ price × qty, CGST/SGST 2.5% each, Grand Total, 2-decimal rounding.
 * 2. A completed order produces a bill with every required line.
 * 3. A non-completed order is refused.
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
  console.log("  Running CafeQ Admin Bill Test Suite");
  console.log("==================================================\n");

  const { BILL_TAX_RATES, computeBillTotals, generateBill, generateReceiptPdf, isBillable, BillNotAllowedError } =
    await import("../src/lib/receipt.service");

  // --------------------------------------------------------------------------
  // SUITE 1: Tax maths
  // --------------------------------------------------------------------------
  console.log("Suite 1: Tax Calculation");

  assert(BILL_TAX_RATES.cgst === 0.025 && BILL_TAX_RATES.sgst === 0.025, "Tax rates configured in one constant (2.5% + 2.5%)");
  const t = computeBillTotals([
    { price: 180, qty: 2 },
    { price: 120, qty: 1 },
  ]);
  assert(t.subtotal === 480, `Subtotal = 2 × 180 + 1 × 120 = ${t.subtotal}`);
  assert(t.cgst === 12 && t.sgst === 12, `CGST = SGST = 2.5% of 480 = ${t.cgst}`);
  assert(t.grandTotal === 504, `Grand Total = 480 + 12 + 12 = ${t.grandTotal}`);
  const odd = computeBillTotals([{ price: 99.99, qty: 3 }]);
  assert(odd.subtotal === 299.97 && odd.cgst === 7.5 && odd.sgst === 7.5 && odd.grandTotal === 314.97, `Rounded to 2 decimals: ${JSON.stringify(odd)}`);

  // --------------------------------------------------------------------------
  // SUITE 2 & 3: Completed vs non-completed order
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Completed Order → Bill");

  const base = {
    code: "CQ-BILL1",
    date: "2026-10-29",
    time: "19:30",
    party: 2,
    seating: "Window Seat",
    tableType: "window",
    name: "Neha Rao",
    phone: "+91 98765 43210",
    orderType: "DINE_IN",
    tableNumber: "T-4",
    paymentMethod: "pay_on_arrival",
    paymentStatus: "pending_cash",
    total: 600,
    items: [
      { id: "cafe-latte", name: "Cafe Latte", qty: 2, price: 180, status: "SERVED" },
      { id: "fries", name: "French Fries", qty: 1, price: 120, status: "SERVED" },
      { id: "tiramisu", name: "Tiramisu", qty: 1, price: 260, status: "CANCELLED" },
    ],
  } as any;

  const completed = { ...base, status: "completed" };
  assert(isBillable(completed), "Completed order is billable");
  const bill = generateBill(completed);
  assert(bill.subtotal === 480 && bill.cgst === 12 && bill.sgst === 12 && bill.total === 504, "Bill totals use item prices (cancelled item excluded), not the stored total");
  assert(bill.items.length === 2 && bill.depositAmount === 0, "Itemized list has the 2 served items");

  // The jsPDF output is uncompressed, so the receipt text can be read back from the file
  const pdf = generateReceiptPdf(bill).output();
  const has = (s: string) => pdf.includes(s);
  assert(has("CafeQ"), "Receipt shows the cafe name");
  assert(has("CQ-BILL1"), "Receipt shows the order ID");
  assert(has("2026-10-29 at 19:30"), "Receipt shows the date/time");
  assert(has("Neha Rao") && has("Dine-in") && has("Table T-4"), "Receipt shows customer and table info");
  assert(has("Cafe Latte") && has("INR 180.00") && has("INR 360.00"), "Itemized line: name, qty, price, line total");
  assert(has("Subtotal:") && has("INR 480.00"), "Subtotal line");
  assert(has("CGST \\(2.5%\\):") && has("SGST \\(2.5%\\):") && has("INR 12.00"), "CGST (2.5%) and SGST (2.5%) lines");
  assert(has("GRAND TOTAL:") && has("INR 504.00"), "Grand Total line");

  console.log("\nSuite 3: Non-completed Orders → Refused");

  for (const status of ["confirmed", "pending_payment", "cancelled", "no_show"]) {
    const order = { ...base, status };
    let refused = false;
    try {
      generateBill(order);
    } catch (err) {
      refused = err instanceof BillNotAllowedError;
    }
    assert(!isBillable(order) && refused, `Order with status "${status}" → bill refused`);
  }

  // --------------------------------------------------------------------------
  // SUITE 4: Full admin flow  Pending → Confirm → Complete → bill (saved once)
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Pending → Confirm → Complete → Bill");

  const { getOrCreateBill, getSavedBill } = await import("../src/lib/receipt.service");
  const { createBooking, getAllBookings, updateBookingStatus } = await import("../src/lib/bookings.functions");

  const place = async (code: string) => {
    await createBooking({
      data: {
        ...base,
        code,
        status: "confirmed", // a client trying to skip the Pending step
        items: [
          { id: "cafe-latte", name: "Cafe Latte", qty: 2, price: 180, prepTimeMinutes: 4, fulfillment: "pre_ordered" },
          { id: "fries", name: "French Fries", qty: 1, price: 120, prepTimeMinutes: 6, fulfillment: "pre_ordered" },
        ],
      } as any,
    });
    return async () => (await getAllBookings()).find((b) => b.code === code)!;
  };

  const getFlow = await place("CQ-FLOW1");
  let order = await getFlow();
  assert(order.status === "pending", "New order starts as Pending (client-sent status ignored)");

  let res = await updateBookingStatus({ code: "CQ-FLOW1", status: "completed" });
  assert(!res.success && /confirm the order before completing/i.test(res.error || ""), `Pending → Completed is blocked: "${res.error}"`);
  let billRefused = false;
  try {
    await getOrCreateBill(order);
  } catch (err) {
    billRefused = err instanceof BillNotAllowedError;
  }
  assert(billRefused && (await getSavedBill("CQ-FLOW1")) === null, "Pending order: no bill");

  res = await updateBookingStatus({ code: "CQ-FLOW1", status: "confirmed" });
  order = await getFlow();
  assert(res.success && order.status === "confirmed", "Admin clicks Confirm → Confirmed");
  billRefused = false;
  try {
    await getOrCreateBill(order);
  } catch (err) {
    billRefused = err instanceof BillNotAllowedError;
  }
  assert(billRefused, "Confirmed (not yet completed) order: no bill");

  res = await updateBookingStatus({ code: "CQ-FLOW1", status: "completed" });
  order = await getFlow();
  assert(res.success && order.status === "completed", "Admin clicks Complete → Completed");
  const first = await getOrCreateBill(order);
  assert(
    first.receiptNumber.startsWith("CQ-BILL-") && first.subtotal === 480 && first.cgst === 12 && first.sgst === 12 && first.total === 504,
    `Bill generated on Complete: ${first.receiptNumber} — ₹480 + ₹12 + ₹12 = ₹${first.total}`
  );
  const reopened = await getOrCreateBill(order);
  assert(reopened.receiptNumber === first.receiptNumber && reopened.pdfDataUri === first.pdfDataUri, "Reopening returns the same saved bill (generated once)");

  res = await updateBookingStatus({ code: "CQ-FLOW1", status: "cancelled" });
  assert(!res.success, "A completed order can't be changed afterwards");

  const getOther = await place("CQ-FLOW2");
  await updateBookingStatus({ code: "CQ-FLOW2", status: "cancelled" });
  const other = await getOther();
  billRefused = false;
  try {
    await getOrCreateBill(other);
  } catch (err) {
    billRefused = err instanceof BillNotAllowedError;
  }
  assert(other.status === "cancelled" && billRefused && (await getSavedBill("CQ-FLOW2")) === null, "Cancelled order: no bill");

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
