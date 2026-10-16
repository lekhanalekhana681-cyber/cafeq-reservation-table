/**
 * Automated Test Suite for CafeQ Online Payment & Digital Receipts
 * Tests:
 * 1. Razorpay Order Creation (test mode & sandbox fallback)
 * 2. Razorpay Signature Verification (HMAC SHA-256 valid vs invalid)
 * 3. Razorpay Webhook Signature Verification
 * 4. Digital Receipt Calculation & Tax Breakdown (CGST 2.5%, SGST 2.5%, total 5%)
 * 5. Receipt Storage & Retrieval (localStorage fallback / DB)
 * 6. Receipt PDF Data URI Generation
 * 7. Payment Status Updates (pending -> paid, failed, refunded)
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

// Mock window and document
(global as any).btoa = (str: string) => Buffer.from(str, "binary").toString("base64");
(global as any).atob = (b64: string) => Buffer.from(b64, "base64").toString("binary");
(global as any).window = {
  btoa: (global as any).btoa,
  atob: (global as any).atob,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from "../src/lib/razorpay.service";
import {
  calculateReceiptBreakdown,
  generateReceiptNumber,
  storeReceipt,
  getReceiptByBookingCode,
  generateReceiptPdfDataUri,
  type DigitalReceipt,
} from "../src/lib/receipt.service";
import {
  getAllBookings,
  createBooking,
  verifyAndCompleteRazorpayPayment,
  updatePaymentStatus,
} from "../src/lib/bookings.functions";

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
  console.log("  Running Online Payments & Digital Receipts Tests");
  console.log("==================================================\n");

  // ─── 1. Razorpay Order Creation ───
  console.log("1. Razorpay Order Creation & Currency Handling");
  const order = await createRazorpayOrder({
    amount: 1250,
    currency: "INR",
    receipt: "rcpt_test_001",
    notes: { bookingCode: "BK-TEST1" },
  });

  assert(order.id.startsWith("order_"), "Generated valid order ID starting with 'order_'");
  assert(order.amount === 125000, "Amount converted to paise (1250 INR = 125000 paise)");
  assert(order.currency === "INR", "Currency is INR");
  assert(order.status === "created", "Order status is 'created'");

  // ─── 2. Signature Verification ───
  console.log("\n2. Razorpay HMAC SHA-256 Signature Verification");
  const testOrderId = "order_fake123";
  const testPaymentId = "pay_fake456";
  const secret = "test_secret_key";

  // Compute expected HMAC SHA-256 in Node crypto
  const crypto = await import("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${testOrderId}|${testPaymentId}`)
    .digest("hex");

  const isValid = await verifyRazorpaySignature(
    testOrderId,
    testPaymentId,
    expectedSignature,
    secret
  );
  assert(isValid === true, "Valid Razorpay signature correctly verified with secret");

  const isInvalid = await verifyRazorpaySignature(
    testOrderId,
    testPaymentId,
    "tampered_signature_999",
    secret
  );
  assert(isInvalid === false, "Tampered signature fails verification");

  // Webhook signature
  const webhookBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: testPaymentId } } } });
  const expectedWebhookSig = crypto
    .createHmac("sha256", secret)
    .update(webhookBody)
    .digest("hex");

  const isWebhookValid = await verifyRazorpayWebhookSignature(webhookBody, expectedWebhookSig, secret);
  assert(isWebhookValid === true, "Valid webhook signature verified");

  const isWebhookInvalid = await verifyRazorpayWebhookSignature(webhookBody, "wrong_sig", secret);
  assert(isWebhookInvalid === false, "Invalid webhook signature rejected");

  // ─── 3. Tax Breakdown & Receipt Calculations ───
  console.log("\n3. Digital Receipt Tax Calculations (CGST 2.5% + SGST 2.5% = 5%)");
  const sampleItems = [
    { id: "item1", name: "Cappuccino", price: 200, quantity: 2 },
    { id: "item2", name: "Avocado Toast", price: 350, quantity: 1 },
  ];
  // Items total: 200*2 + 350*1 = 750
  // Tax 5% on 750: 37.50 => subtotal: 712.50, cgst: 18.75, sgst: 18.75
  const deposit = 200;
  const breakdown = calculateReceiptBreakdown(sampleItems, deposit);

  assert(breakdown.subtotal === 712.5, "Subtotal calculated correctly: ₹712.50");
  assert(breakdown.taxAmount === 37.5, "Total GST (5%) calculated correctly: ₹37.50");
  assert(breakdown.cgst === 18.75, "CGST (2.5%) calculated correctly: ₹18.75");
  assert(breakdown.sgst === 18.75, "SGST (2.5%) calculated correctly: ₹18.75");
  assert(breakdown.total === 950, "Grand total matches items + deposit: ₹950.00");

  const receiptNumber = generateReceiptNumber("BK-999");
  assert(receiptNumber.startsWith("CQ-BK-999-"), "Receipt number formatted with CQ prefix and booking code");

  // ─── 4. Receipt Storage & Retrieval ───
  console.log("\n4. Digital Receipt Storage & Local Cache");
  const receiptToStore: DigitalReceipt = {
    id: "rcpt_mock_1",
    receiptNumber,
    bookingCode: "BK-STORE1",
    orderId: "order_mock_1",
    paymentId: "pay_mock_1",
    paymentMethod: "Razorpay Online (UPI/Cards)",
    paymentStatus: "paid",
    date: "2026-10-18",
    time: "19:00",
    customerName: "Priya Sharma",
    customerPhone: "+91 98765 43210",
    customerEmail: "priya@example.com",
    tableType: "Indoor Booth",
    partySize: 4,
    items: sampleItems,
    subtotal: breakdown.subtotal,
    cgst: breakdown.cgst,
    sgst: breakdown.sgst,
    taxAmount: breakdown.taxAmount,
    depositAmount: deposit,
    total: breakdown.total,
    createdAt: new Date().toISOString(),
  };

  const stored = await storeReceipt(receiptToStore);
  assert(stored.id === "rcpt_mock_1", "Receipt stored successfully");

  const retrieved = await getReceiptByBookingCode("BK-STORE1");
  assert(retrieved !== null, "Receipt retrieved by booking code");
  assert(retrieved?.customerName === "Priya Sharma", "Retrieved receipt customer name matches");
  assert(retrieved?.total === 950, "Retrieved receipt grand total matches");

  // ─── 5. PDF Data URI Generation ───
  console.log("\n5. Receipt PDF Generation");
  const pdfDataUri = generateReceiptPdfDataUri(receiptToStore);
  assert(pdfDataUri.startsWith("data:application/pdf;base64,"), "Generates valid base64 PDF Data URI with branding");

  // ─── 6. End-to-End Booking Payment Flow ───
  console.log("\n6. Booking Creation & Payment State Transition");
  const booking = await createBooking({
    name: "Rahul Verma",
    phone: "+91 91234 56789",
    customerEmail: "rahul@example.com",
    date: "2026-10-20",
    time: "20:00",
    party: 2,
    tableType: "Window View",
    items: sampleItems,
    depositAmount: 150,
    total: 900,
    paymentMethod: "online_razorpay",
  });

  assert(booking.code.length > 0, "Booking created with valid code: " + booking.code);
  assert(booking.paymentMethod === "online_razorpay", "Payment method is online_razorpay");
  assert(booking.paymentStatus === "pending", "Initial payment status is 'pending'");

  // Verify and complete payment
  const completion = await verifyAndCompleteRazorpayPayment({
    bookingCode: booking.code,
    razorpayOrderId: "order_rv_001",
    razorpayPaymentId: "pay_rv_001",
    razorpaySignature: "mock_sig_sandbox",
    customerEmail: "rahul@example.com",
  });

  assert(completion.success === true, "Razorpay payment completed successfully");
  assert(completion.receipt !== undefined, "Digital receipt generated on payment success");
  assert(completion.receipt?.paymentId === "pay_rv_001", "Receipt contains payment ID");

  // Check updated booking
  const allBookings = await getAllBookings();
  const updatedBooking = allBookings.find((b) => b.code === booking.code);
  assert(updatedBooking?.paymentStatus === "paid", "Booking payment status transitioned to 'paid'");
  assert(updatedBooking?.paymentReference === "pay_rv_001", "Payment reference recorded on booking");

  // Test status update to refunded
  const refundedBooking = await updatePaymentStatus(booking.code, "refunded", "ref_001");
  assert(refundedBooking?.paymentStatus === "refunded", "Payment status updated to 'refunded'");

  console.log("\n==================================================");
  console.log(`  Tests Completed: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log("==================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
