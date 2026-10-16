/**
 * Unified Notification Service
 * Orchestrates multi-channel dispatches (SMS, Email, WhatsApp) with opt-in checks,
 * template rendering, retry queueing, and delivery logging.
 */

import type { NotificationEvent, NotificationContext, NotificationChannel, ProviderSendResult } from "./types";
import { renderNotificationTemplate } from "./templates";
import { getUserNotificationPreferences } from "./preferences";
import { notificationQueue } from "./queue";
import { sendSmsNotification } from "./providers/sms.provider";
import { sendEmailNotification } from "./providers/email.provider";
import { sendWhatsAppNotification } from "./providers/whatsapp.provider";

export * from "./types";
export * from "./templates";
export * from "./preferences";
export * from "./delivery-logger";
export * from "./queue";

export interface DispatchNotificationResult {
  event: NotificationEvent;
  channels: {
    sms?: ProviderSendResult;
    email?: ProviderSendResult;
    whatsapp?: ProviderSendResult;
  };
}

export async function dispatchNotification(
  event: NotificationEvent,
  ctx: NotificationContext
): Promise<DispatchNotificationResult> {
  const prefs = await getUserNotificationPreferences({
    phone: ctx.customerPhone,
    email: ctx.customerEmail,
  });

  const results: DispatchNotificationResult["channels"] = {};
  const tasks: Promise<void>[] = [];

  // 1. WhatsApp Dispatch (if enabled and phone provided)
  if (prefs.whatsappEnabled && ctx.customerPhone) {
    const rendered = renderNotificationTemplate(event, "whatsapp", ctx);
    tasks.push(
      notificationQueue
        .enqueue(event, "whatsapp", ctx.customerPhone, ctx, () =>
          sendWhatsAppNotification({
            to: ctx.customerPhone,
            message: rendered.text,
          })
        )
        .then((res) => {
          results.whatsapp = res;
        })
    );
  }

  // 2. SMS Dispatch (if enabled and phone provided)
  if (prefs.smsEnabled && ctx.customerPhone) {
    const rendered = renderNotificationTemplate(event, "sms", ctx);
    tasks.push(
      notificationQueue
        .enqueue(event, "sms", ctx.customerPhone, ctx, () =>
          sendSmsNotification({
            to: ctx.customerPhone,
            message: rendered.text,
          })
        )
        .then((res) => {
          results.sms = res;
        })
    );
  }

  // 3. Email Dispatch (if enabled and email provided)
  if (prefs.emailEnabled && ctx.customerEmail) {
    const rendered = renderNotificationTemplate(event, "email", ctx);
    tasks.push(
      notificationQueue
        .enqueue(event, "email", ctx.customerEmail, ctx, () =>
          sendEmailNotification({
            to: ctx.customerEmail!,
            subject: rendered.subject || `Notification from CafeQ — ${ctx.bookingCode}`,
            text: rendered.text,
            html: rendered.html,
            attachments: ctx.attachments,
          })
        )
        .then((res) => {
          results.email = res;
        })
    );
  }

  await Promise.all(tasks);

  return {
    event,
    channels: results,
  };
}

// ─── Backward Compatible Helpers ──────────────────────────────────────────────

export async function sendBookingConfirmationNotifications(params: {
  name: string;
  phone: string;
  date: string;
  time: string;
  tableType: string;
  partySize: number;
  bookingCode: string;
  preOrdered?: boolean;
  totalAmount?: number;
  customerEmail?: string;
  itemsSummary?: string;
}): Promise<{ whatsapp_sent: boolean; sms_sent: boolean }> {
  const result = await dispatchNotification("reservation_confirmed", {
    bookingCode: params.bookingCode,
    customerName: params.name,
    customerPhone: params.phone,
    customerEmail: params.customerEmail,
    date: params.date,
    time: params.time,
    tableType: params.tableType,
    partySize: params.partySize,
    totalAmount: params.totalAmount,
    itemsSummary: params.itemsSummary || (params.preOrdered ? "Pre-ordered items" : undefined),
  });

  return {
    whatsapp_sent: Boolean(result.channels.whatsapp?.success),
    sms_sent: Boolean(result.channels.sms?.success),
  };
}

export async function sendWhatsAppMessage({ to, message }: { to: string; message: string }): Promise<boolean> {
  const res = await sendWhatsAppNotification({ to, message });
  return res.success;
}

export async function sendSms({ to, message }: { to: string; message: string }): Promise<boolean> {
  const res = await sendSmsNotification({ to, message });
  return res.success;
}
