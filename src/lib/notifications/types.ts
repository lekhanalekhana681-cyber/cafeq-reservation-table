/**
 * Core Types for CafeQ Notification Engine
 */

export type NotificationEvent =
  | "reservation_confirmed"
  | "reservation_reminder"
  | "order_accepted"
  | "order_ready"
  | "payment_success"
  | "cancellation";

export type NotificationChannel = "sms" | "email" | "whatsapp";

export type DeliveryStatus = "pending" | "sent" | "failed";

export interface NotificationAttachment {
  filename: string;
  contentType: string;
  dataUri?: string; // Base64 data URI
  url?: string;
}

export interface NotificationContext {
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  date?: string;
  time?: string;
  tableType?: string;
  partySize?: number;
  itemsSummary?: string;
  totalAmount?: number;
  receiptNumber?: string;
  paymentId?: string;
  cancellationReason?: string;
  foodReadyTime?: string;
  attachments?: NotificationAttachment[];
}

export interface RenderedMessage {
  subject?: string;
  text: string;
  html?: string;
}

export interface ProviderSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
}

export interface NotificationPreferences {
  userId?: string;
  phone?: string;
  email?: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  remindersEnabled: boolean;
}

export interface DeliveryLogRecord {
  id: string;
  eventType: NotificationEvent;
  channel: NotificationChannel;
  recipient: string;
  status: DeliveryStatus;
  provider: string;
  messagePreview?: string;
  errorMessage?: string;
  attempts: number;
  bookingCode?: string;
  createdAt: string;
}
