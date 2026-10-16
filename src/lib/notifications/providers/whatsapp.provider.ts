/**
 * WhatsApp Business Cloud API Provider
 * Sends messages directly via Meta Graph API v18.0+
 */

import type { ProviderSendResult } from "../types";

export interface WhatsAppSendPayload {
  to: string; // E.164 phone number, e.g. +919876543210
  message: string;
}

function getWhatsAppConfig() {
  const apiKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_WHATSAPP_API_KEY) ||
    process.env?.VITE_WHATSAPP_API_KEY ||
    process.env?.WHATSAPP_API_KEY;
  const phoneNumberId =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_WHATSAPP_PHONE_NUMBER_ID) ||
    process.env?.VITE_WHATSAPP_PHONE_NUMBER_ID ||
    process.env?.WHATSAPP_PHONE_NUMBER_ID;

  return { apiKey, phoneNumberId };
}

export async function sendWhatsAppNotification(payload: WhatsAppSendPayload): Promise<ProviderSendResult> {
  const { apiKey, phoneNumberId } = getWhatsAppConfig();

  if (!apiKey || !phoneNumberId) {
    // Sandbox / Test fallback
    return {
      success: true,
      messageId: `wa_mock_${Date.now()}`,
      provider: "whatsapp_cloud_sandbox",
    };
  }

  try {
    const cleanTo = payload.to.replace(/\D/g, "");
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "text",
        text: { body: payload.message },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `WhatsApp API error: ${errText}`,
        provider: "whatsapp_cloud",
      };
    }

    const data = await res.json();
    return {
      success: true,
      messageId: data?.messages?.[0]?.id || `wa_${Date.now()}`,
      provider: "whatsapp_cloud",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "WhatsApp dispatch failed",
      provider: "whatsapp_cloud",
    };
  }
}
