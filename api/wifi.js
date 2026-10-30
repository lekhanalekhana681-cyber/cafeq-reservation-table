/**
 * POST /api/wifi  { action, ...params }
 * - session { email, password }              → { token }   (customer, bcrypt check against public.users)
 * - access  { codes: [...] } + Bearer <customer token> → { access: { [code]: {...} } }
 * - admin_login { identifier, password }     → { token }   (same admin token as /api/payments/admin)
 * - admin_get / admin_save { settings } + Bearer <admin token>
 * The WiFi password is only returned for a customer's own confirmed booking inside its time window.
 */
import { PaymentError } from "./_lib/errors.js";
import { createSupabaseDb } from "./_lib/db.js";
import { json, readJson, route } from "./_lib/http.js";
import { createWifiService } from "./_lib/wifi.js";

export const POST = route(async (request) => {
  const body = await readJson(request);
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const wifi = createWifiService({ db: createSupabaseDb() });

  switch (body.action) {
    case "session":
      return json(200, await wifi.customerSession(body));
    case "access":
      return json(200, await wifi.access(token, body));
    case "admin_login":
      return json(200, await wifi.adminLogin(body));
    case "admin_get":
      return json(200, await wifi.adminGet(token));
    case "admin_save":
      return json(200, await wifi.adminSave(token, body));
    default:
      throw new PaymentError(400, "BAD_REQUEST", "Unknown action.");
  }
});
