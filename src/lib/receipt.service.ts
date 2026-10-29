/**
 * Digital Receipt Service (PDF Generation & Storage)
 * Generates itemized, tax-compliant PDF receipts that can be downloaded, emailed, and stored.
 */

import { jsPDF } from "jspdf";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BookingInput, OrderItem } from "@/lib/bookings.functions";
import { getOrderTypeDetails } from "@/lib/order-types";

// ─── Bill Tax Configuration ───────────────────────────────────────────────────

/** GST on restaurant bills. Change rates here; the bill and its labels follow. */
export const BILL_TAX_RATES = {
  cgst: 0.025,
  sgst: 0.025,
} as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (rate: number) => `${round2(rate * 100)}%`;

export type BillTotals = { subtotal: number; cgst: number; sgst: number; taxAmount: number; grandTotal: number };

/** Subtotal = Σ price × qty; CGST/SGST on the subtotal; Grand Total = Subtotal + CGST + SGST (2 decimals). */
export function computeBillTotals(items: Array<Pick<OrderItem, "price" | "qty">>): BillTotals {
  const subtotal = round2(items.reduce((sum, i) => sum + i.price * i.qty, 0));
  const cgst = round2(subtotal * BILL_TAX_RATES.cgst);
  const sgst = round2(subtotal * BILL_TAX_RATES.sgst);
  return { subtotal, cgst, sgst, taxAmount: round2(cgst + sgst), grandTotal: round2(subtotal + cgst + sgst) };
}

/** Bills are stored as receipts with this number prefix (payment receipts use CQ-RCP-). */
export const BILL_NUMBER_PREFIX = "CQ-BILL-";

/** A bill can only be produced for an order that was confirmed and has been completed. */
export function isBillable(b: Pick<BookingInput, "status">): boolean {
  return b.status === "completed";
}

export class BillNotAllowedError extends Error {
  constructor(code: string, status: string) {
    super(`A bill can only be generated for a completed order. Order ${code} is "${status.replace(/_/g, " ")}".`);
    this.name = "BillNotAllowedError";
  }
}

/**
 * Builds the bill for a completed order. Every admin bill goes through here,
 * so non-completed orders are rejected even if the button is bypassed.
 */
export function generateBill(b: BookingInput): ReceiptData {
  if (!isBillable(b)) throw new BillNotAllowedError(b.code, b.status);

  // Cancelled items are not billed
  const items = (b.items || []).filter((i) => i.status !== "CANCELLED");
  const totals = computeBillTotals(items);
  const type = getOrderTypeDetails(b.orderType);
  const where =
    type.type === "DINE_IN"
      ? `Dine-in · Table ${b.tableNumber || b.seating || "-"}`
      : type.type === "TAKEAWAY"
      ? `Takeaway${b.pickupTime ? ` · ${b.pickupTime}` : ""}`
      : "Delivery";

  return {
    receiptNumber: `${BILL_NUMBER_PREFIX}${generateReceiptNumber(b.code).slice("CQ-RCP-".length)}`,
    bookingCode: b.code,
    orderId: b.code,
    paymentId: b.paymentReference || undefined,
    paymentMethod:
      b.paymentMethod === "online_razorpay" ? "Razorpay Online" : b.paymentMethod === "upi_prepay" ? "UPI QR Code" : "Cash at Counter",
    paymentStatus: b.paymentStatus === "paid" ? "paid" : "pending",
    date: b.date,
    time: b.time,
    customerName: b.customerName || b.name,
    customerPhone: b.customerPhone || b.phone,
    customerEmail: b.customerEmail || undefined,
    tableType: where,
    partySize: b.party,
    items,
    subtotal: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    taxAmount: totals.taxAmount,
    depositAmount: 0,
    total: totals.grandTotal,
    totalLabel: "GRAND TOTAL",
    createdAt: new Date().toISOString(),
  };
}

export interface ReceiptData {
  receiptNumber: string;
  bookingCode: string;
  orderId?: string;
  paymentId?: string;
  paymentMethod: string;
  paymentStatus: "paid" | "pending" | "refunded";
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  tableType: string;
  partySize: number;
  items: OrderItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  taxAmount: number;
  depositAmount: number;
  total: number;
  /** Label for the final line; defaults to "TOTAL PAID" (payment receipts). */
  totalLabel?: string;
  createdAt: string;
}

export interface StoredReceipt extends ReceiptData {
  id: string;
  pdfDataUri?: string;
  emailedAt?: string | null;
}

