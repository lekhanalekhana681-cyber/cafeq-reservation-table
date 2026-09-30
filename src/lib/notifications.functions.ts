/**
 * Notification helpers for WhatsApp & SMS on booking / event registration.
 *
 * All credentials come from environment variables — never hardcoded.
 *
 * Required env vars (add to .env.local — NEVER commit real values):
 *   VITE_WHATSAPP_API_KEY        — WhatsApp Business Cloud API token
 *   VITE_WHATSAPP_PHONE_NUMBER_ID — Phone Number ID from Meta dashboard
 *   VITE_TWILIO_SID              — Twilio Account SID
 *   VITE_TWILIO_AUTH_TOKEN       — Twilio Auth Token
 *   VITE_TWILIO_FROM_PHONE       — Twilio sender number (e.g. +1415XXXXXXX)
 *
 * NOTE: In a production app these calls should be made from a secure backend
 * (Supabase Edge Function, Next.js API route, etc.) to protect credentials.
 * For now they run client-side in dev when the env vars are present.
 */

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

interface WhatsAppTextPayload {
  to: string;   // E.164, e.g. +919876543210
  message: string;
}

export async function sendWhatsAppMessage({ to, message }: WhatsAppTextPayload): Promise<boolean> {
  const apiKey = import.meta.env.VITE_WHATSAPP_API_KEY;
  const phoneNumberId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;

  if (!apiKey || !phoneNumberId) {
    console.info("[notifications] WhatsApp env vars not set — skipping.");
    return false;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      }
    );
    if (!res.ok) {
      console.error("[notifications] WhatsApp error", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notifications] WhatsApp fetch failed", err);
    return false;
  }
}

// ─── SMS via Twilio ────────────────────────────────────────────────────────────

interface TwilioSmsPayload {
  to: string;   // E.164, e.g. +919876543210
  message: string;
}

export async function sendSms({ to, message }: TwilioSmsPayload): Promise<boolean> {
  const sid = import.meta.env.VITE_TWILIO_SID;
  const authToken = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
  const from = import.meta.env.VITE_TWILIO_FROM_PHONE;

  if (!sid || !authToken || !from) {
    console.info("[notifications] Twilio env vars not set — skipping.");
    return false;
  }

  try {
    const body = new URLSearchParams({ To: to, From: from, Body: message });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );
    if (!res.ok) {
      console.error("[notifications] Twilio SMS error", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notifications] Twilio SMS fetch failed", err);
    return false;
  }
}

// ─── Booking confirmation helper ──────────────────────────────────────────────

export interface BookingNotificationParams {
  name: string;
  phone: string;   // E.164 — caller should format with country code
  date: string;
  time: string;
  tableType: string;
  partySize: number;
  bookingCode: string;
  preOrdered: boolean;
  totalAmount?: number;
}

/**
 * Sends both a WhatsApp message and an SMS confirmation for a table booking.
 * Returns `{ whatsapp_sent, sms_sent }` flags — store in your bookings table.
 */
export async function sendBookingConfirmationNotifications(
  params: BookingNotificationParams
): Promise<{ whatsapp_sent: boolean; sms_sent: boolean }> {
  const {
    name,
    phone,
    date,
    time,
    tableType,
    partySize,
    bookingCode,
    preOrdered,
    totalAmount,
  } = params;

  const message =
    `Hi ${name}! 🎉 Your table at CAFEQ is confirmed.\n` +
    `📅 ${date} at ${time}\n` +
    `🪑 ${tableType} · ${partySize} guest${partySize > 1 ? "s" : ""}\n` +
    (preOrdered ? `🍴 Food pre-ordered & will be ready on arrival\n` : "") +
    (totalAmount ? `💰 Total: ₹${totalAmount}\n` : "") +
    `🔖 Booking ref: ${bookingCode}\n` +
    `📍 238/25, Rajmahal Vilas Extension, Malleshwaram, Bangalore\n` +
    `See you soon! — The CAFEQ Team`;

  const [whatsapp_sent, sms_sent] = await Promise.all([
    sendWhatsAppMessage({ to: phone, message }),
    sendSms({ to: phone, message }),
  ]);

  return { whatsapp_sent, sms_sent };
}

// ─── Event registration notification helper ───────────────────────────────────

export interface EventNotificationParams {
  name: string;
  phone: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  attendees: number;
  totalAmount: number;
  paymentStatus: string;
  registrationId: string;
}

export async function sendEventRegistrationNotifications(
  params: EventNotificationParams
): Promise<{ whatsapp_sent: boolean; sms_sent: boolean }> {
  const {
    name, phone, eventTitle, eventDate, eventTime,
    attendees, totalAmount, paymentStatus, registrationId,
  } = params;

  const payNote =
    paymentStatus === "pending_cash"
      ? `💵 Pay ₹${totalAmount} at the venue.`
      : paymentStatus === "paid"
      ? `✅ Payment confirmed.`
      : `💳 Please complete your UPI payment of ₹${totalAmount}.`;

  const message =
    `Hi ${name}! 🎉 You're registered for "${eventTitle}" at CAFEQ.\n` +
    `📅 ${eventDate} at ${eventTime}\n` +
    `👥 ${attendees} seat${attendees > 1 ? "s" : ""}\n` +
    `${payNote}\n` +
    `🔖 Reg ID: ${registrationId.slice(-8)}\n` +
    `📍 238/25, Rajmahal Vilas Extension, Malleshwaram, Bangalore\n` +
    `See you there! — The CAFEQ Team`;

  const [whatsapp_sent, sms_sent] = await Promise.all([
    sendWhatsAppMessage({ to: phone, message }),
    sendSms({ to: phone, message }),
  ]);

  return { whatsapp_sent, sms_sent };
}
