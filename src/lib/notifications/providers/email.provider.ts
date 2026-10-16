/**
 * Provider-Agnostic Email Provider (SMTP & API Gateway)
 * Supports rich HTML styling and PDF attachments (such as digital receipts).
 */

import type { NotificationAttachment, ProviderSendResult } from "../types";

export interface EmailSendPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: NotificationAttachment[];
}

function getEmailConfig() {
  return {
    host:
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_SMTP_HOST) ||
      process.env?.VITE_SMTP_HOST ||
      process.env?.SMTP_HOST,
    port:
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_SMTP_PORT) ||
      process.env?.VITE_SMTP_PORT ||
      process.env?.SMTP_PORT ||
      "587",
    user:
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_SMTP_USER) ||
      process.env?.VITE_SMTP_USER ||
      process.env?.SMTP_USER,
    pass:
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_SMTP_PASS) ||
      process.env?.VITE_SMTP_PASS ||
      process.env?.SMTP_PASS,
    fromEmail:
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_SMTP_FROM_EMAIL) ||
      process.env?.VITE_SMTP_FROM_EMAIL ||
      process.env?.SMTP_FROM_EMAIL ||
      "reservations@cafeq.com",
    apiEndpoint:
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_EMAIL_API_ENDPOINT) ||
      process.env?.VITE_EMAIL_API_ENDPOINT ||
      process.env?.EMAIL_API_ENDPOINT,
  };
}

export async function sendEmailNotification(payload: EmailSendPayload): Promise<ProviderSendResult> {
  const config = getEmailConfig();

  // If a custom HTTP API endpoint is set (e.g. Supabase Edge Function or microservice):
  if (config.apiEndpoint) {
    try {
      const res = await fetch(config.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: config.fromEmail,
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          attachments: payload.attachments,
        }),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Email API error: ${await res.text()}`,
          provider: "smtp_api",
        };
      }

      return {
        success: true,
        messageId: `email_api_${Date.now()}`,
        provider: "smtp_api",
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Email API failed",
        provider: "smtp_api",
      };
    }
  }

  // If running in Node.js environment with nodemailer available:
  if (typeof window === "undefined" && config.host && config.user && config.pass) {
    try {
      // Dynamic import to prevent client bundling issues
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: parseInt(config.port, 10),
        secure: config.port === "465",
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

      const mailAttachments = payload.attachments?.map((att) => ({
        filename: att.filename,
        content: att.dataUri ? att.dataUri.split(",")[1] : undefined,
        encoding: att.dataUri ? "base64" : undefined,
        path: att.url,
        contentType: att.contentType,
      }));

      const info = await transporter.sendMail({
        from: `"CafeQ" <${config.fromEmail}>`,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html || payload.text,
        attachments: mailAttachments,
      });

      return {
        success: true,
        messageId: info.messageId,
        provider: "smtp",
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "SMTP sending failed",
        provider: "smtp",
      };
    }
  }

  // Dev & Browser Sandbox fallback:
  return {
    success: true,
    messageId: `smtp_sandbox_${Date.now()}`,
    provider: "smtp_sandbox",
  };
}
