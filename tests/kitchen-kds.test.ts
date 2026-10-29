/**
 * Automated Test Suite for CafeQ Kitchen Display System (KDS)
 * Tests:
 * 1. Role-Based Access Control (RBAC): Admin, Kitchen, and User boundary enforcement.
 * 2. Kitchen Order State Flow: new -> preparing -> ready -> completed, plus rejection.
 * 3. Item-level checklist status toggling.
 * 4. 86 / Out-of-Stock item filtering.
 */

import bcrypt from "bcryptjs";

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

// Mock window and CustomEvent
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
  console.log("  Running CafeQ KDS & Kitchen Role Test Suite");
  console.log("==================================================\n");

  // Dynamic import after mocks
  const {
    seedDefaultAdmin,
    seedDefaultKitchen,
    loginAdmin,
    loginKitchen,
    createKitchenStaffAccount,
    toggleKitchenStaffStatus,
    resetKitchenStaffPassword,
  } = await import("../src/lib/auth");

  const {
    createBooking,
    updateKitchenOrderStatus,
    updateBookingStatus,
    updateOrderItemStatus,
    getAllBookings,
  } = await import("../src/lib/bookings.functions");

  const { isItemOutOfStock, setItemStock, filterAvailableMenu } = await import("../src/lib/stock");

  // --------------------------------------------------------------------------
  // SUITE 1: Role-Based Access Control (RBAC) & Authentication
  // --------------------------------------------------------------------------
  console.log("Suite 1: Role-Based Access Control (RBAC)");

  // 1. Seed accounts
  const admin = await seedDefaultAdmin();
  assert(admin !== null && admin.role === "admin", "Admin user seeded with role 'admin'");

  const kitchen = await seedDefaultKitchen();
  assert(kitchen !== null && kitchen.role === "kitchen", "Kitchen staff seeded with role 'kitchen'");

  // 2. Kitchen login with valid kitchen credentials
  const kitchenLoginRes = await loginKitchen({
    identifier: "Kitchen",
    password: "Kitchen@123",
  });
  assert(kitchenLoginRes.success === true && kitchenLoginRes.user?.role === "kitchen", "Kitchen user can login to Kitchen portal");

  // 3. Admin login to Kitchen portal (Admin can access both)
  const adminKitchenLogin = await loginKitchen({
    identifier: "CafeQ",
    password: "Cafe@123",
  });
  assert(adminKitchenLogin.success === true && adminKitchenLogin.user?.role === "admin", "Admin can access Kitchen portal");

  // 4. Kitchen user MUST be denied access to Admin portal
  const kitchenAdminLogin = await loginAdmin({
    identifier: "Kitchen",
    password: "Kitchen@123",
  });
  assert(
    kitchenAdminLogin.success === false && kitchenAdminLogin.error?.includes("Administrator privileges required"),
    "Kitchen user is strictly denied access to Admin console"
  );

  // 5. Admin can create and disable kitchen staff
  const newStaffRes = await createKitchenStaffAccount({
    username: "linecook_alex",
    name: "Alex Line Cook",
    password: "CookPassword123",
  });
  assert(newStaffRes.success === true, "Admin can create new kitchen staff account");

  // Login with new staff
  const alexLogin = await loginKitchen({
    identifier: "linecook_alex",
    password: "CookPassword123",
  });
  assert(alexLogin.success === true, "New kitchen staff can authenticate successfully");

  // Disable staff member
  if (alexLogin.user) {
    await toggleKitchenStaffStatus(alexLogin.user.id, true);
    const disabledLogin = await loginKitchen({
      identifier: "linecook_alex",
      password: "CookPassword123",
    });
    assert(
      disabledLogin.success === false && disabledLogin.error?.includes("disabled"),
      "Disabled kitchen staff account is blocked from login"
    );

    // Reset password
    await toggleKitchenStaffStatus(alexLogin.user.id, false);
    await resetKitchenStaffPassword(alexLogin.user.id, "BrandNewSecret999");
    const updatedLogin = await loginKitchen({
      identifier: "linecook_alex",
      password: "BrandNewSecret999",
    });
    assert(updatedLogin.success === true, "Resetting kitchen staff password works with bcrypt verification");
  }

  // --------------------------------------------------------------------------
  // SUITE 2: Live Orders Board & Status Flow
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Order State Lifecycle Flow");

  const testOrderCode = "CQ-TEST-KDS-01";
  await createBooking({
    data: {
      code: testOrderCode,
      date: new Date().toISOString().slice(0, 10),
      time: "10:30",
      party: 2,
      seating: "T-04",
      tableNumber: "T-04",
      tableType: "window",
      hasPreorder: true,
      estimatedPrepTime: 12,
      name: "Rohit Sharma",
      phone: "+91 98888 77777",
      notes: "Extra spicy fries, allergy to peanuts",
      items: [
        {
          id: "classic-cappuccino",
          name: "Velvet Cappuccino",
          qty: 2,
          price: 4.5,
          prepTimeMinutes: 4,
          fulfillment: "pre_ordered",
          status: "pending",
          category: "Coffee & Drinks",
          isVeg: true,
        },
        {
          id: "herb-fries",
          name: "Crispy Herb & Truffle Fries",
          qty: 1,
          price: 6.5,
          prepTimeMinutes: 8,
          fulfillment: "pre_ordered",
          status: "pending",
          category: "Bites & Sides",
          isVeg: true,
        },
      ],
      total: 310,
      paymentMethod: "upi_prepay",
      paymentStatus: "paid",
      status: "confirmed",
      kitchenStatus: "new",
      orderType: "dine_in",
    },
  });

  const allOrders = await getAllBookings();
  const created = allOrders.find((o) => o.code === testOrderCode);
  assert(created !== undefined, "Order ticket created in system");
  assert(created?.kitchenStatus === "new", "Initial kitchen status is 'new'");

  // Step 2.0: Admin confirms the order (new orders start as pending)
  assert(created?.status === "pending", "New order starts as pending (awaiting admin confirmation)");
  await updateBookingStatus({ code: testOrderCode, status: "confirmed" });

  // Step 2.1: Accept and start preparing
  await updateKitchenOrderStatus({
    code: testOrderCode,
    status: "preparing",
  });
  const prepOrders = await getAllBookings();
  const inPrep = prepOrders.find((o) => o.code === testOrderCode);
  assert(inPrep?.kitchenStatus === "preparing" && Boolean(inPrep?.acceptedAt), "Order transitions to 'preparing' with acceptedAt timestamp");

  // Step 2.2: One item marked ready on its own; the other keeps cooking
  await updateOrderItemStatus({
    code: testOrderCode,
    itemId: "classic-cappuccino",
    status: "READY",
    expectedStatus: "PREPARING",
  });
  const itemCheckedOrders = await getAllBookings();
  const checkedOrder = itemCheckedOrders.find((o) => o.code === testOrderCode);
  const targetItem = checkedOrder?.items?.find((i) => i.id === "classic-cappuccino");
  const otherItem = checkedOrder?.items?.find((i) => i.id === "herb-fries");
  assert(
    targetItem?.status === "READY" && otherItem?.status === "PREPARING" && checkedOrder?.kitchenStatus === "preparing",
    "Single item marked READY independently while the rest of the ticket stays in prep"
  );

  // Step 2.3: Mark entire order Ready
  await updateKitchenOrderStatus({
    code: testOrderCode,
    status: "ready",
  });
  const readyOrders = await getAllBookings();
  const readyOrder = readyOrders.find((o) => o.code === testOrderCode);
  assert(readyOrder?.kitchenStatus === "ready" && Boolean(readyOrder?.readyAt), "Order transitions to 'ready' with readyAt timestamp");

  // Step 2.4: Complete and Serve
  await updateKitchenOrderStatus({
    code: testOrderCode,
    status: "completed",
  });
  const completeOrders = await getAllBookings();
  const completedOrder = completeOrders.find((o) => o.code === testOrderCode);
  assert(
    completedOrder?.kitchenStatus === "completed" && completedOrder?.status === "completed",
    "Order marked completed synchronizes both kitchenStatus and overall booking status"
  );

  // Step 2.5: Order Rejection with Reason
  const rejectTestCode = "CQ-REJECT-02";
  await createBooking({
    data: {
      code: rejectTestCode,
      date: new Date().toISOString().slice(0, 10),
      time: "11:00",
      party: 1,
      seating: "T-01",
      tableNumber: "T-01",
      tableType: "counter",
      hasPreorder: true,
      name: "Pooja Hegde",
      phone: "+91 91111 22222",
      items: [
        {
          id: "woodfired-pizza",
          name: "Artisanal Margherita Sourdough Pizza",
          qty: 1,
          price: 14.5,
          prepTimeMinutes: 16,
          fulfillment: "pre_ordered",
          status: "pending",
        },
      ],
      total: 290,
      paymentMethod: "pay_on_arrival",
      paymentStatus: "pending_cash",
      status: "confirmed",
      kitchenStatus: "new",
      orderType: "dine_in",
    },
  });

  await updateBookingStatus({ code: rejectTestCode, status: "confirmed" });
  await updateKitchenOrderStatus({
    code: rejectTestCode,
    status: "cancelled",
    reason: "Woodfired oven undergoing urgent temperature calibration",
    cancelledBy: "kitchen",
  });
  const rejectedOrders = await getAllBookings();
  const rejected = rejectedOrders.find((o) => o.code === rejectTestCode);
  assert(
    rejected?.kitchenStatus === "cancelled" &&
    rejected?.status === "cancelled" &&
    rejected?.cancellationReason?.includes("temperature calibration") &&
    rejected?.cancelledBy === "kitchen",
    "Kitchen can reject order with explicit reason stored and synchronized"
  );

  // --------------------------------------------------------------------------
  // SUITE 3: Out-of-Stock (86) Management
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: 86 / Out-of-Stock Item Management");

  const testItemId = "fudgy-brownie";
  assert(isItemOutOfStock(testItemId) === false, "Item initially in stock");

  setItemStock(testItemId, true);
  assert(isItemOutOfStock(testItemId) === true, "Item successfully marked out of stock (86)");

  const mockMenu: any[] = [
    { id: "fudgy-brownie", name: "Warm Fudgy Brownie", price: 5.5 },
    { id: "classic-cappuccino", name: "Velvet Cappuccino", price: 4.5 },
  ];
  const available = filterAvailableMenu(mockMenu);
  assert(
    available.length === 1 && available[0].id === "classic-cappuccino",
    "filterAvailableMenu hides out-of-stock items from customer views"
  );

  setItemStock(testItemId, false);
  assert(isItemOutOfStock(testItemId) === false, "Item restored to in-stock");

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
