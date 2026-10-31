/**
 * Automated Test Suite for CafeQ Order Types (Dine-in / Takeaway / Delivery)
 * Tests:
 * 1. Order type normalization and per-type status labels.
 * 2. Shared field validation (table number, phone, empty cart, delivery address/pincode).
 * 3. Delivery fee / packaging charge calculation.
 * 4. createBooking enforcement: rejects invalid orders, recomputes charges, clears irrelevant fields.
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

async function expectRejection(fn: () => Promise<unknown>, messagePart: string, testName: string) {
  try {
    await fn();
    assert(false, `${testName} (expected an error)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert(message.includes(messagePart), `${testName} → "${message}"`);
  }
}

async function runTests() {
  console.log("\n==================================================");
  console.log("  Running CafeQ Order Type Test Suite");
  console.log("==================================================\n");

  // Dynamic import after mocks
  const {
    normalizeOrderType,
    getOrderStatusLabel,
    getOrderTypePipelineSteps,
    validateOrderDetails,
    isValidPhone,
    extractPincode,
    formatDeliveryAddress,
    getOrderCharges,
  } = await import("../src/lib/order-types");
  const { createBooking, getAllBookings } = await import("../src/lib/bookings.functions");

  // --------------------------------------------------------------------------
  // SUITE 1: Normalization & status flow
  // --------------------------------------------------------------------------
  console.log("Suite 1: Normalization & Status Flow");

  assert(normalizeOrderType(undefined) === "DINE_IN", "Missing order type defaults to DINE_IN");
  assert(normalizeOrderType("dine_in") === "DINE_IN", "Legacy 'dine_in' normalizes to DINE_IN");
  assert(normalizeOrderType("take-away") === "TAKEAWAY", "'take-away' normalizes to TAKEAWAY");
  assert(normalizeOrderType("delivery") === "DELIVERY", "'delivery' normalizes to DELIVERY");

  assert(
    getOrderTypePipelineSteps("DINE_IN").join(" → ") === "Placed → Preparing → Served",
    "Dine-in flow: Placed → Preparing → Served"
  );
  assert(
    getOrderTypePipelineSteps("TAKEAWAY").join(" → ") === "Placed → Preparing → Ready for pickup → Completed",
    "Takeaway flow: Placed → Preparing → Ready for pickup → Completed"
  );
  assert(
    getOrderTypePipelineSteps("DELIVERY").join(" → ") === "Placed → Preparing → Out for delivery → Delivered",
    "Delivery flow: Placed → Preparing → Out for delivery → Delivered"
  );

  assert(getOrderStatusLabel("TAKEAWAY", "confirmed", "ready") === "Ready for pickup", "Takeaway 'ready' → Ready for pickup");
  assert(getOrderStatusLabel("DELIVERY", "confirmed", "ready") === "Out for delivery", "Delivery 'ready' → Out for delivery");
  assert(getOrderStatusLabel("DELIVERY", "confirmed", "completed") === "Delivered", "Delivery 'completed' → Delivered");
  assert(getOrderStatusLabel("DINE_IN", "confirmed", "completed") === "Served", "Dine-in 'completed' → Served");
  assert(
    getOrderStatusLabel("DINE_IN", "completed", "new") === "Served",
    "Admin-completed booking shows final step even if kitchen status is still 'new'"
  );
  assert(getOrderStatusLabel("DINE_IN", "no_show", "new") === "No-Show", "No-show booking is labelled No-Show");
  assert(getOrderStatusLabel("TAKEAWAY", "confirmed", "cancelled") === "Cancelled", "Kitchen-rejected order shows Cancelled");

  // --------------------------------------------------------------------------
  // SUITE 2: Field validation
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Field Validation");

  assert(isValidPhone("+91 98765 43210"), "Phone '+91 98765 43210' is valid");
  assert(isValidPhone("098765-43210"), "Phone with leading 0 is valid");
  assert(!isValidPhone("12345"), "Short phone '12345' is invalid");
  assert(!isValidPhone("5876543210"), "Phone starting with 5 is invalid");
  assert(!isValidPhone("98765432101234"), "14-digit phone is invalid");

  const base = { customerName: "Neha", customerPhone: "+91 98765 43210", itemCount: 1 };

  assert(
    Object.keys(validateOrderDetails({ ...base, orderType: "DINE_IN", tableNumber: "T-4" })).length === 0,
    "Valid dine-in order passes"
  );
  assert(
    !!validateOrderDetails({ ...base, orderType: "DINE_IN", tableNumber: "  " }).tableNumber,
    "Dine-in without table number fails (blank/whitespace)"
  );
  assert(
    Object.keys(validateOrderDetails({ ...base, orderType: "DINE_IN", tableNumber: "T-4", itemCount: 0 })).length === 0,
    "Dine-in table reservation with empty cart is still allowed"
  );
  assert(
    !!validateOrderDetails({ ...base, orderType: "TAKEAWAY", itemCount: 0 }).cart,
    "Takeaway with empty cart fails"
  );
  assert(
    !!validateOrderDetails({ ...base, orderType: "TAKEAWAY", customerPhone: "123" }).phone,
    "Takeaway with invalid phone fails"
  );
  assert(
    !!validateOrderDetails({ ...base, orderType: "TAKEAWAY", customerName: "" }).name,
    "Takeaway without name fails"
  );
  assert(
    Object.keys(validateOrderDetails({ ...base, orderType: "TAKEAWAY" })).length === 0,
    "Takeaway without pickup time passes (pickup time is optional)"
  );

  const deliveryErrors = validateOrderDetails({
    ...base,
    orderType: "DELIVERY",
    deliveryStreet: "",
    deliveryPincode: "5600",
  });
  assert(!!deliveryErrors.deliveryStreet && !!deliveryErrors.deliveryPincode, "Delivery form: missing street and bad pincode both reported");
  assert(
    Object.keys(
      validateOrderDetails({ ...base, orderType: "DELIVERY", deliveryStreet: "12 MG Road", deliveryPincode: "560034" })
    ).length === 0,
    "Delivery form with street + 6-digit pincode passes"
  );
  assert(
    !!validateOrderDetails({ ...base, orderType: "DELIVERY", deliveryAddress: "12 MG Road" }).deliveryPincode,
    "Stored delivery address without a pincode fails"
  );

  const address = formatDeliveryAddress(" 12 MG Road ", "Near Metro", "560034");
  assert(address === "12 MG Road, Near Metro, PIN 560034", `Delivery address formatted as "${address}"`);
  assert(extractPincode(address) === "560034", "Pincode extracted back from formatted address");

  // --------------------------------------------------------------------------
  // SUITE 3: Charges
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Delivery Fee & Packaging Charge");

  const settings = { deliveryFee: 49.6, packagingCharge: 15 };
  assert(getOrderCharges("DINE_IN", settings).deliveryFee === 0 && getOrderCharges("DINE_IN", settings).packagingCharge === 0, "Dine-in has no extra charges");
  assert(getOrderCharges("DELIVERY", settings).deliveryFee === 50, "Delivery fee from settings, rounded to whole rupees");
  assert(getOrderCharges("DELIVERY", settings).packagingCharge === 0, "Delivery has no packaging charge");
  assert(getOrderCharges("TAKEAWAY", settings).packagingCharge === 15, "Takeaway packaging charge from settings");
  assert(getOrderCharges("DELIVERY", null).deliveryFee === 40, "Delivery fee falls back to ₹40 default");
  assert(getOrderCharges("TAKEAWAY", null).packagingCharge === 30, "Parcel charge falls back to the ₹30 PARCEL_CHARGE default");
  assert(getOrderCharges("DINE_IN", null).packagingCharge === 0, "Dine-in never pays the parcel charge");
  assert(getOrderCharges("DELIVERY", { deliveryFee: -5 }).deliveryFee === 40, "Negative delivery fee setting is ignored");

  // --------------------------------------------------------------------------
  // SUITE 4: createBooking enforcement
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: createBooking Enforcement");

  let seq = 0;
  const order = (overrides: Record<string, unknown>) => ({
    data: {
      code: `OT-${++seq}`,
      date: "2026-11-01",
      time: "12:00",
      party: 1,
      seating: "Counter",
      tableType: "standard",
      name: "Neha Rao",
      phone: "+91 98765 43210",
      items: [{ id: "cafe-latte", name: "Cafe Latte", qty: 2, price: 180, prepTimeMinutes: 5, fulfillment: "pre_ordered", status: "pending" }],
      total: 360,
      ...overrides,
    } as any,
  });

  await expectRejection(
    () => createBooking(order({ orderType: "DINE_IN" })),
    "Table number is required",
    "Dine-in order without table number rejected"
  );
  await expectRejection(
    () => createBooking(order({ orderType: "TAKEAWAY", items: [] })),
    "cart is empty",
    "Takeaway order with empty cart rejected"
  );
  await expectRejection(
    () => createBooking(order({ orderType: "TAKEAWAY", phone: "12345" })),
    "valid 10-digit mobile number",
    "Order with invalid phone rejected"
  );
  await expectRejection(
    () => createBooking(order({ orderType: "DELIVERY", deliveryAddress: "12 MG Road", deliveryFee: 40 })),
    "6-digit pincode",
    "Delivery order without pincode rejected"
  );
  await expectRejection(
    () => createBooking(order({ orderType: "DELIVERY", deliveryAddress: "12 MG Road, PIN 560034", deliveryFee: 0 })),
    "charges have changed",
    "Delivery order with tampered delivery fee rejected"
  );
  await expectRejection(
    () => createBooking(order({ orderType: "PICKUP", tableNumber: "T-1" })),
    "Invalid enum value",
    "Unknown order type rejected"
  );

  const dineIn = await createBooking(order({ orderType: "dine_in", tableNumber: " T-07 ", pickupTime: "In 30 mins" }));
  await expectRejection(
    () => createBooking(order({ orderType: "TAKEAWAY", pickupTime: "In 45 mins" })),
    "charges have changed",
    "Takeaway order without the ₹30 parcel charge rejected"
  );
  const takeaway = await createBooking(order({ orderType: "TAKEAWAY", pickupTime: "In 45 mins", tableNumber: "T-2", packagingCharge: 30 }));
  const delivery = await createBooking(
    order({
      orderType: "DELIVERY",
      deliveryAddress: "12 MG Road, Near Metro, PIN 560034",
      deliveryInstructions: "Ring twice",
      deliveryFee: 40,
      total: 400,
    })
  );

  const stored = await getAllBookings();
  const byCode = (code: string) => stored.find((b) => b.code === code)!;

  const d = byCode(dineIn.code);
  assert(d.orderType === "DINE_IN", "Legacy 'dine_in' stored as DINE_IN");
  assert(d.tableNumber === "T-07", "Dine-in table number trimmed and stored");
  assert(d.pickupTime === null, "Dine-in: irrelevant pickup time cleared");

  const t = byCode(takeaway.code);
  assert(t.orderType === "TAKEAWAY" && t.pickupTime === "In 45 mins", "Takeaway stored with pickup time");
  assert(t.tableNumber === null, "Takeaway: irrelevant table number cleared");
  assert(t.packagingCharge === 30, "Takeaway stored with the ₹30 parcel charge");
  assert(t.customerName === "Neha Rao" && t.customerPhone === "+91 98765 43210", "Customer name & phone stored");

  const dl = byCode(delivery.code);
  assert(dl.orderType === "DELIVERY" && dl.deliveryFee === 40, "Delivery stored with ₹40 delivery fee");
  assert(dl.deliveryAddress === "12 MG Road, Near Metro, PIN 560034", "Delivery address stored");
  assert(dl.deliveryInstructions === "Ring twice", "Delivery instructions stored");
  assert(dl.packagingCharge === 0, "Delivery has no packaging charge");

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
