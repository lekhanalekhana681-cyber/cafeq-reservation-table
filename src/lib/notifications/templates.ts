/**
 * Centralized Message Templates for SMS, Email, and WhatsApp.
 * Supports all 6 lifecycle events with professional cafe branding.
 */

import type { NotificationEvent, NotificationChannel, NotificationContext, RenderedMessage } from "./types";

export function renderNotificationTemplate(
  event: NotificationEvent,
  channel: NotificationChannel,
  ctx: NotificationContext
): RenderedMessage {
  const firstName = ctx.customerName ? ctx.customerName.split(" ")[0] : "Guest";
  const bookingRef = ctx.bookingCode;
  const cafeAddress = "238/25, Rajmahal Vilas Extension, Malleshwaram, Bangalore";

  switch (event) {
    case "reservation_confirmed": {
      if (channel === "email") {
        return {
          subject: `Reservation Confirmed at CafeQ — Ref: ${bookingRef}`,
          text: `Hi ${firstName},\n\nYour reservation at CafeQ has been confirmed!\nDate: ${ctx.date} at ${ctx.time}\nTable: ${ctx.tableType} (${ctx.partySize} guests)\nBooking Code: ${bookingRef}\nLocation: ${cafeAddress}\n\nWe look forward to welcoming you!`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #18181b; padding: 24px;">
              <div style="background-color: #18181b; padding: 20px; border-radius: 12px 12px 0 0; color: #ffffff;">
                <h1 style="margin: 0; font-size: 24px; color: #f97316;">CafeQ</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #a1a1aa;">Artisanal Roastery & Kitchen · Malleshwaram</p>
              </div>
              <div style="border: 1px solid #e4e4e7; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
                <h2 style="font-size: 18px; margin-top: 0;">Reservation Confirmed 🎉</h2>
                <p>Hello <strong>${firstName}</strong>,</p>
                <p>Your table reservation has been locked in. Here are your booking details:</p>
                <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin: 16px 0; font-size: 14px;">
                  <p style="margin: 4px 0;">📅 <strong>Date:</strong> ${ctx.date} at ${ctx.time}</p>
                  <p style="margin: 4px 0;">🪑 <strong>Table:</strong> ${ctx.tableType} · ${ctx.partySize} Guest${(ctx.partySize || 1) > 1 ? "s" : ""}</p>
                  <p style="margin: 4px 0;">🔖 <strong>Booking Reference:</strong> <span style="font-family: monospace; font-size: 16px; color: #ea580c; font-weight: bold;">${bookingRef}</span></p>
                  ${ctx.itemsSummary ? `<p style="margin: 4px 0;">🍴 <strong>Pre-ordered items:</strong> ${ctx.itemsSummary}</p>` : ""}
                  ${ctx.totalAmount ? `<p style="margin: 4px 0;">💰 <strong>Total Amount:</strong> ₹${ctx.totalAmount}</p>` : ""}
                </div>
                <p style="font-size: 13px; color: #71717a;">📍 <strong>Address:</strong> ${cafeAddress}</p>
                <p style="font-size: 13px; color: #71717a;">See you soon! — The CafeQ Team</p>
              </div>
            </div>
          `,
        };
      }

      // WhatsApp / SMS
      const text =
        `Hi ${firstName}! 🎉 Your table at CAFEQ is confirmed.\n` +
        `📅 ${ctx.date} at ${ctx.time}\n` +
        `🪑 ${ctx.tableType} · ${ctx.partySize} guest${(ctx.partySize || 1) > 1 ? "s" : ""}\n` +
        (ctx.itemsSummary ? `🍴 Pre-ordered: ${ctx.itemsSummary}\n` : "") +
        (ctx.totalAmount ? `💰 Total: ₹${ctx.totalAmount}\n` : "") +
        `🔖 Ref: ${bookingRef}\n` +
        `📍 ${cafeAddress}\nSee you soon! — CAFEQ`;

      return { text };
    }

    case "reservation_reminder": {
      if (channel === "email") {
        return {
          subject: `Reminder: Your Table Reservation at CafeQ Today (${ctx.time})`,
          text: `Hi ${firstName},\n\nJust a friendly reminder that your table at CafeQ is reserved for today at ${ctx.time}.\nBooking Code: ${bookingRef}\nTable: ${ctx.tableType}\nAddress: ${cafeAddress}\n\nCan't make it? Please notify us by replying or managing your booking online.`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #18181b; padding: 24px;">
              <div style="background: #ea580c; padding: 18px; border-radius: 12px 12px 0 0; color: #ffffff;">
                <h2 style="margin: 0; font-size: 20px;">Reservation Reminder ⏰</h2>
              </div>
              <div style="border: 1px solid #e4e4e7; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
                <p>Hello <strong>${firstName}</strong>,</p>
                <p>We are getting everything ready for your visit today!</p>
                <div style="background: #fff7ed; border: 1px solid #ffedd5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                  <p style="margin: 4px 0;">🕒 <strong>Time:</strong> Today at <strong>${ctx.time}</strong></p>
                  <p style="margin: 4px 0;">🪑 <strong>Seating:</strong> ${ctx.tableType} · ${ctx.partySize} Guest${(ctx.partySize || 1) > 1 ? "s" : ""}</p>
                  <p style="margin: 4px 0;">🔖 <strong>Code:</strong> ${bookingRef}</p>
                </div>
                <p style="font-size: 13px; color: #71717a;">📍 <strong>Location:</strong> ${cafeAddress}</p>
              </div>
            </div>
          `,
        };
      }

      const text =
        `Hello ${firstName}! ⏰ Friendly reminder from CAFEQ:\n` +
        `Your table is scheduled today at ${ctx.time} (${ctx.tableType}).\n` +
        `🔖 Booking Ref: ${bookingRef}\n` +
        `📍 ${cafeAddress}\nWe're eager to serve you!`;

      return { text };
    }

    case "order_accepted": {
      if (channel === "email") {
        return {
          subject: `Kitchen is Preparing Your Order — Ref: ${bookingRef}`,
          text: `Hi ${firstName},\n\nGreat news! The CafeQ kitchen has accepted your order and our chefs have started preparing your dishes.\nRef: ${bookingRef}\nEstimated ready time: ${ctx.foodReadyTime || "10-15 mins"}\n\nSit back and relax!`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <div style="background: #27272a; padding: 18px; border-radius: 12px 12px 0 0; color: #ffffff;">
                <h2 style="margin: 0; font-size: 20px; color: #38bdf8;">Order in the Kitchen 👨‍🍳</h2>
              </div>
              <div style="border: 1px solid #e4e4e7; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
                <p>Hello <strong>${firstName}</strong>,</p>
                <p>Our baristas & chefs have fired up your ticket! Dishes are currently being prepared with fresh ingredients.</p>
                <div style="background: #f0f9ff; border: 1px solid #e0f2fe; padding: 16px; border-radius: 8px; margin: 16px 0;">
                  <p style="margin: 4px 0;">🍳 <strong>Status:</strong> Preparing in Kitchen</p>
                  <p style="margin: 4px 0;">🔖 <strong>Ref:</strong> ${bookingRef}</p>
                  ${ctx.foodReadyTime ? `<p style="margin: 4px 0;">⏱️ <strong>Est. Serving Time:</strong> ${ctx.foodReadyTime}</p>` : ""}
                </div>
              </div>
            </div>
          `,
        };
      }

      const text =
        `Hi ${firstName}! 👨‍🍳 The CAFEQ kitchen has accepted your order (${bookingRef}).\n` +
        `Our team is preparing your dishes fresh now.\n` +
        (ctx.foodReadyTime ? `⏱️ Est. ready: ${ctx.foodReadyTime}\n` : "") +
        `Sit back and relax! — CAFEQ`;

      return { text };
    }

    case "order_ready": {
      if (channel === "email") {
        return {
          subject: `Your Dishes are Ready at CafeQ! — Ref: ${bookingRef}`,
          text: `Hi ${firstName},\n\nDing! 🛎️ Your food at CafeQ is hot, fresh, and ready to be enjoyed!\nRef: ${bookingRef}\nTable: ${ctx.tableType}\n\nEnjoy your meal!`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <div style="background: #10b981; padding: 18px; border-radius: 12px 12px 0 0; color: #ffffff;">
                <h2 style="margin: 0; font-size: 20px;">Food is Ready! 🛎️</h2>
              </div>
              <div style="border: 1px solid #e4e4e7; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
                <p>Hello <strong>${firstName}</strong>,</p>
                <p>Your order at CafeQ has just finished preparation and is ready to be served.</p>
                <div style="background: #ecfdf5; border: 1px solid #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                  <p style="margin: 4px 0;">🍽️ <strong>Order:</strong> ${bookingRef}</p>
                  <p style="margin: 4px 0;">🪑 <strong>Delivered to:</strong> ${ctx.tableType}</p>
                </div>
                <p>Enjoy your meal! — The CafeQ Kitchen Team</p>
              </div>
            </div>
          `,
        };
      }

      const text =
        `Hello ${firstName}! 🛎️ Your food at CAFEQ is freshly prepared & ready!\n` +
        `🍽️ Order ref: ${bookingRef}\n` +
        `🪑 Table: ${ctx.tableType}\n` +
        `Enjoy your meal! — The CAFEQ Kitchen Team`;

      return { text };
    }

    case "payment_success": {
      if (channel === "email") {
        return {
          subject: `Payment Successful & Digital Receipt — CafeQ (${bookingRef})`,
          text: `Hi ${firstName},\n\nThank you for your payment of ₹${ctx.totalAmount} for Booking ${bookingRef}.\nReceipt No: ${ctx.receiptNumber || "N/A"}\nPayment ID: ${ctx.paymentId || "N/A"}\n\nYour digital PDF receipt is attached to this email.`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <div style="background: #18181b; padding: 20px; border-radius: 12px 12px 0 0; color: #ffffff;">
                <h1 style="margin: 0; font-size: 22px; color: #f97316;">CafeQ</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #a1a1aa;">Payment Confirmation & Tax Receipt</p>
              </div>
              <div style="border: 1px solid #e4e4e7; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
                <h2 style="font-size: 18px; margin-top: 0; color: #059669;">Payment Successful ✅</h2>
                <p>Hello <strong>${firstName}</strong>,</p>
                <p>Thank you! Your online payment via Razorpay has been verified and settled.</p>
                <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin: 16px 0; font-size: 14px;">
                  <p style="margin: 4px 0;">💰 <strong>Amount Paid:</strong> ₹${ctx.totalAmount}</p>
                  <p style="margin: 4px 0;">🔖 <strong>Booking Reference:</strong> ${bookingRef}</p>
                  <p style="margin: 4px 0;">🧾 <strong>Receipt No:</strong> ${ctx.receiptNumber || "CQ-RCP-" + bookingRef}</p>
                  <p style="margin: 4px 0;">💳 <strong>Payment ID:</strong> ${ctx.paymentId || "Prepaid Verified"}</p>
                </div>
                <p style="font-size: 13px; color: #0284c7; background: #f0f9ff; padding: 10px; border-radius: 6px;">
                  📄 <strong>Your digital PDF tax receipt is attached to this email.</strong> You can also download it anytime from the guest portal.
                </p>
                <p style="font-size: 13px; color: #71717a; margin-top: 20px;">Thank you for dining with CafeQ!</p>
              </div>
            </div>
          `,
        };
      }

      const text =
        `Hi ${firstName}! ✅ Payment of ₹${ctx.totalAmount} for CAFEQ booking ${bookingRef} received successfully.\n` +
        `🧾 Receipt: ${ctx.receiptNumber || "Logged"}\n` +
        `💳 Txn ID: ${ctx.paymentId || "Online"}\n` +
        (ctx.customerEmail ? `A digital PDF receipt has been sent to ${ctx.customerEmail}.\n` : "") +
        `Thank you! — CAFEQ`;

      return { text };
    }

    case "cancellation": {
      if (channel === "email") {
        return {
          subject: `Reservation Cancelled — CafeQ Ref: ${bookingRef}`,
          text: `Hi ${firstName},\n\nYour reservation ${bookingRef} at CafeQ has been cancelled.\nReason: ${ctx.cancellationReason || "Customer request"}\n\nWe hope to welcome you another time!`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <div style="background: #ef4444; padding: 18px; border-radius: 12px 12px 0 0; color: #ffffff;">
                <h2 style="margin: 0; font-size: 20px;">Reservation Cancelled</h2>
              </div>
              <div style="border: 1px solid #e4e4e7; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
                <p>Hello <strong>${firstName}</strong>,</p>
                <p>Your booking <strong>${bookingRef}</strong> for ${ctx.date} at ${ctx.time} has been cancelled.</p>
                ${ctx.cancellationReason ? `<p style="color: #71717a; font-size: 13px;">Reason: <em>${ctx.cancellationReason}</em></p>` : ""}
                <p style="font-size: 13px; color: #71717a;">We hope to see you another time! You can rebook anytime via our website.</p>
              </div>
            </div>
          `,
        };
      }

      const text =
        `Hello ${firstName}. Your CAFEQ reservation ${bookingRef} has been cancelled.\n` +
        (ctx.cancellationReason ? `Note: ${ctx.cancellationReason}\n` : "") +
        `We hope to welcome you another time. Rebook anytime at cafeq.com`;

      return { text };
    }
  }
}
