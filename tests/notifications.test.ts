/**
 * Automated Test Suite for CafeQ Multi-Channel Notification Engine
 * Tests:
 * 1. Template Rendering (SMS, Email, WhatsApp for all 6 lifecycle events)
 * 2. User Notification Preferences (Opt-in / Opt-out per channel & reminder toggle)
 * 3. Provider Formatting & Dispatch (SMS, Email with PDF attachment, WhatsApp)
 * 4. Delivery Audit Logger (Logging sent, retrying, failed + querying logs)
 * 5. Notification Retry Queue (Exponential backoff & error recovery)
 * 6. Orchestrated Multi-Channel Dispatch Pipeline
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

// Mock window and CustomEvent
(global as any).window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

import {
  renderNotificationTemplate,
  getNotificationPreferences,
  saveNotificationPreferences,
  isChannelEnabled,
  sendSmsNotification,
  sendEmailNotification,
  sendWhatsAppNotification,
  logDelivery,
  getDeliveryLogs,
  updateDeliveryLogStatus,
  enqueueNotification,
  getRetryQueue,
  processRetryQueue,
  sendNotification,
  type NotificationPayload,
  type NotificationEvent,
} from "../src/lib/notifications";

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
  console.log("  Running Multi-Channel Notification Engine Tests");
  console.log("==================================================\n");

  const samplePayload: NotificationPayload = {
    event: "reservation_confirmed",
    recipient: "+91 98765 43210",
    customerEmail: "priya@example.com",
    customerPhone: "+91 98765 43210",
    customerName: "Priya Sharma",
    bookingCode: "BK-NOTIF1",
    date: "2026-10-22",
    time: "19:30",
    partySize: 4,
    tableType: "Indoor Booth",
    totalAmount: 1450,
  };

  // ─── 1. Template Rendering for All 6 Events ───
  console.log("1. Template Rendering (All 6 Lifecycle Events)");
  const events: NotificationEvent[] = [
    "reservation_confirmed",
    "reminder",
    "order_accepted",
    "order_ready",
    "payment_success",
    "cancellation",
  ];

  for (const ev of events) {
    const payload = { ...samplePayload, event: ev };
    const rendered = renderNotificationTemplate(payload);

    assert(Boolean(rendered.sms && rendered.sms.length > 0), `SMS template generated for [${ev}]`);
    assert(rendered.sms.includes("BK-NOTIF1"), `SMS template contains booking code for [${ev}]`);
    assert(Boolean(rendered.emailSubject && rendered.emailHtml), `Email HTML template generated for [${ev}]`);
    assert(rendered.emailHtml.includes("CafeQ"), `Email HTML contains CafeQ branding for [${ev}]`);
    assert(Boolean(rendered.whatsappText && rendered.whatsappText.length > 0), `WhatsApp template generated for [${ev}]`);
  }

  // ─── 2. User Notification Preferences ───
  console.log("\n2. Per-User Notification Preferences (Opt-in / Opt-out)");
  const defaultPrefs = await getNotificationPreferences("+91 98765 43210");
  assert(defaultPrefs.whatsapp === true, "Default WhatsApp preference is enabled");
  assert(defaultPrefs.sms === true, "Default SMS preference is enabled");
  assert(defaultPrefs.email === true, "Default Email preference is enabled");
  assert(defaultPrefs.reminders === true, "Default Reminders preference is enabled");

  // Update preferences to opt-out of SMS
  await saveNotificationPreferences({
    userId: "+91 98765 43210",
    whatsapp: true,
    sms: false,
    email: true,
    reminders: true,
  });

  const updatedPrefs = await getNotificationPreferences("+91 98765 43210");
  assert(updatedPrefs.sms === false, "SMS successfully disabled in preferences");
  assert(isChannelEnabled(updatedPrefs, "sms") === false, "isChannelEnabled returns false for SMS");
  assert(isChannelEnabled(updatedPrefs, "whatsapp") === true, "isChannelEnabled returns true for WhatsApp");

  // ─── 3. Provider Formatting & Dispatches ───
  console.log("\n3. Provider Delivery Dispatch & Simulation");
  const smsRes = await sendSmsNotification({
    to: "+91 98765 43210",
    message: "CafeQ: Your table BK-NOTIF1 is confirmed!",
    bookingCode: "BK-NOTIF1",
  });
  assert(smsRes.success === true, "SMS provider dispatched message successfully");
  assert(Boolean(smsRes.messageId), "SMS provider returned message ID: " + smsRes.messageId);

  const emailRes = await sendEmailNotification({
    to: "priya@example.com",
    subject: "CafeQ Reservation Confirmed - BK-NOTIF1",
    html: "<p>Your booking is confirmed!</p>",
    text: "Your booking is confirmed!",
    bookingCode: "BK-NOTIF1",
    attachment: {
      filename: "CafeQ-Receipt-BK-NOTIF1.pdf",
      content: "data:application/pdf;base64,JVBERi0xLjQK...",
      contentType: "application/pdf",
    },
  });
  assert(emailRes.success === true, "Email provider dispatched email with attachment successfully");

  const waRes = await sendWhatsAppNotification({
    to: "+91 98765 43210",
    message: "☕ *CafeQ Reservation Confirmed*\nCode: BK-NOTIF1",
    bookingCode: "BK-NOTIF1",
  });
  assert(waRes.success === true, "WhatsApp provider dispatched message successfully");

  // ─── 4. Delivery Audit Logger ───
  console.log("\n4. Delivery Audit Logger");
  const logId = await logDelivery({
    channel: "whatsapp",
    event: "reservation_confirmed",
    recipient: "+91 98765 43210",
    subject: "CafeQ Reservation Confirmed",
    message: "Table confirmed",
    booking_code: "BK-NOTIF1",
    status: "sent",
    provider: "whatsapp_cloud",
  });

  assert(logId.length > 0, "Delivery log recorded with ID: " + logId);

  const logs = await getDeliveryLogs({ bookingCode: "BK-NOTIF1" });
  assert(logs.length > 0, "Retrieved delivery logs for booking BK-NOTIF1");
  const matched = logs.find((l) => l.id === logId);
  assert(matched?.status === "sent", "Logged status is 'sent'");
  assert(matched?.channel === "whatsapp", "Logged channel is 'whatsapp'");

  await updateDeliveryLogStatus(logId, "delivered");
  const updatedLogs = await getDeliveryLogs({ bookingCode: "BK-NOTIF1" });
  const updatedMatch = updatedLogs.find((l) => l.id === logId);
  assert(updatedMatch?.status === "delivered", "Log status updated to 'delivered'");

  // ─── 5. Retry Queue with Exponential Backoff ───
  console.log("\n5. Notification Retry Queue");
  await enqueueNotification({
    channel: "sms",
    recipient: "+91 98765 43210",
    payload: samplePayload,
    error: "Provider network timeout",
  });

  const queue = getRetryQueue();
  assert(queue.length > 0, "Failed notification added to retry queue");
  const queuedItem = queue[queue.length - 1];
  assert(queuedItem.retryCount === 1, "Initial retry count is 1");
  assert(queuedItem.nextAttemptAt > Date.now(), "Next attempt scheduled in future (exponential backoff)");

  // Fast-forward scheduled attempt for test simulation
  queuedItem.nextAttemptAt = Date.now() - 1000;
  await processRetryQueue();
  const queueAfter = getRetryQueue();
  assert(queueAfter.length === 0, "Retry queue processed and cleared successfully");

  // ─── 6. Orchestrated Multi-Channel Notification Pipeline ───
  console.log("\n6. Orchestrated Multi-Channel Dispatch Pipeline");
  const dispatchResults = await sendNotification(samplePayload);
  assert(dispatchResults.length >= 2, "Dispatched across multiple channels (Email + WhatsApp)");
  assert(dispatchResults.every((r) => r.success === true), "All active channel dispatches succeeded");

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
