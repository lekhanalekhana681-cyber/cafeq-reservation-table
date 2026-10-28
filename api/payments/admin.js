/**
 * POST /api/payments/admin  { action, ...params }
 * - action "login" { identifier, password } → { token } (bcrypt check against public.users)
 * - every other action needs  Authorization: Bearer <token>
 *   list { filter }, refund { code, amountPaise? }, forfeit { code, reason },
 *   no_show { code }, cancel { code, reason } (cafe cancel → full refund),
 *   collect { code, method: "cash" | "upi" }, settings { settings }
 * Every change is written to payment_audit_log with the admin's name.
 */
import { PaymentError } from "../_lib/errors.js";
import { issueAdminToken, loginAdmin, verifyAdminToken } from "../_lib/admin-auth.js";
import { json, readJson, route, servicesFromEnv } from "../_lib/http.js";

export const POST = route(async (request) => {
  const body = await readJson(request);
  const { db, service } = servicesFromEnv();

  if (body.action === "login") {
    const admin = await loginAdmin(db, body);
    return json(200, { token: issueAdminToken(admin), name: admin.name });
  }

  const claims = verifyAdminToken((request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  const actor = `admin:${claims.name || claims.sub}`;

  switch (body.action) {
    case "list":
      return json(200, await service.list({ filter: body.filter }));
    case "refund":
      return json(200, await service.refund({ code: body.code, amountPaise: body.amountPaise, actor, reason: body.reason }));
    case "forfeit":
      return json(200, await service.forfeit({ code: body.code, actor, reason: body.reason }));
    case "no_show":
      return json(200, await service.noShow({ code: body.code, actor }));
    case "cancel":
      return json(200, await service.cancelOrder(body.code, actor, body.reason || "Cancelled by the cafe"));
    case "collect":
      return json(200, await service.collectBalance({ code: body.code, method: body.method, actor }));
    case "settings":
      return json(200, await service.updateSettings({ settings: body.settings || {}, actor }));
    default:
      throw new PaymentError(400, "BAD_REQUEST", "Unknown action.");
  }
});
