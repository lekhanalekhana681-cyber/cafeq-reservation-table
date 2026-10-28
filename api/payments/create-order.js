/**
 * POST /api/payments/create-order  { code }
 * Creates (or reuses) the Razorpay order for an unpaid pre-order.
 * The amount is computed in the database from menu prices — never taken from the client.
 */
import { json, readJson, route, servicesFromEnv } from "../_lib/http.js";

export const POST = route(async (request) => {
  const { code } = await readJson(request);
  const { service } = servicesFromEnv();
  return json(200, await service.createOrder({ code }));
});
