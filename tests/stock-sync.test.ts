/**
 * Tests for Stock Status Synchronization & Server-side Validation
 */

// Mock localStorage and window for Node environment
const mockStorage: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (key: string) => (key in mockStorage ? mockStorage[key] : null),
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

(global as any).window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: (global as any).localStorage,
};

(global as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params: any = {}) {
    this.type = type;
    this.detail = params.detail;
  }
};

import { getStoredMenu, updateMenuItem } from "../src/lib/menu";
import {
  getOutOfStockItemIds,
  setItemStock,
  isItemOutOfStock,
  isItemInStock,
} from "../src/lib/stock";
import { createBooking, getAllBookings } from "../src/lib/bookings.functions";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function runTests() {
  console.log("\n==================================================");
  console.log("  Running Stock Status Sync & Validation Test Suite");
  console.log("==================================================\n");

  const targetItemId = "cappuccino";

  // Test 1: Initially item is in stock
  console.log("Suite 1: Admin Stock Toggle Synchronization");
  const initialMenu = getStoredMenu();
  const initialItem = initialMenu.find((m) => m.id === targetItemId);
  assert(initialItem !== undefined, "Target item exists in menu");
  assert(isItemInStock(initialItem!), "Target item is initially in stock");

  // Test 2: Admin toggles item to Out of Stock
  const ok1 = updateMenuItem(targetItemId, { isAvailable: false });
  assert(ok1 === true, "Admin updateMenuItem returned true");

  const updatedMenu = getStoredMenu();
  const updatedItem = updatedMenu.find((m) => m.id === targetItemId);
  assert(updatedItem?.isAvailable === false, "Item isAvailable is now false in stored menu");
  assert(isItemOutOfStock(targetItemId), "isItemOutOfStock returns true for toggled item");
  assert(
    getOutOfStockItemIds().includes(targetItemId),
    "getOutOfStockItemIds includes the item toggled by admin"
  );

  // Test 3: Server-side validation blocks out-of-stock item
  console.log("\nSuite 2: Server-side Validation on Booking Pre-Orders");
  let errorThrown = false;
  let errorMessage = "";
  try {
    await createBooking({
      data: {
        code: `TEST-STOCK-REJECT-${Date.now().toString().slice(-4)}`,
        date: new Date().toISOString().slice(0, 10),
        time: "15:00",
        party: 2,
        seating: "T-02",
        tableNumber: "T-02",
        tableType: "window",
        hasPreorder: true,
        name: "Test Customer",
        phone: "+91 98888 77777",
        items: [
          {
            id: targetItemId,
            name: "Cappuccino",
            qty: 1,
            price: 149,
            prepTimeMinutes: 4,
            fulfillment: "pre_ordered",
            status: "pending",
          },
        ],
        total: 149,
        paymentMethod: "online_razorpay",
        paymentStatus: "pending_cash",
        status: "confirmed",
        kitchenStatus: "new",
        orderType: "dine_in",
      },
    });
  } catch (err: any) {
    errorThrown = true;
    errorMessage = err.message;
  }

  assert(errorThrown, "createBooking strictly threw an error when ordering out-of-stock item");
  assert(
    errorMessage.includes("out of stock") && errorMessage.includes("Cappuccino"),
    `Error message informs customer of out-of-stock item: "${errorMessage}"`
  );

  // Test 4: Admin toggles item back to In Stock
  console.log("\nSuite 3: Restoring Item Stock & Valid Booking Completion");
  const ok2 = updateMenuItem(targetItemId, { isAvailable: true });
  assert(ok2 === true, "Admin updateMenuItem restored item to in-stock");

  const restoredMenu = getStoredMenu();
  const restoredItem = restoredMenu.find((m) => m.id === targetItemId);
  assert(restoredItem?.isAvailable === true, "Item isAvailable restored to true");
  assert(!isItemOutOfStock(targetItemId), "isItemOutOfStock returns false after restore");

  // Test 5: Booking succeeds with in-stock item
  const validCode = `TEST-STOCK-OK-${Date.now().toString().slice(-4)}`;
  await createBooking({
    data: {
      code: validCode,
      date: new Date().toISOString().slice(0, 10),
      time: "16:00",
      party: 2,
      seating: "T-02",
      tableNumber: "T-02",
      tableType: "window",
      hasPreorder: true,
      name: "Valid Customer",
      phone: "+91 98888 77777",
      items: [
        {
          id: targetItemId,
          name: "Cappuccino",
          qty: 1,
          price: 149,
          prepTimeMinutes: 4,
          fulfillment: "pre_ordered",
          status: "pending",
        },
      ],
      total: 149,
      paymentMethod: "online_razorpay",
      paymentStatus: "pending_cash",
      status: "confirmed",
      kitchenStatus: "new",
      orderType: "dine_in",
    },
  });

  const allBookings = await getAllBookings();
  const createdBooking = allBookings.find((b) => b.code === validCode);
  assert(createdBooking !== undefined, "Booking with in-stock item created successfully");

  console.log("\n==================================================");
  console.log("  All Stock Synchronization & Validation Tests Passed!");
  console.log("==================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
