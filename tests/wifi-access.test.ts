/**
 * Automated Test Suite for Cafe WiFi access
 * Runs the real migrations in PGlite and the real /api/wifi service code.
 * Tests:
 * 1. The public (anon) key can't read wifi_settings or call the wifi_* functions.
 * 2. Admin settings: validation, save/read, admin token required.
 * 3. Customer session: password checked on the server; tokens can't cross roles.
 * 4. Access rules: own confirmed (and paid) dine-in booking, 15 min before → 30 min after the slot;
 *    the password is never returned otherwise.
 * 5. QR payload and work-friendly table tags.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";
import { createWifiService } from "../api/_lib/wifi.js";
import { issueAdminToken, verifyAdminToken } from "../api/_lib/admin-auth.js";
import { buildWifiQrValue } from "../src/lib/wifi";
import { isWorkFriendlyTable, tableTypes, TABLE_FEATURE_LABELS } from "../src/data/menu";

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
    const msg = `${err?.status || ""} ${err?.code || ""} ${err?.message || ""}`;
    assert(msg.includes(part), `${testName} → ${msg.trim()}`);
  }
}

const MIGRATIONS = [
  "20261026120000_add_order_type_and_delivery_fields.sql",
  "20261028000000_enforce_order_type_rules.sql",
  "20261029000000_per_item_kitchen_status.sql",
  "20261030000000_preorder_payments.sql",
  "20261031000000_order_status_flow.sql",
  "20261101000000_billed_status.sql",
  "20261102000000_online_payment_methods.sql",
  "20261103000000_wifi_access.sql",
];

const env = { PAYMENTS_ADMIN_SECRET: "test_admin_secret" } as any;

/** IST date + HH:MM for now + offset minutes (how the reserve page sends dine-in times). */
function istSlot(offsetMinutes: number) {
  const d = new Date(Date.now() + offsetMinutes * 60000 + 330 * 60000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

async function runTests() {
  console.log("\n==================================================");
  console.log("  Running CafeQ Cafe WiFi Test Suite");
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
    CREATE TABLE public.menu_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar NOT NULL UNIQUE, category varchar NOT NULL,
      price numeric(10,2) NOT NULL, is_available boolean DEFAULT true);
    GRANT SELECT, INSERT, UPDATE ON public.bookings TO anon;
    GRANT SELECT ON public.cafe_settings, public.menu_items TO anon;
  `);
  for (const m of MIGRATIONS) {
    await pg.exec(fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", m), "utf8"));
  }

  // Service-role db adapter (what /api uses through PostgREST RPC)
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
  const wifi = createWifiService({ db, env });

  const hash = bcrypt.hashSync("Secret@123", 4);
  const users = await pg.query<{ id: string; email: string }>(
    `INSERT INTO public.users (name, email, phone, password_hash, role) VALUES
       ('Neha Rao', 'neha@example.com', '+91 98765 43210', $1, 'user'),
       ('Arjun Iyer', 'arjun@example.com', '+91 91234 56789', $1, 'user'),
       ('Cafe Admin', 'admin@cafeq.com', '+91 90000 00001', $1, 'admin')
     RETURNING id, email`,
    [hash]
  );
  const neha = users.rows[0].id;
  const arjun = users.rows[1].id;
  const admin = { id: users.rows[2].id, name: "Cafe Admin" };

  let seq = 0;
  /** Fixture booking written directly (triggers off) so each test controls its exact state. */
  async function booking(fields: Record<string, unknown> = {}, offsetMinutes = 0) {
    const code = `CQ-WIFI-${++seq}`;
    const row: Record<string, unknown> = {
      code, ...istSlot(offsetMinutes), party: 2, seating: "Window 2-Top", name: "Neha Rao", phone: "+91 98765 43210",
      user_id: neha, status: "confirmed", order_type: "DINE_IN", payment_method: "pay_on_arrival", ...fields,
    };
    const keys = Object.keys(row);
    await pg.exec("SET session_replication_role = replica");
    await pg.query(
      `INSERT INTO public.bookings (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      keys.map((k) => row[k]) as any[]
    );
    await pg.exec("SET session_replication_role = DEFAULT");
    return code;
  }

  // --------------------------------------------------------------------------
  console.log("Suite 1: Never Public");

  await pg.exec("SET ROLE anon");
  for (const [sql, label] of [
    ["SELECT * FROM public.wifi_settings", "read wifi_settings"],
    ["SELECT public.wifi_admin_get()", "call wifi_admin_get()"],
    [`SELECT public.wifi_access('${neha}'::uuid, 'CQ-X')`, "call wifi_access()"],
  ]) {
    let denied = false;
    try {
      await pg.query(sql);
    } catch (err: any) {
      denied = /permission denied/i.test(err?.message || "");
    }
    assert(denied, `Public (anon) key cannot ${label}`);
  }
  const pub = await pg.query<{ key: string }>("SELECT key FROM public.cafe_settings");
  assert(!pub.rows.some((r) => /wifi/i.test(r.key)), "Nothing WiFi-related in the public cafe_settings table");
  await pg.exec("RESET ROLE");

  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Admin Settings");

  const adminToken = issueAdminToken(admin, { env });
  await expectError(() => wifi.adminGet(""), "401", "Reading settings without an admin token is refused");
  const notSet = await wifi.adminGet(adminToken);
  assert(notSet.settings.ssid === "" && notSet.settings.session_minutes === 120, "Before setup: empty network, 2-hour reservation length");

  await expectError(() => wifi.adminSave(adminToken, { settings: { ssid: "", password: "longenough1" } }), "WIFI_INVALID_SSID", "Empty network name rejected");
  await expectError(() => wifi.adminSave(adminToken, { settings: { ssid: "CafeQ-Guest", password: "short" } }), "WIFI_INVALID_PASSWORD", "Password under 8 characters rejected");
  await expectError(
    () => wifi.adminSave(adminToken, { settings: { ssid: "CafeQ-Guest", password: "brew-2026!", valid_from: "2026-11-05T10:00:00Z", valid_until: "2026-11-01T10:00:00Z" } }),
    "WIFI_INVALID_WINDOW",
    "\"Valid until\" before \"Valid from\" rejected"
  );

  const saved = await wifi.adminSave(adminToken, { settings: { ssid: "CafeQ;Guest", password: "brew:2026,\"hot\"" } });
  assert(saved.settings.ssid === "CafeQ;Guest" && saved.settings.updated_by === "admin:Cafe Admin", "Admin saves settings (who and when recorded)");
  const again = await wifi.adminGet(adminToken);
  assert(again.settings.password === "brew:2026,\"hot\"", "Saved settings are read back from the database");

  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Customer Session");

  await expectError(() => wifi.customerSession({ email: "neha@example.com", password: "wrong-pass" }), "401", "Wrong password → no session");
  const { token: nehaToken } = await wifi.customerSession({ email: "neha@example.com", password: "Secret@123" });
  const { token: arjunToken } = await wifi.customerSession({ email: "arjun@example.com", password: "Secret@123" });
  assert(typeof nehaToken === "string" && nehaToken.includes("."), "Correct password → server-signed customer token");
  let crossRole = false;
  try {
    verifyAdminToken(nehaToken, { env });
  } catch {
    crossRole = true;
  }
  assert(crossRole, "A customer token is not accepted as an admin token");
  await expectError(() => wifi.adminSave(nehaToken, { settings: { ssid: "Hacked", password: "12345678" } }), "401", "Customer can't change WiFi settings");
  await expectError(() => wifi.access(adminToken, { codes: ["CQ-X"] }), "LOGIN_REQUIRED", "An admin token is not accepted as a customer token");
  await expectError(() => wifi.access("", { codes: ["CQ-X"] }), "LOGIN_REQUIRED", "No token → 401, nothing returned");
  const [p, sig] = nehaToken.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sub: arjun })).toString("base64url");
  await expectError(() => wifi.access(`${forged}.${sig}`, { codes: ["CQ-X"] }), "LOGIN_REQUIRED", "Tampered token (swapped user) → 401");

  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Access Window & Eligibility");

  const check = async (code: string, token = nehaToken) => (await wifi.access(token, { codes: [code] })).access[code];

  let a = await check(await booking({}, 10));
  assert(a.status === "available" && a.ssid === "CafeQ;Guest" && a.password === "brew:2026,\"hot\"", "Confirmed, slot in 10 min (inside 15-min lead) → details shown");
  a = await check(await booking({}, 30));
  assert(a.status === "not_yet" && !("password" in a) && !("ssid" in a), "Slot in 30 min → not yet, no password sent");
  assert(
    new Date(a.available_until!).getTime() - new Date(a.available_from!).getTime() === (15 + 120 + 30) * 60000,
    "Window = 15 min before → slot + 2 h + 30 min"
  );
  a = await check(await booking({}, -140));
  assert(a.status === "available", "Slot 2 h 20 min ago (still within 30 min after it ends) → shown");
  a = await check(await booking({}, -160));
  assert(a.status === "ended" && !("password" in a), "Slot ended over 30 min ago → ended, no password");

  a = await check(await booking({ status: "pending" }, 0));
  assert(a.status === "awaiting_confirmation" && !("password" in a), "Pending (not yet confirmed) → hidden");
  const unpaid = await booking({ payment_method: "online_razorpay", payment_state: "PENDING", payment_status: "pending_online" }, 0);
  a = await check(unpaid);
  assert(a.status === "awaiting_payment" && !("password" in a), "Online payment not completed → hidden");
  await pg.query("UPDATE public.bookings SET payment_state = 'PAID', payment_status = 'paid' WHERE code = $1", [unpaid]);
  a = await check(unpaid);
  assert(a.status === "available", "…same booking after payment → shown");
  a = await check(await booking({ payment_required: true, payment_state: "PARTIALLY_PAID" }, 0));
  assert(a.status === "available", "Pre-order with its deposit paid → shown");
  a = await check(await booking({ payment_required: true, payment_state: "UNPAID", status: "confirmed" }, 0));
  assert(a.status === "awaiting_payment", "Pre-order deposit unpaid → hidden");

  a = await check(await booking({ status: "cancelled" }, 0));
  assert(a.status === "cancelled" && !("password" in a), "Cancelled → hidden");
  a = await check(await booking({ order_type: "TAKEAWAY" }, 0));
  assert(a.status === "not_dine_in" && !("password" in a), "Takeaway order → no WiFi");
  const nehasCode = await booking({}, 0);
  a = await check(nehasCode, arjunToken);
  assert(a.status === "not_found" && !("password" in a), "Another customer's booking → looks like it doesn't exist");
  a = await check(await booking({ status: "completed" }, -60));
  assert(a.status === "available", "Completed order, still within the window → shown");

  await wifi.adminSave(adminToken, { settings: { ssid: "CafeQ-Guest", password: "brew-2026!", valid_until: new Date(Date.now() - 60000).toISOString() } });
  a = await check(nehasCode);
  assert(a.status === "not_configured" && !("password" in a), "Credentials past their \"valid until\" → hidden");
  await wifi.adminSave(adminToken, { settings: { ssid: "CafeQ-Guest", password: "brew-2026!", session_minutes: 60 } });
  a = await check(await booking({}, -100));
  assert(a.status === "ended", "Reservation length 60 min: slot 100 min ago → ended");
  a = await check(nehasCode);
  assert(a.status === "available" && a.ssid === "CafeQ-Guest", "Updated details are served right away");

  const many = await wifi.access(nehaToken, { codes: [nehasCode, "CQ-NOPE"] });
  assert(many.access[nehasCode].status === "available" && many.access["CQ-NOPE"].status === "not_found", "Several bookings checked in one request");

  // --------------------------------------------------------------------------
  console.log("\nSuite 5: QR Code & Table Tags");

  assert(buildWifiQrValue("CafeQ-Guest", "brew-2026!") === "WIFI:T:WPA;S:CafeQ-Guest;P:brew-2026!;;", "QR payload: WIFI:T:WPA;S:<ssid>;P:<password>;;");
  assert(buildWifiQrValue("Cafe;Q", 'a:b,c"d\\e') === 'WIFI:T:WPA;S:Cafe\\;Q;P:a\\:b\\,c\\"d\\\\e;;', "Special characters escaped so phones read them correctly");
  const communal = tableTypes.find((t) => t.id === "communal")!;
  assert(communal.features.includes("power") && TABLE_FEATURE_LABELS.power === "Power outlets", "Long Communal Table → \"Power outlets\"");
  const work = tableTypes.filter(isWorkFriendlyTable).map((t) => t.id);
  assert(work.includes("communal") && work.includes("booth") && !work.includes("courtyard"), `Work-friendly filter → ${work.join(", ")}`);

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
