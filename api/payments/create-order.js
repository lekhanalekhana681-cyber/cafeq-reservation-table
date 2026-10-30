/**
 * POST /api/payments/create-order  { code, method: "razorpay" | "upi" }
 * Creates (or reuses) the Razorpay order (razorpay.orders.create) for an order paying online:
 * a pre-order deposit or a full online payment. The amount is computed in the database from
 * menu prices — never taken from the client. Cash methods are rejected with 400.
 */
import { json, readJson, route, servicesFromEnv } from "../_lib/http.js";

export const POST = route(async (request) => {
  const { code, method } = await readJson(request);
  const { service } = servicesFromEnv();
  return json(200, await service.createOrder({ code, method }));
});
