/**
 * UPI QR backup (when the payment gateway fails or the customer prefers to scan).
 * The UPI ID is a DUMMY placeholder until the real one is set in .env:
 *   VITE_CAFE_UPI_ID=yourcafe@okhdfcbank
 *   VITE_CAFE_UPI_NAME=Your Cafe Name
 * (VITE_ because the QR is drawn in the browser. A UPI ID is public, so this is safe to expose.)
 */

const env = (import.meta as any).env ?? {};

export const CAFE_UPI_ID: string = env.VITE_CAFE_UPI_ID || "dummycafe@upi";
export const CAFE_UPI_NAME: string = env.VITE_CAFE_UPI_NAME || "Cafe Name";

/**
 * upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=<reservation id>
 * Values are percent-encoded (spaces as %20, not "+", which some UPI apps show literally).
 */
export function buildUpiPaymentLink({
  amount,
  reference,
  upiId = CAFE_UPI_ID,
  payeeName = CAFE_UPI_NAME,
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
