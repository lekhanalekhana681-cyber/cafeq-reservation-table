/**
 * Automated Test Suite for CafeQ pre-order deposits / prepayment
 * Runs the real SQL migrations in an in-process Postgres (PGlite) and the real
 * /api payment service against it, with only the Razorpay HTTP API faked.
 * Tests:
 * 1. Server-side pricing & parking of unpaid pre-orders (never on the KDS).
 * 2. Successful deposit via Checkout verify; bad signature rejected; double submit safe.
 * 3. Webhook path (tab closed after paying), duplicate events, payment.failed.
 * 4. Expiry after 15 minutes; late payment refunded.
 * 5. Cancel before cutoff (refund), after cutoff (forfeit), no-show, cafe cancel.
 * 6. Admin: partial refund, forfeit, balance collection, settings, auth.
 * 7. Database guard: the public (anon) key cannot fake a payment.
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { createPaymentService } from "../api/_lib/payments.js";
import { createRazorpayClient, hmacSha256Hex, verifyPaymentSignature } from "../api/_lib/razorpay.js";
import { createSupabaseDb } from "../api/_lib/db.js";
import { issueAdminToken, loginAdmin, verifyAdminToken } from "../api/_lib/admin-auth.js";

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

async function expectError(fn: () => Promise<unknown>, part: string, testName: string) {
  try {
    await fn();
    assert(false, `${testName} (expected an error)`);
  } catch (err: any) {
    const msg = `${err?.code || ""} ${err?.message || ""}`;
    assert(msg.includes(part), `${testName} → ${msg.trim()}`);
  }
}

const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";
const MIGRATIONS = [
  "20261026120000_add_order_type_and_delivery_fields.sql",
  "20261028000000_enforce_order_type_rules.sql",
  "20261029000000_per_item_kitchen_status.sql",
  "20261030000000_preorder_payments.sql",
  "20261031000000_order_status_flow.sql",
  "20261101000000_billed_status.sql",
  "20261102000000_online_payment_methods.sql",
  "20261104000000_upi_qr_backup.sql",
  "20261105000000_parcel_charge_and_upi_verify.sql",
];

/** Fake Razorpay gateway: same shape as createRazorpayClient, real HMAC signatures. */
function fakeRazorpay() {
  const orders = new Map<string, any>();
  const payments = new Map<string, any>();
  const refunds: any[] = [];
  let n = 0;
  return {
    keyId: "rzp_test_fake",
    isTestMode: true,
    orders,
    refunds,
    async createOrder({ amountPaise, receipt }: any) {
      const id = `order_${++n}`;
      orders.set(id, { id, amount: amountPaise, receipt });
      return { id, amount: amountPaise };
    },
    async fetchPayment(id: string) {
      const p = payments.get(id);
      if (!p) throw new Error("payment not found");
      return { ...p };
    },
    async capturePayment(id: string) {
      payments.get(id).status = "captured";
      return { ...payments.get(id) };
    },
    async refund(paymentId: string, amount: number) {
      const id = `rfnd_${++n}`;
      refunds.push({ id, paymentId, amount });
      return { id, status: "processed" };
    },
    verifyPaymentSignature: ({ orderId, paymentId, signature }: any) =>
      verifyPaymentSignature({ orderId, paymentId, signature, keySecret: KEY_SECRET }),
    /** Customer completes Checkout; returns what the Razorpay handler gives the browser. */
    pay(orderId: string, status = "captured") {
      const id = `pay_${++n}`;
      payments.set(id, { id, order_id: orderId, amount: orders.get(orderId).amount, status, method: "upi" });
      return {
        razorpay_order_id: orderId,
        razorpay_payment_id: id,
        razorpay_signature: hmacSha256Hex(`${orderId}|${id}`, KEY_SECRET),
      };
    },
  };
}