const STORAGE_RECEIPTS_KEY = "cafeq_receipts";

function getPublicClient() {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Receipt Number Generator ─────────────────────────────────────────────────

export function generateReceiptNumber(bookingCode: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CQ-RCP-${dateStr}-${bookingCode.toUpperCase()}-${suffix}`;
}

// ─── PDF Document Generator ───────────────────────────────────────────────────

export function generateReceiptPdf(data: ReceiptData): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // Header background banner
  doc.setFillColor(24, 24, 27); // Dark zinc
  doc.rect(0, 0, pageWidth, 42, "F");

  // Cafe Branding
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("CafeQ", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(212, 212, 216);
  doc.text("Artisanal Roastery & Kitchen", margin, 24);
  doc.text("238/25, Rajmahal Vilas Extension, Malleshwaram, Bangalore - 560080", margin, 29);
  doc.text("GSTIN: 29ABCDE1234F1Z5 · FSSAI Lic: 11223344000123 · Contact: +91 90000 00001", margin, 34);

  // Receipt Title & Badge
  y = 54;
  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("TAX INVOICE & DIGITAL RECEIPT", margin, y);

  // Paid Status Pill
  doc.setFillColor(16, 185, 129); // Emerald 500
  doc.roundedRect(pageWidth - margin - 35, y - 6, 35, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("PAYMENT VERIFIED", pageWidth - margin - 33, y - 1);

  // Metadata Grid
  y += 10;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 7;
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text("Receipt No:", margin, y);
  doc.text("Booking Ref:", margin + 80, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 24, 27);
  doc.text(data.receiptNumber, margin + 25, y);
  doc.text(data.bookingCode, margin + 105, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(113, 113, 122);
  doc.text("Date & Time:", margin, y);
  doc.text("Transaction ID:", margin + 80, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 24, 27);
  doc.text(`${data.date} at ${data.time}`, margin + 25, y);
  doc.text(data.paymentId || "N/A (Prepaid)", margin + 105, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(113, 113, 122);
  doc.text("Billed To:", margin, y);
  doc.text("Table & Party:", margin + 80, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 24, 27);
  doc.text(`${data.customerName} (${data.customerPhone})`, margin + 25, y);
  doc.text(`${data.tableType} · ${data.partySize} Guest${data.partySize > 1 ? "s" : ""}`, margin + 105, y);

  y += 10;
  doc.line(margin, y, pageWidth - margin, y);

  // Items Table Header
  y += 7;
  doc.setFillColor(244, 244, 245);
  doc.rect(margin, y - 5, pageWidth - margin * 2, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(63, 63, 70);
  doc.text("ITEM DESCRIPTION", margin + 3, y);
  doc.text("QTY", margin + 100, y);
  doc.text("UNIT RATE (INR)", margin + 120, y);
  doc.text("AMOUNT (INR)", pageWidth - margin - 3, y, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(24, 24, 27);

  // Item Rows
  if (data.items && data.items.length > 0) {
    data.items.forEach((item) => {
      const lineTotal = item.qty * item.price;
      const vegTag = item.isVeg ? "[Veg] " : "";
      doc.text(`${vegTag}${item.name}`, margin + 3, y);
      doc.text(String(item.qty), margin + 103, y);
      doc.text(`INR ${item.price.toFixed(2)}`, margin + 125, y);
      doc.text(`INR ${lineTotal.toFixed(2)}`, pageWidth - margin - 3, y, { align: "right" });
      y += 6;
    });
  } else {
    doc.text("Table Reservation Slot Booking", margin + 3, y);
    doc.text("1", margin + 103, y);
    doc.text(`INR ${data.total.toFixed(2)}`, margin + 125, y);
    doc.text(`INR ${data.total.toFixed(2)}`, pageWidth - margin - 3, y, { align: "right" });
    y += 6;
  }

  // Summary Lines
  y += 4;
  doc.setDrawColor(228, 228, 231);
  doc.line(margin, y, pageWidth - margin, y);

  y += 6;
  const colLabel = pageWidth - margin - 65;
  const colVal = pageWidth - margin - 3;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(113, 113, 122);
  doc.text("Subtotal:", colLabel, y);
  doc.text(`INR ${data.subtotal.toFixed(2)}`, colVal, y, { align: "right" });

  y += 5;
  doc.text(`CGST (${pct(BILL_TAX_RATES.cgst)}):`, colLabel, y);
  doc.text(`INR ${data.cgst.toFixed(2)}`, colVal, y, { align: "right" });

  y += 5;
  doc.text(`SGST (${pct(BILL_TAX_RATES.sgst)}):`, colLabel, y);
  doc.text(`INR ${data.sgst.toFixed(2)}`, colVal, y, { align: "right" });

  if (data.depositAmount > 0) {
    y += 5;
    doc.text("Table Hold Deposit:", colLabel, y);
    doc.text(`INR ${data.depositAmount.toFixed(2)}`, colVal, y, { align: "right" });
  }

  y += 6;
  doc.setFillColor(244, 244, 245);
  doc.rect(colLabel - 3, y - 4, 68, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(`${data.totalLabel || "TOTAL PAID"}:`, colLabel, y + 1);
  doc.text(`INR ${data.total.toFixed(2)}`, colVal, y + 1, { align: "right" });

  // Payment Breakdown Box
  y += 18;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, "F");
  doc.setDrawColor(228, 228, 231);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(63, 63, 70);
  doc.text("PAYMENT DETAILS", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text(`Method: ${data.paymentMethod} (Razorpay Secure)`, margin + 4, y + 12);
  doc.text(`Gateway Ref: ${data.paymentId || "Verified Online"}`, margin + 4, y + 17);
  doc.text(`Order Ref: ${data.orderId || data.bookingCode}`, margin + 95, y + 12);
  doc.text(`Status: COMPLETED / SETTLED`, margin + 95, y + 17);

  // Footer & Terms
  y = 265;
  doc.setFontSize(7.5);
  doc.setTextColor(161, 161, 170);
  doc.text("Thank you for choosing CafeQ! This is a computer-generated tax receipt.", pageWidth / 2, y, {
    align: "center",
  });
  doc.text("For order queries or reservation modifications, please quote your Booking Reference.", pageWidth / 2, y + 4, {
    align: "center",
  });

  return doc;
}

// ─── Download and Data URI Helpers ────────────────────────────────────────────

export function downloadReceiptPdf(data: ReceiptData): void {
  const doc = generateReceiptPdf(data);
  doc.save(`CafeQ-Receipt-${data.bookingCode}.pdf`);
}

export function getReceiptPdfDataUri(data: ReceiptData): string {
  const doc = generateReceiptPdf(data);
  return doc.output("datauristring");
}

// ─── Persistence (Supabase + LocalStorage) ───────────────────────────────────

export async function storeReceipt(data: ReceiptData): Promise<StoredReceipt> {
  const pdfDataUri = getReceiptPdfDataUri(data);
  const receiptRecord: StoredReceipt = {
    ...data,
    id: `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    pdfDataUri,
  };

  const supabase = getPublicClient();
  if (supabase) {
    try {
      await supabase.from("receipts").insert({
        booking_code: data.bookingCode,
        receipt_number: data.receiptNumber,
        order_id: data.orderId || null,
        payment_id: data.paymentId || null,
        payment_method: data.paymentMethod,
        amount: data.total,
        tax_amount: data.taxAmount,
        items: data.items as any,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_email: data.customerEmail || null,
        pdf_data: pdfDataUri,
      });
    } catch (err) {
      console.warn("Could not insert receipt into Supabase, saving locally:", err);
    }
  }

  // Local storage fallback
  try {
    const existing: StoredReceipt[] = JSON.parse(localStorage.getItem(STORAGE_RECEIPTS_KEY) || "[]");
    const filtered = existing.filter((r) => r.bookingCode !== data.bookingCode);
    filtered.push(receiptRecord);
    localStorage.setItem(STORAGE_RECEIPTS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error("Failed to save receipt locally:", err);
  }

  return receiptRecord;
}

// ─── Saved Bills (one per completed order) ───────────────────────────────────

const LOCAL_BILLS_KEY = "cafeq_bills";

function readLocalBills(): StoredReceipt[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || "[]");
  } catch {
    return [];
  }
}

