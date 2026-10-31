/**
 * Cafe UPI details for the "Pay via UPI QR" backup (when the payment gateway fails or the
 * customer prefers to scan). Set in .env (a UPI ID is public, so it's safe in the browser):
 *   CAFE_UPI_ID=7349540534@axl
 *   CAFE_PAYEE_NAME=LEKHANA B S
 * vite.config.ts exposes exactly these two names to the browser.
 */

const env = (import.meta as any).env ?? {};

export const CAFE_UPI_ID: string = env.CAFE_UPI_ID || env.VITE_CAFE_UPI_ID || "7349540534@axl";
export const CAFE_PAYEE_NAME: string = env.CAFE_PAYEE_NAME || env.VITE_CAFE_UPI_NAME || "LEKHANA B S";
/** @deprecated use CAFE_PAYEE_NAME */
export const CAFE_UPI_NAME = CAFE_PAYEE_NAME;

/** Static PhonePe QR (no amount in it — the customer types the amount). */
export const CAFE_STATIC_QR_URL = "/images/cafeq-phonepe-qr.jpeg";

/**
 * upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=<reservation id>
 * Values are percent-encoded (spaces as %20, not "+", which some UPI apps show literally).
 */
export function buildUpiPaymentLink({
  amount,
  reference,
  upiId = CAFE_UPI_ID,
  payeeName = CAFE_PAYEE_NAME,
}: {
  amount: number;
  reference: string;
  upiId?: string;
  payeeName?: string;
}): string {
  const enc = (v: string) => encodeURIComponent(v).replace(/%40/g, "@");
  const am = (Math.round(Math.max(amount, 0) * 100) / 100).toFixed(2);
  return `upi://pay?pa=${enc(upiId)}&pn=${enc(payeeName)}&am=${am}&cu=INR&tn=${enc(reference)}`;
}

/** A UPI transaction ID (UTR) is 12 digits. Spaces are ignored. */
export const normalizeUtr = (utr: string) => utr.replace(/\s+/g, "");
export const isValidUtr = (utr: string) => /^\d{12}$/.test(normalizeUtr(utr));
