/**
 * Order charges in ₹. Change the parcel charge here; the database uses the same value
 * (cafe_settings key "packaging_charge", set by 20261105000000_parcel_charge_and_upi_verify.sql)
 * and the server-side price always wins.
 */

/** Flat parcel charge per takeaway order (not per item). Never applied to dine-in or table bookings. */
export const PARCEL_CHARGE = 30;