/** The saved bill for an order, if one was generated. */
export async function getSavedBill(bookingCode: string): Promise<StoredReceipt | null> {
  const supabase = getPublicClient();
  if (supabase) {
    const { data } = await supabase
      .from("receipts")
      .select("*")
      .eq("booking_code", bookingCode)
      .like("receipt_number", `${BILL_NUMBER_PREFIX}%`)
      .maybeSingle();
    const row = data as any;
    if (row) {
      return {
        id: row.id,
        receiptNumber: row.receipt_number,
        bookingCode: row.booking_code,
        orderId: row.order_id || undefined,
        paymentId: row.payment_id || undefined,
        paymentMethod: row.payment_method,
        paymentStatus: "paid",
        date: "",
        time: "",
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        customerEmail: row.customer_email || undefined,
        tableType: "",
        partySize: 1,
        items: row.items || [],
        subtotal: Number(row.amount) - Number(row.tax_amount || 0),
        cgst: Number(row.tax_amount || 0) / 2,
        sgst: Number(row.tax_amount || 0) / 2,
        taxAmount: Number(row.tax_amount || 0),
        depositAmount: 0,
        total: Number(row.amount),
        totalLabel: "GRAND TOTAL",
        createdAt: row.created_at,
        pdfDataUri: row.pdf_data || undefined,
      };
    }
    return null;
  }
  return readLocalBills().find((r) => r.bookingCode === bookingCode) || null;
}

