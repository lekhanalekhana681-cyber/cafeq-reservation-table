/**
 * POST /api/payments/cancel  { code, phone, reason? }
 * Customer cancellation of a pre-order. Before the cutoff the deposit is refunded
 * automatically; after it the deposit is forfeited. The phone must match the order.
 */
import { json, readJson, route, servicesFromEnv } from "../_lib/http.js";

export const POST = route(async (request) => {
  const { code, phone, reason } = await readJson(request);
  const { service } = servicesFromEnv();
  return json(200, await service.cancelByCustomer({ code, phone, reason }));
});