/** IST date + HH:MM for now + offset minutes (how the reserve page sends dine-in times). */
function istSlot(offsetMinutes: number) {
  const d = new Date(Date.now() + offsetMinutes * 60000 + 330 * 60000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

async function runTests() {
  console.log("\n==================================================");
  console.log("  Running CafeQ Pre-order Payments Test Suite");
  console.log("==================================================\n");

  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE,
      phone text NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'user', is_disabled boolean DEFAULT false);
    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, date date NOT NULL, time text NOT NULL,
      party integer NOT NULL, seating text NOT NULL, name text NOT NULL, phone text NOT NULL, notes text,
      dietary text[] DEFAULT '{}', occasion text, accessibility text[] DEFAULT '{}', window_priority boolean DEFAULT false,
      items jsonb DEFAULT '[]'::jsonb NOT NULL, total integer NOT NULL DEFAULT 0, paid_amount integer DEFAULT 0,
      payment_method text DEFAULT 'pay_on_arrival', status text DEFAULT 'confirmed', created_at timestamptz DEFAULT now(),
      table_type text DEFAULT 'window', has_preorder boolean DEFAULT false, estimated_prep_time integer DEFAULT 0,
      food_ready_time text, is_peak_hour boolean DEFAULT false, deposit_required boolean DEFAULT false,
      deposit_amount integer DEFAULT 0, kitchen_load text DEFAULT 'normal', customer_email text,
      payment_status text DEFAULT 'pending_cash', payment_reference text, user_id uuid);
    CREATE TABLE public.cafe_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, value text NOT NULL);
    CREATE TABLE public.receipts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_code text NOT NULL, receipt_number text NOT NULL UNIQUE,
      amount numeric(10,2) NOT NULL, tax_amount numeric(10,2) NOT NULL DEFAULT 0, items jsonb DEFAULT '[]'::jsonb NOT NULL,
      customer_name text NOT NULL, customer_phone text NOT NULL, created_at timestamptz DEFAULT now());
    GRANT SELECT, INSERT, UPDATE ON public.receipts TO anon;
    CREATE TABLE public.menu_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar NOT NULL UNIQUE, category varchar NOT NULL,
      price numeric(10,2) NOT NULL, is_available boolean DEFAULT true);
    INSERT INTO public.menu_items (name, category, price, is_available) VALUES
      ('Cafe Latte', 'Hot Beverages', 180, true), ('French Fries', 'Bites', 119.6, true), ('Tiramisu', 'Desserts', 260, false);
    GRANT SELECT, INSERT, UPDATE ON public.bookings TO anon;
    GRANT SELECT ON public.cafe_settings, public.menu_items TO anon;
  `);
  for (const m of MIGRATIONS) {
    await pg.exec(fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", m), "utf8"));
  }

  // Service-role db adapter: every call is a pay_* function with named arguments
  const db = {
    async rpc(name: string, args: Record<string, unknown>) {
      const keys = Object.keys(args);
      const params = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
      const values = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      const res = await pg.query<{ r: any }>(`SELECT public.${name}(${params}) AS r`, values as any[]);
      return res.rows[0]?.r;
    },
  };

  const rzp = fakeRazorpay();
  const notifications: Array<{ event: string; code: string }> = [];
  const service = createPaymentService({
    db,
    razorpay: rzp,
    webhookSecret: WEBHOOK_SECRET,
    notify: async (event: string, booking: any) => {
      notifications.push({ event, code: booking.code });
    },
  });

  let seq = 0;
  /** Places an order the way the browser does: INSERT with the anon key. */
  async function placeOrder(overrides: Record<string, unknown> = {}) {
    const code = `CQ-PAY-${++seq}`;
    const slot = istSlot(120);
    const row: Record<string, unknown> = {
      code, date: slot.date, time: slot.time, party: 2, seating: "Window", name: "Neha Rao", phone: "+91 98765 43210",
      order_type: "DINE_IN", table_number: "T-4", delivery_fee: 0, packaging_charge: 0, total: 1,
      items: JSON.stringify([
        { id: "cafe-latte", name: "Cafe Latte", qty: 2, price: 1, fulfillment: "pre_ordered" },
        { id: "french-fries", name: "French Fries", qty: 1, price: 1, fulfillment: "pre_ordered" },
      ]),
      ...overrides,
    };
    const cols = Object.keys(row);
    await pg.exec("SET ROLE anon");
    try {
      await pg.query(
        `INSERT INTO public.bookings (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
        cols.map((c) => row[c]) as any[]
      );
    } finally {
      await pg.exec("RESET ROLE");
    }
    return code;
  }
  const getBooking = async (code: string) =>
    (await pg.query<any>("SELECT * FROM public.bookings WHERE code = $1", [code])).rows[0];
  const asAnon = async (sql: string, params: any[] = []) => {
    await pg.exec("SET ROLE anon");
    try {
      return await pg.query(sql, params);
    } finally {
      await pg.exec("RESET ROLE");
    }
  };
  const webhook = (event: string, entity: any, key = "payment", eventId?: string) => {
    const rawBody = JSON.stringify({ event, payload: { [key]: { entity } } });
    return service.handleWebhook({ rawBody, signature: hmacSha256Hex(rawBody, WEBHOOK_SECRET), eventId: eventId ?? `evt_${event}_${entity.id}` });
  };

  // --------------------------------------------------------------------------
  // SUITE 1: Pricing & parking
  // --------------------------------------------------------------------------
  console.log("Suite 1: Server-side Pricing & Pending Payment");

  const code1 = await placeOrder();
  let b = await getBooking(code1);
  // 2 × ₹180 + 1 × ₹120 (119.6 rounded) = ₹480 ; client sent price 1 and total 1
  assert(b.total_amount_paise === 48000, `Total computed from DB prices, client prices ignored (${b.total_amount_paise} paise)`);
  assert(b.deposit_due_paise === 14400, `30% deposit = ₹144 (${b.deposit_due_paise} paise)`);
  assert(b.status === "pending_payment" && b.payment_state === "PENDING" && b.payment_required, "Pre-order starts PENDING_PAYMENT");
  assert(b.balance_due_paise === 48000 && b.payment_expires_at !== null, "Balance due tracked; 15-minute expiry set");

  const walkIn = await placeOrder({ ...istSlot(-5) });
  b = await getBooking(walkIn);
  assert(!b.payment_required && b.status === "pending" && b.payment_state === "UNPAID", "Dine-in at the cafe (arrival now) is not a pre-order — no payment, awaits admin confirmation");

  const latte = await placeOrder({ items: JSON.stringify([{ id: "x", name: "Cafe Latte", qty: 1, fulfillment: "pre_ordered" }]) });
  b = await getBooking(latte);
  assert(b.deposit_due_paise === 5400, `₹180 order → 30% = ₹54 deposit (${b.deposit_due_paise} paise)`);
  const fries = await placeOrder({ items: JSON.stringify([{ id: "x", name: "French Fries", qty: 1, fulfillment: "pre_ordered" }]) });
  b = await getBooking(fries);
  assert(b.deposit_due_paise === 5000, `₹120 order → 30% = ₹36, minimum ₹50 applies (${b.deposit_due_paise} paise)`);

  await expectError(
    () => placeOrder({ items: JSON.stringify([{ id: "x", name: "Tiramisu", qty: 1, fulfillment: "pre_ordered" }]) }),
    "ITEM_UNAVAILABLE",
    "Pre-order with an 86'd item is rejected at insert"
  );

  // --------------------------------------------------------------------------
  // SUITE 2: Checkout verify
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Successful Deposit via Checkout");

  const checkout = await service.createOrder({ code: code1 });
  assert(checkout.amountPaise === 14400 && checkout.keyId === "rzp_test_fake", "Razorpay order created for the server-computed deposit");
  const again = await service.createOrder({ code: code1 });
  assert(again.razorpayOrderId === checkout.razorpayOrderId && rzp.orders.size === 1, "Double click on Pay reuses the same Razorpay order");

  const forged = rzp.pay(checkout.razorpayOrderId);
  await expectError(
    () => service.verify({ code: code1, ...forged, razorpay_signature: "deadbeef".repeat(8) }),
    "INVALID_SIGNATURE",
    "Forged checkout signature rejected"
  );
  b = await getBooking(code1);
  assert(b.status === "pending_payment", "Order stays pending after a rejected signature");

  const paid = rzp.pay(checkout.razorpayOrderId);
  const verified = await service.verify({ code: code1, ...paid });
  b = await getBooking(code1);
  assert(
    b.status === "confirmed" && b.kitchen_status === "new" && b.payment_state === "PARTIALLY_PAID",
    "Verified deposit → order confirmed (on the KDS), PARTIALLY_PAID"
  );
  assert(b.amount_paid_paise === 14400 && b.balance_due_paise === 33600, "Paid ₹144, balance ₹336 due at the cafe");
  assert(verified.receipt.paymentId === paid.razorpay_payment_id, "Receipt returned with the payment id");

  const replay = await service.verify({ code: code1, ...paid });
  b = await getBooking(code1);
  assert(replay.order.amountPaidPaise === 14400 && b.amount_paid_paise === 14400, "Verifying the same payment twice does not double-count");
  const dupWebhook = await webhook("payment.captured", { id: paid.razorpay_payment_id, order_id: checkout.razorpayOrderId, amount: 14400, method: "upi" });
  b = await getBooking(code1);
  assert(b.amount_paid_paise === 14400 && !dupWebhook.duplicate, "Webhook after verify is processed idempotently (no double credit)");

  // --------------------------------------------------------------------------
  // SUITE 3: Webhook path & failures
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Webhook (tab closed after paying) & Failures");

  const code2 = await placeOrder();
  const co2 = await service.createOrder({ code: code2 });
  const failedAttempt = rzp.pay(co2.razorpayOrderId, "failed");
  await webhook("payment.failed", { id: failedAttempt.razorpay_payment_id, order_id: co2.razorpayOrderId, amount: co2.amountPaise, error_description: "Card declined" });
  b = await getBooking(code2);
  assert(b.status === "pending_payment" && b.payment_state === "PENDING", "payment.failed keeps the order PENDING_PAYMENT (retry allowed)");
  const retry = await service.createOrder({ code: code2 });
  assert(retry.razorpayOrderId === co2.razorpayOrderId, "Retry after a failed attempt reuses the Razorpay order");

  const closedTab = rzp.pay(co2.razorpayOrderId);
  const entity = { id: closedTab.razorpay_payment_id, order_id: co2.razorpayOrderId, amount: co2.amountPaise, method: "card" };
  await webhook("payment.captured", entity, "payment", "evt_captured_1");
  b = await getBooking(code2);
  assert(b.status === "confirmed" && b.payment_state === "PARTIALLY_PAID", "payment.captured webhook confirms the order without the browser");
  const dup = await webhook("payment.captured", entity, "payment", "evt_captured_1");
  b = await getBooking(code2);
  assert(dup.duplicate === true && b.amount_paid_paise === co2.amountPaise, "Same webhook event twice → second is ignored");

  await expectError(
    () => service.handleWebhook({ rawBody: '{"event":"payment.captured"}', signature: "bad", eventId: "x" }),
    "INVALID_SIGNATURE",
    "Webhook with an invalid signature rejected"
  );

  // --------------------------------------------------------------------------
  // SUITE 4: Expiry
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Expiry of Unpaid Pre-orders");

  const code3 = await placeOrder();
  const co3 = await service.createOrder({ code: code3 });
  await pg.query("UPDATE public.bookings SET payment_expires_at = now() - interval '1 minute' WHERE code = $1", [code3]);
  const expiredCount = await service.expireUnpaid();
  b = await getBooking(code3);
  assert(expiredCount >= 1 && b.status === "expired", "Unpaid after 15 minutes → expired (never reaches the kitchen)");
  await expectError(() => service.createOrder({ code: code3 }), "ORDER_EXPIRED", "Paying an expired order is refused");

  const late = rzp.pay(co3.razorpayOrderId);
  await pg.query("UPDATE public.bookings SET scheduled_at = now() - interval '5 minutes' WHERE code = $1", [code3]);
  await webhook("payment.captured", { id: late.razorpay_payment_id, order_id: co3.razorpayOrderId, amount: co3.amountPaise, method: "upi" });
  b = await getBooking(code3);
  assert(
    b.status === "cancelled" && b.payment_state === "REFUNDED" && rzp.refunds.some((r) => r.paymentId === late.razorpay_payment_id),
    "Payment captured after expiry and after the arrival time → refunded automatically"
  );

  // --------------------------------------------------------------------------
  // SUITE 5: Cancellations
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Cancel Before / After Cutoff, No-show, Cafe Cancel");

  await expectError(() => service.cancelByCustomer({ code: code1, phone: "+91 90000 11111" }), "FORBIDDEN", "Cancel with a different phone number refused");
  const early = await service.cancelByCustomer({ code: code1, phone: "98765 43210" });
  b = await getBooking(code1);
  assert(early.action === "refund" && b.status === "cancelled" && b.payment_state === "REFUNDED", "Cancel 2h before arrival (before 30-min cutoff) → REFUNDED");
  assert(rzp.refunds.some((r) => r.paymentId === paid.razorpay_payment_id && r.amount === 14400), "Razorpay refund issued for the full deposit");
  assert(notifications.some((x) => x.code === code1 && x.event === "refunded"), "Customer notified of the refund");

  const soon = await placeOrder({ ...istSlot(20) });
  const coSoon = await service.createOrder({ code: soon });
  await service.verify({ code: soon, ...rzp.pay(coSoon.razorpayOrderId) });
  const lateCancel = await service.cancelByCustomer({ code: soon, phone: "+919876543210" });
  b = await getBooking(soon);
  assert(lateCancel.action === "forfeit" && b.status === "cancelled" && b.payment_state === "FORFEITED", "Cancel 20 min before arrival (after cutoff) → FORFEITED, no refund");
  assert(b.amount_paid_paise === coSoon.amountPaise && b.forfeited_at !== null, "Forfeited deposit kept on record");

  const ns = await placeOrder();
  const coNs = await service.createOrder({ code: ns });
  await service.verify({ code: ns, ...rzp.pay(coNs.razorpayOrderId) });
  await service.noShow({ code: ns, actor: "admin:Owner" });
  b = await getBooking(ns);
  assert(b.status === "no_show" && b.payment_state === "FORFEITED", "Manager marks NO_SHOW → deposit FORFEITED");

  const cafe = await placeOrder({ ...istSlot(20) });
  const coCafe = await service.createOrder({ code: cafe });
  await service.verify({ code: cafe, ...rzp.pay(coCafe.razorpayOrderId) });
  const cafeCancel = await service.cancelOrder(cafe, "admin:Owner", "Momos out of stock");
  b = await getBooking(cafe);
  assert(cafeCancel.action === "refund" && b.payment_state === "REFUNDED", "Cafe cancels (even after cutoff) → full automatic refund");

  // --------------------------------------------------------------------------
  // SUITE 6: Admin actions & auth
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Admin Refunds, Forfeit, Balance Collection & Auth");

  // code2 is paid (deposit via webhook)
  await service.refund({ code: code2, amountPaise: 5000, actor: "admin:Owner", reason: "Goodwill" });
  b = await getBooking(code2);
  assert(b.payment_state === "PARTIALLY_REFUNDED" && b.amount_paid_paise === co2.amountPaise - 5000, "Partial refund ₹50 → PARTIALLY_REFUNDED");
  await expectError(() => service.refund({ code: code2, amountPaise: 999999, actor: "admin:Owner" }), "REFUND_EXCEEDS_PAYMENT", "Refund larger than paid is refused");

  await service.collectBalance({ code: code2, method: "cash", actor: "admin:Cashier" });
  b = await getBooking(code2);
  assert(b.payment_state === "PAID" && b.balance_due_paise === 0 && b.payment_status === "paid", "Cashier collects the balance in cash → PAID, balance ₹0");
  await expectError(() => service.collectBalance({ code: code2, method: "cash", actor: "admin:Cashier" }), "NOTHING_DUE", "Collecting twice is refused");

  const fo = await placeOrder();
  const coFo = await service.createOrder({ code: fo });
  await service.verify({ code: fo, ...rzp.pay(coFo.razorpayOrderId) });
  await expectError(() => service.forfeit({ code: fo, actor: "admin:Owner", reason: " " }), "BAD_REQUEST", "Forfeit requires a reason");
  await service.forfeit({ code: fo, actor: "admin:Owner", reason: "Customer called 5 minutes before" });
  b = await getBooking(fo);
  assert(b.payment_state === "FORFEITED" && b.forfeit_reason?.includes("Customer called"), "Manual forfeit with reason");
  const audit = (await pg.query<any>("SELECT * FROM public.payment_audit_log WHERE booking_code = $1 AND action = 'forfeit'", [fo])).rows;
  assert(audit.length === 1 && audit[0].actor === "admin:Owner", "Forfeit logged with who did it and when");

  const listing = await service.list({ filter: "forfeited" });
  assert(listing.orders.every((o: any) => o.payment_state === "FORFEITED") && listing.orders.length >= 3, "Payments list filters by forfeited");
  assert(listing.totals.forfeited_paise > 0 && Array.isArray(listing.daily) && listing.daily.length === 14, "Totals and 14-day IST daily summary returned");
  const today = listing.daily[0];
  assert(today.collected_paise > 0 && today.forfeited_paise > 0, "Today's summary shows deposits collected and forfeited");

  await service.updateSettings({ settings: { preorder_payment_mode: "FULL" }, actor: "admin:Owner" });
  const full = await placeOrder();
  b = await getBooking(full);
  assert(b.deposit_due_paise === b.total_amount_paise, "Mode FULL → full prepayment due");
  await service.updateSettings({ settings: { preorder_payment_mode: "NONE" }, actor: "admin:Owner" });
  const none = await placeOrder();
  b = await getBooking(none);
  assert(!b.payment_required && b.status === "pending", "Mode NONE → no online payment; order awaits admin confirmation");
  await expectError(() => service.updateSettings({ settings: { deposit_percent: 0 }, actor: "admin:Owner" }), "INVALID_SETTING", "Invalid deposit percent rejected");
  await service.updateSettings({ settings: { preorder_payment_mode: "DEPOSIT" }, actor: "admin:Owner" });

  await pg.query("INSERT INTO public.users (name, email, phone, password_hash, role) VALUES ('Owner', 'admin@cafeq.com', '1', $1, 'admin')", [
    bcrypt.hashSync("Cafe@123", 4),
  ]);
  const env = { PAYMENTS_ADMIN_SECRET: "s3cret" } as any;
  const admin = await loginAdmin(db, { identifier: "admin@cafeq.com", password: "Cafe@123" });
  const token = issueAdminToken(admin, { env });
  assert(verifyAdminToken(token, { env }).name === "Owner", "Admin password verified server-side → signed token");
  await expectError(() => loginAdmin(db, { identifier: "admin@cafeq.com", password: "wrong" }), "UNAUTHORIZED", "Wrong admin password rejected");
  await expectError(async () => verifyAdminToken(token.replace(/.$/, "x"), { env }), "UNAUTHORIZED", "Tampered admin token rejected");
  await expectError(async () => verifyAdminToken(token, { env, now: Date.now() + 3 * 3600_000 }), "UNAUTHORIZED", "Expired admin token rejected");

  // --------------------------------------------------------------------------
  // SUITE 7: Database guard against the public key
  // --------------------------------------------------------------------------
  console.log("\nSuite 7: Public Key Cannot Fake a Payment");

  const g = await placeOrder();
  await expectError(
    () => asAnon("UPDATE public.bookings SET payment_state = 'PAID', amount_paid_paise = 99999 WHERE code = $1", [g]),
    "PAYMENT_FIELDS_READ_ONLY",
    "Anon cannot mark an order paid"
  );
  await expectError(
    () => asAnon("UPDATE public.bookings SET status = 'confirmed' WHERE code = $1", [g]),
    "PAYMENT_REQUIRED",
    "Anon cannot move an unpaid pre-order to the kitchen"
  );
  await expectError(
    () => asAnon("SELECT public.kds_set_item_status($1, ARRAY['cafe-latte'], 'PREPARING')", [g]),
    "PAYMENT_REQUIRED",
    "KDS cannot start items of an unpaid pre-order"
  );
  await expectError(
    () => asAnon("SELECT public.pay_mark_captured('order_1', 'pay_x', 100, 'upi')"),
    "permission denied",
    "Anon cannot call payment functions"
  );
  await asAnon("UPDATE public.bookings SET status = 'cancelled' WHERE code = $1", [g]);
  b = await getBooking(g);
  assert(b.status === "cancelled", "Customer can still abandon an unpaid pre-order");
  await expectError(
    () => asAnon("UPDATE public.bookings SET status = 'cancelled' WHERE code = $1", [code2]),
    "PAID_ORDER_USE_PAYMENTS",
    "Paid pre-order can't be cancelled directly (must go through refund/forfeit)"
  );

  // --------------------------------------------------------------------------
  // SUITE 7b: Admin order flow & bills, enforced by the database (anon key)
  // --------------------------------------------------------------------------
  console.log("\nSuite 7b: Pending → Confirmed → Completed & One Bill per Order");

  const flow = await placeOrder({ ...istSlot(-5) }); // at the cafe: no payment needed
  b = await getBooking(flow);
  assert(b.status === "pending", "New order is stored as pending");
  await expectError(
    () => asAnon("UPDATE public.bookings SET status = 'completed' WHERE code = $1", [flow]),
    "INVALID_STATUS_TRANSITION:pending -> completed",
    "Skipping Pending → Completed is blocked"
  );
  await expectError(
    () => asAnon("SELECT public.kds_set_item_status($1, ARRAY['cafe-latte'], 'PREPARING')", [flow]),
    "ORDER_NOT_CONFIRMED",
    "Kitchen cannot start a pending order"
  );
  const insertBill = (code: string, number: string) =>
    asAnon(
      "INSERT INTO public.receipts (booking_code, receipt_number, amount, tax_amount, customer_name, customer_phone) VALUES ($1, $2, 504, 24, 'Neha', '1')",
      [code, number]
    );
  await expectError(() => insertBill(flow, `CQ-BILL-${flow}-A`), "BILL_NOT_ALLOWED", "Bill for a pending order is refused");
  await asAnon("UPDATE public.bookings SET status = 'confirmed' WHERE code = $1", [flow]);
  await expectError(() => insertBill(flow, `CQ-BILL-${flow}-A`), "BILL_NOT_ALLOWED", "Bill for a confirmed (not completed) order is refused");
  await asAnon("UPDATE public.bookings SET status = 'completed' WHERE code = $1", [flow]);
  await expectError(
    () => asAnon("UPDATE public.bookings SET status = 'cancelled' WHERE code = $1", [flow]),
    "INVALID_STATUS_TRANSITION:completed -> cancelled",
    "A completed order can't be cancelled"
  );
  await expectError(
    () => asAnon("UPDATE public.bookings SET status = 'billed' WHERE code = $1", [flow]),
    "BILL_NOT_GENERATED",
    "Completed → Billed without generating the bill is refused"
  );
  await insertBill(flow, `CQ-BILL-${flow}-A`);
  b = await getBooking(flow);
  assert(b.status === "billed", "Generating (saving) the bill moves the order to Billed in the same transaction");
  await expectError(() => insertBill(flow, `CQ-BILL-${flow}-B`), "BILL_NOT_ALLOWED:billed", "A second bill for the same order is refused");
  await expectError(
    () => asAnon("UPDATE public.receipts SET amount = 1 WHERE booking_code = $1", [flow]),
    "BILL_IS_FINAL",
    "A saved bill can't be edited"
  );
  await expectError(
    () => asAnon("UPDATE public.bookings SET status = 'cancelled' WHERE code = $1", [flow]),
    "INVALID_STATUS_TRANSITION:billed -> cancelled",
    "A billed order can't be cancelled"
  );

  const cx = await placeOrder({ ...istSlot(-5) });
  await asAnon("UPDATE public.bookings SET status = 'cancelled' WHERE code = $1", [cx]);
  await expectError(
    () => pg.query("UPDATE public.bookings SET status = 'completed' WHERE code = $1", [cx]),
    "INVALID_STATUS_TRANSITION:cancelled -> completed",
    "A cancelled order can never be completed — not even by the server role"
  );
  await expectError(() => insertBill(cx, `CQ-BILL-${cx}-A`), "BILL_NOT_ALLOWED:cancelled", "A cancelled order can never be billed");

  // --------------------------------------------------------------------------
  // SUITE 7c: Payment methods & full online payment (Razorpay / UPI)
  // --------------------------------------------------------------------------
  console.log("\nSuite 7c: Pre-order Payment Methods & Full Online Payment");

  await expectError(
    () => placeOrder({ ...istSlot(-5), payment_method: "pay_on_arrival" }),
    "Cash payment is not available for food pre-orders",
    "Food pre-order with cash is rejected by the database (check_violation → HTTP 400)"
  );
  const qrWalkIn = await placeOrder({ ...istSlot(-5), payment_method: "upi_prepay" });
  b = await getBooking(qrWalkIn);
  assert(b.payment_method === "upi_prepay", "Food pre-order may use the UPI QR backup (it isn't cash)");
  const tableOnlyCash = await placeOrder({ ...istSlot(60), items: "[]", payment_method: "pay_on_arrival" });
  b = await getBooking(tableOnlyCash);
  assert(b.payment_method === "pay_on_arrival", "Table-only booking can still choose cash");
  const defaulted = await placeOrder({ ...istSlot(-5) });
  b = await getBooking(defaulted);
  assert(b.payment_method === "online_razorpay", "Food pre-order without a method defaults to Razorpay");
  await expectError(
    () => asAnon("UPDATE public.bookings SET payment_method = 'pay_on_arrival' WHERE code = $1", [defaulted]),
    "Cash payment is not available",
    "Switching a pre-order to cash afterwards is rejected"
  );

  // Walk-in dine-in with food (no deposit rule) paying the fullOrder order online with UPI
  const fullOrder = await placeOrder({ ...istSlot(-5), payment_method: "upi_razorpay" });
  await expectError(
    () => service.createOrder({ code: fullOrder, method: "cash" }),
    "CASH_NOT_ALLOWED_FOR_PREORDER",
    "create-order with a cash method → 400"
  );
  const fullCo = await service.createOrder({ code: fullOrder, method: "upi" });
  assert(fullCo.amountPaise === 48000 && fullCo.kind === "full" && fullCo.method === "upi", `Full payment priced by the server from the menu: ${fullCo.amountPaise} paise (client sent ₹1)`);
  const receipt = rzp.orders.get(fullCo.razorpayOrderId)?.receipt as string;
  assert(typeof receipt === "string" && receipt.startsWith(`${fullOrder}-`) && receipt.length <= 40, `Razorpay order has a unique receipt (${receipt})`);
  const fullPaid = await service.verify({ code: fullOrder, ...rzp.pay(fullCo.razorpayOrderId) });
  b = await getBooking(fullOrder);
  assert(
    b.payment_state === "PAID" && b.payment_status === "paid" && b.amount_paid_paise === 48000 && fullPaid.receipt.amountPaise === 48000,
    "Verified signature → order marked PAID with a receipt"
  );
  assert(b.status === "pending", "Payment doesn't skip the admin's Confirm step");
  await expectError(() => service.createOrder({ code: fullOrder, method: "razorpay" }), "ORDER_ALREADY_PAID", "Paying the same order twice is refused");

  // Table booking only, paying the ₹100 table-hold deposit online
  const tableOnline = await placeOrder({ ...istSlot(60), items: "[]", payment_method: "online_razorpay", deposit_required: true, deposit_amount: 100 });
  const tableCo = await service.createOrder({ code: tableOnline, method: "razorpay" });
  assert(tableCo.amountPaise === 10000, "Table-only online payment = table-hold deposit (₹100)");
  const noDeposit = await placeOrder({ ...istSlot(60), items: "[]", payment_method: "online_razorpay" });
  await expectError(() => service.createOrder({ code: noDeposit }), "NOTHING_TO_PAY", "Nothing to pay online → clear error");
  await expectError(() => service.createOrder({ code: tableOnlyCash }), "NOT_AN_ONLINE_ORDER", "Cash order can't open online checkout");

  // --------------------------------------------------------------------------
  // SUITE 7d: UPI QR backup — "I have paid" → Pending verification → staff confirm
  // --------------------------------------------------------------------------
  console.log("\nSuite 7d: UPI QR Backup");

  // Pre-order held for its deposit (the gateway failed), customer scans the QR instead
  const held = await placeOrder({ payment_method: "upi_prepay" });
  b = await getBooking(held);
  assert(b.status === "pending_payment" && b.payment_required, "Pre-order is held for payment as usual");
  await expectError(
    () => asAnon("SELECT public.pay_claim_upi_qr($1, $2, $3)", [held, "+91 98765 43210", null]),
    "permission denied",
    "The public key can't call the claim function (server only)"
  );
  await expectError(
    () => asAnon("UPDATE public.bookings SET payment_status = 'pending_verification' WHERE code = $1", [held]),
    "PAYMENT_FIELDS_READ_ONLY",
    "…nor flag a held pre-order directly"
  );
  await expectError(
    () => db.rpc("pay_claim_upi_qr", { _code: held, _phone: "+91 90000 11111", _reference: null }),
    "PHONE_MISMATCH",
    "Claim with someone else's phone number is refused"
  );
  const claimed = await db.rpc("pay_claim_upi_qr", { _code: held, _phone: "98765 43210", _reference: "403829104829" });
  b = await getBooking(held);
  assert(
    claimed.booking.payment_status === "pending_verification" && b.payment_method === "upi_prepay" && b.payment_reference === "403829104829",
    "\"I have paid\" → Pending verification, method UPI QR, UTR saved"
  );
  assert(b.status === "pending" && b.payment_expires_at === null && b.payment_state === "PENDING", "Hold released (no 15-min expiry); not marked paid");
  const claimedTwice = await db.rpc("pay_claim_upi_qr", { _code: held, _phone: "+919876543210", _reference: "other" });
  assert(claimedTwice.booking.payment_reference === "403829104829", "Tapping \"I have paid\" twice changes nothing");

  const verifyList = await service.list({ filter: "verify" });
  const listed = verifyList.orders.find((o: any) => o.code === held);
  assert(!!listed && listed.payment_status === "pending_verification" && listed.balance_due_paise > 0, "Shows in Admin › Payments under \"Verify UPI\"");

  // Table booking without a deposit, paid by QR (flagged at insert, no server call needed)
  const tableQr = await placeOrder({ ...istSlot(60), items: "[]", total: 300, payment_method: "upi_prepay", payment_status: "pending_verification", payment_reference: "512345678901" });
  const tableListed = (await service.list({ filter: "verify" })).orders.find((o: any) => o.code === tableQr);
  assert(!!tableListed && tableListed.balance_due_paise === 30000, "Table-only QR payment is listed for staff too (₹300)");

  await service.collectBalance({ code: held, method: "upi", actor: "admin:Cashier" });
  b = await getBooking(held);
  assert(b.payment_state === "PAID" && b.payment_status === "paid" && b.balance_due_paise === 0, "Staff confirm with \"UPI\" collect → PAID");
  assert(!(await service.list({ filter: "verify" })).orders.some((o: any) => o.code === held), "…and it leaves the Verify UPI list");
  await expectError(
    () => db.rpc("pay_claim_upi_qr", { _code: held, _phone: "9876543210", _reference: null }),
    "ORDER_ALREADY_PAID",
    "Claiming an order that's already paid is refused"
  );
  const cancelledQr = await placeOrder({ ...istSlot(60), items: "[]", payment_method: "upi_prepay" });
  await asAnon("UPDATE public.bookings SET status = 'cancelled' WHERE code = $1", [cancelledQr]);
  await expectError(
    () => db.rpc("pay_claim_upi_qr", { _code: cancelledQr, _phone: "9876543210", _reference: null }),
    "NOT_PAYABLE",
    "Cancelled order can't be claimed"
  );

  // --------------------------------------------------------------------------
  console.log("\nSuite 7e: Parcel Charge + UPI QR Confirm / Reject");

  const takeawayRow = { order_type: "TAKEAWAY", table_number: null, pickup_time: "In 45 mins" };
  await expectError(
    () => placeOrder({ ...takeawayRow, packaging_charge: 0 }),
    "charges have changed",
    "Takeaway without the ₹30 parcel charge is refused"
  );
  const takeaway = await placeOrder({ ...takeawayRow, packaging_charge: 30, total: 1 });
  b = await getBooking(takeaway);
  assert(Number(b.packaging_charge) === 30, "Takeaway stores the ₹30 parcel charge (flat, per order)");
  assert(
    b.total_amount_paise === 51000 && b.total === 510,
    `Takeaway total priced on the server: ₹360 + ₹120 + ₹30 = ₹510, browser's ₹1 ignored (got ${b.total_amount_paise})`
  );
  const dineInCheck = await getBooking(await placeOrder({ ...istSlot(60), items: "[]", total: 200 }));
  assert(Number(dineInCheck.packaging_charge) === 0 && dineInCheck.total_amount_paise === 20000, "Dine-in / table booking has no parcel charge");

  const utrOrder = await placeOrder({ ...istSlot(60), items: "[]", total: 250, payment_method: "upi_prepay" });
  await expectError(
    () => db.rpc("pay_claim_upi_qr", { _code: utrOrder, _phone: "9876543210", _reference: null }),
    "UTR_REQUIRED",
    "\"I have paid\" without a UTR is refused"
  );
  await expectError(
    () => db.rpc("pay_claim_upi_qr", { _code: utrOrder, _phone: "9876543210", _reference: "12345" }),
    "UTR_REQUIRED",
    "…and a UTR that isn't 12 digits"
  );
  await expectError(
    () => db.rpc("pay_claim_upi_qr", { _code: utrOrder, _phone: "9876543210", _reference: "403829104829" }),
    "UTR_ALREADY_USED",
    "A UTR already used on another order is refused"
  );
  await expectError(
    () => placeOrder({ ...istSlot(60), items: "[]", total: 100, payment_method: "upi_prepay", payment_status: "pending_verification" }),
    "12-digit UPI transaction ID",
    "The public key can't flag \"I have paid\" without a UTR either"
  );
  await expectError(
    () => asAnon("UPDATE public.bookings SET payment_status = 'paid' WHERE code = $1", [utrOrder]),
    "PAYMENT_FIELDS_READ_ONLY",
    "The public key can never mark an order paid"
  );

  await service.confirmUpiQr({ code: tableQr, actor: "admin:Cashier" });
  b = await getBooking(tableQr);
  const qrPayment = (await pg.query<any>("SELECT * FROM public.payments WHERE booking_code = $1", [tableQr])).rows[0];
  assert(b.payment_state === "PAID" && b.payment_status === "paid" && b.amount_paid_paise === 30000, "Confirm → PAID for the full ₹300");
  assert(qrPayment?.method === "upi_qr" && qrPayment?.status === "captured" && qrPayment?.collected_by === "admin:Cashier", "Payment recorded as UPI QR, by the staff member");
  await expectError(() => service.confirmUpiQr({ code: tableQr, actor: "admin:Cashier" }), "no UPI payment waiting", "Confirming twice is refused");

  const toReject = await placeOrder({ payment_method: "upi_prepay" });
  await db.rpc("pay_claim_upi_qr", { _code: toReject, _phone: "9876543210", _reference: "612345678901" });
  await service.rejectUpiQr({ code: toReject, actor: "admin:Cashier", reason: "UTR not found" });
  b = await getBooking(toReject);
  assert(b.payment_status === "failed" && b.payment_state !== "PAID" && b.amount_paid_paise === 0, "Reject → not paid");
  assert(b.status === "pending_payment" && b.payment_expires_at !== null, "Rejected pre-order goes back to waiting for payment");
  const rejectAudit = (await pg.query<any>("SELECT * FROM public.payment_audit_log WHERE booking_code = $1 AND action = 'upi_qr_rejected'", [toReject])).rows[0]
    ?? (await pg.query<any>("SELECT * FROM public.payment_audit_log WHERE booking_code = $1", [toReject])).rows.find((r: any) => JSON.stringify(r).includes("upi_qr_rejected"));
  assert(!!rejectAudit && JSON.stringify(rejectAudit).includes("612345678901") && JSON.stringify(rejectAudit).includes("UTR not found"), "Rejection is audited with the UTR and reason");
  const reclaimed = await db.rpc("pay_claim_upi_qr", { _code: toReject, _phone: "9876543210", _reference: "712345678901" });
  assert(reclaimed.booking.payment_status === "pending_verification", "After a rejection the customer can submit a new UTR");
  assert((await service.list({ filter: "all" })).orders.some((o: any) => o.code === takeaway || o.code === toReject), "QR orders listed in Admin › Payments");

  // --------------------------------------------------------------------------
  // SUITE 8: HTTP adapters (PostgREST RPC + Razorpay REST) with a mocked fetch
  // --------------------------------------------------------------------------
  console.log("\nSuite 8: Server HTTP Adapters");

  const calls: Array<{ url: string; init: any }> = [];
  const mockFetch = (responder: (url: string) => { status: number; body: unknown }) =>
    (async (url: string, init: any) => {
      calls.push({ url, init });
      const r = responder(url);
      return new Response(JSON.stringify(r.body), { status: r.status });
    }) as unknown as typeof fetch;

  const supa = createSupabaseDb(
    { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "svc_key" } as any,
    mockFetch((url) => (url.endsWith("/pay_get_order") ? { status: 400, body: { code: "P0002", message: "ORDER_NOT_FOUND" } } : { status: 200, body: { ok: 1 } }))
  );
  const rpcResult = await supa.rpc("pay_list", { _filter: "all" });
  const last = calls[calls.length - 1];
  assert(
    (rpcResult as any).ok === 1 && last.url === "https://proj.supabase.co/rest/v1/rpc/pay_list" && last.init.headers.Authorization === "Bearer svc_key",
    "RPC goes to /rest/v1/rpc/<fn> with the service-role key (server only)"
  );
  await expectError(() => supa.rpc("pay_get_order", { _code: "X" }), "ORDER_NOT_FOUND", "PostgREST errors surface the SQL error code");
  await expectError(async () => createSupabaseDb({} as any), "NOT_CONFIGURED", "Missing service-role env → clear 'not configured' error");

  const gateway = createRazorpayClient({
    keyId: "rzp_test_abc",
    keySecret: "sec",
    fetchImpl: mockFetch((url) => (url.endsWith("/orders") ? { status: 200, body: { id: "order_X", amount: 14400 } } : { status: 400, body: { error: { description: "Bad request" } } })),
  });
  const rzOrder = await gateway.createOrder({ amountPaise: 14400, receipt: "CQ-1", notes: {} });
  const orderCall = calls[calls.length - 1];
  const sentBody = JSON.parse(orderCall.init.body);
  assert(
    rzOrder.id === "order_X" && sentBody.amount === 14400 && Number.isInteger(sentBody.amount) && sentBody.currency === "INR",
    "Razorpay order created in integer paise, INR"
  );
  assert(orderCall.init.headers.Authorization === `Basic ${Buffer.from("rzp_test_abc:sec").toString("base64")}`, "Razorpay API uses key id + secret (server only)");
  assert(gateway.isTestMode === true, "rzp_test_ key detected as test mode");
  await expectError(() => gateway.refund("pay_1", 100, {}), "GATEWAY_ERROR", "Razorpay API errors become a clear gateway error");
  await expectError(async () => createRazorpayClient({ keyId: "", keySecret: "" }), "NOT_CONFIGURED", "Missing Razorpay keys → 'not configured'");

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
