import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  getCurrentSession,
  verifyJwtToken,
} from "../src/lib/auth";
import {
  createBooking,
  getUserBookings,
  type BookingInput,
} from "../src/lib/bookings.functions";

async function runTests() {
  console.log("==================================================");
  console.log(" Running User Auth & Cross-Device Sync Tests");
  console.log("==================================================");

  // ── TEST 1: Check that 'Lekhana B S' is completely eliminated from source code ──
  console.log("\n[TEST 1] Verifying no hardcoded 'Lekhana' remains in src/...");
  const VISIT_PAGE = path.resolve(process.cwd(), "src", "routes", "visit.tsx");
  function scanDir(dir: string): string[] {
    const results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...scanDir(fullPath));
      } else if (fullPath === VISIT_PAGE) {
        // The Visit page names Lekhana as a co-founder: real content, not a hardcoded logged-in user
        continue;
      } else if (/\.(tsx?|jsx?|json|css|html)$/i.test(file)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (/lekhana/i.test(content)) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  const srcDir = path.resolve(process.cwd(), "src");
  const matches = scanDir(srcDir);
  assert.strictEqual(
    matches.length,
    0,
    `Found hardcoded 'Lekhana' in: ${matches.join(", ")}`
  );
  console.log("✔ Passed: Zero hardcoded references to 'Lekhana' found in src/");

  // ── TEST 2: Registration returns real user object and valid JWT token ──────────
  console.log("\n[TEST 2] Testing registration with real user object & JWT...");
  const uniqueId = Date.now();
  const testUserA = {
    name: "Rohan Mehta",
    email: `rohan_${uniqueId}@example.com`,
    phone: "9876543210",
    password: "Password@123",
  };

  const regResA = await registerUser(testUserA);
  assert.strictEqual(regResA.success, true, "User registration should succeed");
  assert.ok(regResA.user, "User object must be returned");
  assert.strictEqual(regResA.user?.name, "Rohan Mehta", "Name must match registered name");
  assert.strictEqual(regResA.user?.email, testUserA.email, "Email must match registered email");
  assert.ok(regResA.token, "A JWT token must be returned");

  // Verify JWT claims
  const verifiedToken = verifyJwtToken(regResA.token!);
  assert.strictEqual(verifiedToken.valid, true, "JWT token must be valid");
  assert.strictEqual(verifiedToken.payload?.sub, regResA.user?.id, "JWT subject must be user id");
  assert.strictEqual(verifiedToken.payload?.name, "Rohan Mehta", "JWT payload must contain user name");
  console.log("✔ Passed: Registration created real user and standard signed JWT");

  // ── TEST 3: Login returns real user and sets auth session ──────────────────────
  console.log("\n[TEST 3] Testing login for User A...");
  const loginResA = await loginUser({
    email: testUserA.email,
    password: testUserA.password,
  });
  assert.strictEqual(loginResA.success, true, "Login must succeed");
  assert.strictEqual(loginResA.user?.name, "Rohan Mehta", "Logged-in user must be Rohan Mehta");
  assert.strictEqual(getCurrentUser()?.name, "Rohan Mehta", "getCurrentUser must reflect User A");
  console.log("✔ Passed: Login succeeded and stored real user in auth state");

  // ── TEST 4: Booking creation linked to user ID ─────────────────────────────────
  console.log("\n[TEST 4] Creating booking linked to User A's user_id...");
  const bookingA: BookingInput = {
    code: `BK-TEST-${uniqueId}`,
    date: "2026-11-01",
    time: "19:00",
    party: 2,
    seating: "Window Booth",
    tableNumber: "W-2",
    tableType: "window",
    hasPreorder: false,
    estimatedPrepTime: 0,
    name: regResA.user!.name,
    phone: regResA.user!.phone,
    customerEmail: regResA.user!.email,
    dietary: [],
    accessibility: [],
    windowPriority: true,
    items: [],
    total: 250,
    paymentMethod: "pay_on_arrival",
    paymentStatus: "pending_cash",
    userId: regResA.user!.id,
    status: "confirmed",
  };

  const createResult = await createBooking({ data: bookingA });
  assert.strictEqual(createResult.code, bookingA.code);
  console.log(`✔ Passed: Booking #${bookingA.code} created and linked to userId=${regResA.user!.id}`);

  // ── TEST 5: Cross-device record retrieval using user_id ────────────────────────
  console.log("\n[TEST 5] Testing cross-device retrieval using User A's userId (phone simulation)...");
  // Simulating logging in on a second device (phone): query by userId
  const phoneBookings = await getUserBookings({
    userId: regResA.user!.id,
    phone: regResA.user!.phone,
    email: regResA.user!.email,
  });

  const foundA = phoneBookings.find((b) => b.code === bookingA.code);
  assert.ok(foundA, "Booking must be retrieved by userId on another device");
  assert.strictEqual(foundA?.name, "Rohan Mehta");
  assert.strictEqual(foundA?.userId, regResA.user!.id);
  console.log("✔ Passed: Phone successfully fetched user's records using userId");

  // ── TEST 6: User switching & complete data cleanup on logout ───────────────────
  console.log("\n[TEST 6] Testing account switching and logout cleanup...");
  // Register and login User B
  const testUserB = {
    name: "Priya Rao",
    email: `priya_${uniqueId}@example.com`,
    phone: "9123456789",
    password: "Password@123",
  };
  const regResB = await registerUser(testUserB);
  assert.strictEqual(regResB.success, true);
  assert.strictEqual(regResB.user?.name, "Priya Rao");

  // Verify auth state updated to User B
  assert.strictEqual(getCurrentUser()?.name, "Priya Rao", "Active user must now be Priya Rao");
  assert.notStrictEqual(getCurrentUser()?.name, "Rohan Mehta");

  // User B should NOT see User A's private booking
  const userBBookings = await getUserBookings({
    userId: regResB.user!.id,
    phone: regResB.user!.phone,
    email: regResB.user!.email,
  });
  const leakedBooking = userBBookings.find((b) => b.code === bookingA.code);
  assert.strictEqual(leakedBooking, undefined, "User B must not see User A's bookings");
  console.log("✔ Passed: User profile dynamically updated to Priya Rao without leakage");

  // Test Logout
  logoutUser();
  assert.strictEqual(getCurrentUser(), null, "User must be null after logout");
  assert.strictEqual(getCurrentSession(), null, "Session must be null after logout");
  console.log("✔ Passed: Old user data completely cleared on logout");

  console.log("\n==================================================");
  console.log(" All Tests Passed Successfully! 🚀");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
