/**
 * GET /api/cron/expire-unpaid
 * Marks pre-orders still unpaid 15 minutes after placement as expired.
 * Primary schedule: pg_cron inside Supabase (every 5 minutes, set up by the migration).
 * This endpoint is for an external scheduler or Vercel Cron; it requires
 * Authorization: Bearer <CRON_SECRET> (Vercel Cron sends this automatically).
 */
import { PaymentError } from "../_lib/errors.js";
import { json, route, servicesFromEnv } from "../_lib/http.js";

export const GET = route(async (request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new PaymentError(401, "UNAUTHORIZED", "Unauthorized.");
  }
  const { service } = servicesFromEnv();
  return json(200, { expired: await service.expireUnpaid() });
});
