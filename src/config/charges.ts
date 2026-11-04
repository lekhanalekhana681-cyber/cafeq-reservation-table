/**
 * Order charges in ₹. Change the parcel charge here; the database uses the same value
 * (cafe_settings key "packaging_charge", set by 20261105000000_parcel_charge_and_upi_verify.sql)
 * and the server-side price always wins.
 */

/** Flat parcel charge per takeaway order (not per item). Never applied to dine-in or table bookings. */
export const PARCEL_CHARGE = 30;

/** GST on food and drinks. The bill and the checkout both use these; the database mirrors them (order_gst_paise). */
export const TAX_RATES = {
  cgst: 0.025,
  sgst: 0.025,
} as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** CGST and SGST on an items subtotal, each rounded to the paisa. */
export function computeOrderTaxes(subtotal: number): { cgst: number; sgst: number; taxAmount: number } {
  const cgst = round2(subtotal * TAX_RATES.cgst);
  const sgst = round2(subtotal * TAX_RATES.sgst);
  return { cgst, sgst, taxAmount: round2(cgst + sgst) };
}
