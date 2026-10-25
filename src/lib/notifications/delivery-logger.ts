/**
 * Notification Delivery Logger & Audit Trail
 * Logs delivery attempts across SMS, Email, and WhatsApp to Supabase and LocalStorage.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { DeliveryLogRecord, NotificationEvent, NotificationChannel, DeliveryStatus } from "./types";

const STORAGE_LOGS_KEY = "cafeq_notification_logs";

function getPublicClient() {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function logNotificationDelivery({
  eventType,
  channel,
  recipient,
  status,
  provider,
  messagePreview,
  errorMessage,
  attempts = 1,
  bookingCode,
}: {
  eventType: NotificationEvent;
  channel: NotificationChannel;
  recipient: string;
  status: DeliveryStatus;
  provider: string;
  messagePreview?: string;
  errorMessage?: string;
  attempts?: number;
  bookingCode?: string;
}): Promise<DeliveryLogRecord> {
  const logRecord: DeliveryLogRecord = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    eventType,
    channel,
    recipient,
    status,
    provider,
    messagePreview: messagePreview?.slice(0, 300),
    errorMessage: errorMessage?.slice(0, 300),
    attempts,
    bookingCode,
    createdAt: new Date().toISOString(),
  };

  const supabase = getPublicClient();
  if (supabase) {
    try {
      await supabase.from("notification_logs").insert({
        event_type: eventType,
        channel,
        recipient,
        status,
        provider,
        message_preview: logRecord.messagePreview || null,
        error_message: logRecord.errorMessage || null,
        attempts,
        booking_code: bookingCode || null,
      });
    } catch (err) {
      console.warn("Could not insert notification log into Supabase:", err);
    }
  }

  // Local storage fallback
  try {
    if (typeof localStorage !== "undefined") {
      const existing: DeliveryLogRecord[] = JSON.parse(localStorage.getItem(STORAGE_LOGS_KEY) || "[]");
      existing.unshift(logRecord);
      // Keep max 200 logs
      if (existing.length > 200) existing.pop();
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(existing));
    }
  } catch (err) {
    console.error("Failed to save delivery log to local storage:", err);
  }

  return logRecord;
}

export async function getDeliveryLogs(filter?: {
  bookingCode?: string;
  recipient?: string;
  limit?: number;
}): Promise<DeliveryLogRecord[]> {
  const limit = filter?.limit || 50;
  const supabase = getPublicClient();

  if (supabase) {
    try {
      let query = supabase.from("notification_logs").select("*").order("created_at", { ascending: false }).limit(limit);
      if (filter?.bookingCode) query = query.eq("booking_code", filter.bookingCode);
      if (filter?.recipient) query = query.eq("recipient", filter.recipient);

      const { data, error } = await query;
      if (!error && data) {
        return data.map((d) => ({
          id: d.id,
          eventType: d.event_type as NotificationEvent,
          channel: d.channel as NotificationChannel,
          recipient: d.recipient,
          status: d.status as DeliveryStatus,
          provider: d.provider,
          messagePreview: d.message_preview || undefined,
          errorMessage: d.error_message || undefined,
          attempts: d.attempts || 1,
          bookingCode: d.booking_code || undefined,
          createdAt: d.created_at,
        }));
      }
    } catch (err) {
      console.warn("Failed to fetch notification logs from Supabase:", err);
    }
  }

  try {
    const existing: DeliveryLogRecord[] = JSON.parse(localStorage.getItem(STORAGE_LOGS_KEY) || "[]");
    return existing
      .filter((l) => {
        if (filter?.bookingCode && l.bookingCode !== filter.bookingCode) return false;
        if (filter?.recipient && !l.recipient.includes(filter.recipient)) return false;
        return true;
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}
