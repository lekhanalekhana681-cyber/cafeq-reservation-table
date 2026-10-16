/**
 * Provider-Agnostic SMS Provider (MSG91 & Twilio)
 * Switches automatically based on SMS_PROVIDER env variable or configured credentials.
 */

import type { ProviderSendResult } from "../types";

export interface SmsSendPayload {
  to: string; // E.164, e.g. +919876543210
  message: string;
  templateId?: string;
}

// ─── Environment Configuration ────────────────────────────────────────────────

function getSmsConfig() {
  const provider =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SMS_PROVIDER) ||
    process.env?.VITE_SMS_PROVIDER ||
    process.env?.SMS_PROVIDER ||
    "msg91";

  // MSG91
  const msg91AuthKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_MSG91_AUTH_KEY) ||
    process.env?.VITE_MSG91_AUTH_KEY ||
    process.env?.MSG91_AUTH_KEY;
  const msg91SenderId =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_MSG91_SENDER_ID) ||
    process.env?.VITE_MSG91_SENDER_ID ||
    process.env?.MSG91_SENDER_ID ||
    "CAFEQB";
  const msg91TemplateId =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_MSG91_TEMPLATE_ID) ||
    process.env?.VITE_MSG91_TEMPLATE_ID ||
    process.env?.MSG91_TEMPLATE_ID;

  // Twilio
  const twilioSid =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_TWILIO_SID) ||
    process.env?.VITE_TWILIO_SID ||
    process.env?.TWILIO_SID;
  const twilioAuthToken =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_TWILIO_AUTH_TOKEN) ||
    process.env?.VITE_TWILIO_AUTH_TOKEN ||
    process.env?.TWILIO_AUTH_TOKEN;
  const twilioFrom =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_TWILIO_FROM_PHONE) ||
    process.env?.VITE_TWILIO_FROM_PHONE ||
    process.env?.TWILIO_FROM_PHONE;

  return {
    preferredProvider: provider.toLowerCase(),
    msg91: { authKey: msg91AuthKey, senderId: msg91SenderId, templateId: msg91TemplateId },
    twilio: { sid: twilioSid, authToken: twilioAuthToken, fromPhone: twilioFrom },
  };
}

// ─── MSG91 Implementation ─────────────────────────────────────────────────────

async function sendViaMsg91(payload: SmsSendPayload, config: ReturnType<typeof getSmsConfig>["msg91"]): Promise<ProviderSendResult> {
  if (!config.authKey) {
    // Sandbox / Test fallback
    return {
      success: true,
      messageId: `msg91_mock_${Date.now()}`,
      provider: "msg91_sandbox",
    };
  }

  try {
    const cleanNumber = payload.to.replace(/\D/g, "");
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        authkey: config.authKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        template_id: payload.templateId || config.templateId || "default_flow",
        sender: config.senderId,
        short_url: "0",
        recipients: [
          {
            mobiles: cleanNumber,
            message: payload.message,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `MSG91 Error: ${errText}`, provider: "msg91" };
    }

    const data = await res.json();
    return { success: true, messageId: data?.request_id || `msg91_${Date.now()}`, provider: "msg91" };
  } catch (err: any) {
    return { success: false, error: err?.message || "MSG91 dispatch failed", provider: "msg91" };
  }
}

// ─── Twilio Implementation ────────────────────────────────────────────────────

async function sendViaTwilio(payload: SmsSendPayload, config: ReturnType<typeof getSmsConfig>["twilio"]): Promise<ProviderSendResult> {
  if (!config.sid || !config.authToken || !config.fromPhone) {
    // Sandbox / Test fallback
    return {
      success: true,
      messageId: `twilio_mock_${Date.now()}`,
      provider: "twilio_sandbox",
    };
  }

  try {
    const body = new URLSearchParams({
      To: payload.to,
      From: config.fromPhone,
      Body: payload.message,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${config.sid}:${config.authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Twilio Error: ${errText}`, provider: "twilio" };
    }

    const data = await res.json();
    return { success: true, messageId: data?.sid || `twilio_${Date.now()}`, provider: "twilio" };
  } catch (err: any) {
    return { success: false, error: err?.message || "Twilio dispatch failed", provider: "twilio" };
  }
}

// ─── Unified SMS Dispatcher ───────────────────────────────────────────────────

export async function sendSmsNotification(payload: SmsSendPayload): Promise<ProviderSendResult> {
  // In browser: route through Vercel serverless function (/api/send-sms) to avoid CORS
  // and keep Twilio credentials safe server-side.
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: payload.to, message: payload.message }),
      });
      const data = await res.json();
      return {
        success: data.success ?? res.ok,
        messageId: data.messageId,
        provider: data.provider || "twilio_via_api",
        error: data.error,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "SMS API call failed", provider: "twilio_via_api" };
    }
  }

  // Server-side (Node.js) — call Twilio or MSG91 directly
  const config = getSmsConfig();

  if (config.preferredProvider === "twilio") {
    const twilioRes = await sendViaTwilio(payload, config.twilio);
    if (twilioRes.success) return twilioRes;
    if (config.msg91.authKey) return sendViaMsg91(payload, config.msg91);
    return twilioRes;
  }

  const msg91Res = await sendViaMsg91(payload, config.msg91);
  if (msg91Res.success) return msg91Res;
  if (config.twilio.sid && config.twilio.authToken) {
    return sendViaTwilio(payload, config.twilio);
  }
  return msg91Res;
}