/**
 * Returns the order's bill, generating and saving it the first time.
 * Later calls return the same saved bill. Refuses non-completed orders
 * (the database refuses them too — see 20261031000000_order_status_flow.sql).
 */
export async function getOrCreateBill(b: BookingInput): Promise<StoredReceipt> {
  if (!isBillable(b)) throw new BillNotAllowedError(b.code, b.status);
  const existing = await getSavedBill(b.code);
  if (existing) return existing;

  const bill = generateBill(b);
  const record: StoredReceipt = {
    ...bill,
    id: `bill_${b.code}`,
    pdfDataUri: getReceiptPdfDataUri(bill),
  };

  const supabase = getPublicClient();
  if (supabase) {
    const { error } = await supabase.from("receipts").insert({
      booking_code: bill.bookingCode,
      receipt_number: bill.receiptNumber,
      order_id: bill.orderId || null,
      payment_id: bill.paymentId || null,
      payment_method: bill.paymentMethod,
      amount: bill.total,
      tax_amount: bill.taxAmount,
      items: bill.items as any,
      customer_name: bill.customerName,
      customer_phone: bill.customerPhone,
      customer_email: bill.customerEmail || null,
      pdf_data: record.pdfDataUri,
    } as any);
    if (error) {
      // Another admin generated it at the same moment: use the one that was saved
      if (error.code === "23505") {
        const saved = await getSavedBill(b.code);
        if (saved) return saved;
      }
      if (error.message?.startsWith("BILL_NOT_ALLOWED")) throw new BillNotAllowedError(b.code, b.status);
      throw new Error("Could not save the bill. Please try again.");
    }
    return record;
  }

  try {
    localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify([...readLocalBills(), record]));
  } catch {
    // Non-browser fallback
  }
  return record;
}

/** Downloads a saved bill exactly as it was generated. */
export function downloadSavedBill(bill: StoredReceipt): void {
  if (bill.pdfDataUri && typeof document !== "undefined") {
    const link = document.createElement("a");
    link.href = bill.pdfDataUri;
    link.download = `CafeQ-Bill-${bill.bookingCode}.pdf`;
    link.click();
    return;
  }
  downloadReceiptPdf(bill);
}

export async function getReceiptByBookingCode(bookingCode: string): Promise<StoredReceipt | null> {
  const supabase = getPublicClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("receipts")
        .select("*")
        .eq("booking_code", bookingCode)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          receiptNumber: data.receipt_number,
          bookingCode: data.booking_code,
          orderId: data.order_id || undefined,
          paymentId: data.payment_id || undefined,
          paymentMethod: data.payment_method,
          paymentStatus: "paid",
          date: data.created_at.slice(0, 10),
          time: new Date(data.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          customerName: data.customer_name,
          customerPhone: data.customer_phone,
          customerEmail: data.customer_email || undefined,
          tableType: "Reserved Table",
          partySize: 1,
          items: (data.items as any) || [],
          subtotal: Number(data.amount) - Number(data.tax_amount || 0),
          cgst: Number(data.tax_amount || 0) / 2,
          sgst: Number(data.tax_amount || 0) / 2,
          taxAmount: Number(data.tax_amount || 0),
          depositAmount: 0,
          total: Number(data.amount),
          createdAt: data.created_at,
          pdfDataUri: data.pdf_data || undefined,
          emailedAt: data.emailed_at,
        };
      }
    } catch (err) {
      console.warn("Supabase receipt retrieval error, falling back to local:", err);
    }
  }

  try {
    const existing: StoredReceipt[] = JSON.parse(localStorage.getItem(STORAGE_RECEIPTS_KEY) || "[]");
    const found = existing.find((r) => r.bookingCode === bookingCode);
    return found || null;
  } catch {
    return null;
  }
}
