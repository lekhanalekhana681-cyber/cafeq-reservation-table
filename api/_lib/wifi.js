/**
 * Cafe WiFi service for /api/wifi.
 * - Customers: a server-issued customer token + their booking codes → per-booking access.
 *   The SSID/password only leave the server when wifi_access() says "available".
 * - Admin: read/save the WiFi settings with the same admin token as /api/payments/admin.
 * Credentials: WIFI_PASSWORD (server env) is the password customers get; the network name is
 * the one saved in Admin › WiFi, else WIFI_SSID. Neither ever reaches the browser bundle.
 */
import { PaymentError } from "./errors.js";
import {
  issueAdminToken,
  issueCustomerToken,
  loginAdmin,
  loginCustomer,
  verifyAdminToken,
  verifyCustomerToken,
} from "./admin-auth.js";

const MAX_CODES = 20;

/** WiFi credentials from the server environment (blank → use Admin › WiFi). */
const envCredentials = (env) => ({
  ssid: String(env.WIFI_SSID || "").trim() || null,
  password: String(env.WIFI_PASSWORD || "") || null,
});

/** Admin view of what customers actually get: WIFI_PASSWORD (env) wins over the saved password. */
function effectiveSettings(settings, env) {
  const creds = envCredentials(env);
  return {
    ...settings,
    ssid: settings?.ssid || creds.ssid || "",
    password: creds.password || settings?.password || "",
    password_from_env: Boolean(creds.password),
  };
}

export function createWifiService({ db, env = process.env }) {
  return {
    /** { email, password } → { token } for later access checks */
    async customerSession(body) {
      const user = await loginCustomer(db, body);
      console.log(`[wifi] customer session issued user=${user.id}`);
      return { token: issueCustomerToken(user, { env }) };
    },

    /** { codes } + customer token → { access: { [code]: { status, available_from?, available_until?, ssid?, password? } } } */
    async access(token, body) {
      const claims = verifyCustomerToken(token, { env });
      const codes = [...new Set((Array.isArray(body?.codes) ? body.codes : [body?.code]).filter((c) => typeof c === "string" && c))];
      if (codes.length === 0) throw new PaymentError(400, "BAD_REQUEST", "No reservation given.");
      if (codes.length > MAX_CODES) throw new PaymentError(400, "BAD_REQUEST", "Too many reservations in one request.");

      const creds = envCredentials(env);
      const access = {};
      for (const code of codes) {
        access[code] = await db.rpc("wifi_access", {
          _user_id: claims.sub,
          _code: code,
          _env_ssid: creds.ssid,
          _env_password: creds.password,
        });
      }
      const shown = Object.values(access).filter((a) => a?.status === "available").length;
      console.log(`[wifi] access user=${claims.sub} codes=${codes.length} available=${shown}`);
      return { access };
    },

    async adminLogin(body) {
      const admin = await loginAdmin(db, body);
      return { token: issueAdminToken(admin, { env }), name: admin.name };
    },

    async adminGet(token) {
      verifyAdminToken(token, { env });
      return { settings: effectiveSettings(await db.rpc("wifi_admin_get", {}), env) };
    },

    async adminSave(token, body) {
      const claims = verifyAdminToken(token, { env });
      const settings = await db.rpc("wifi_admin_save", {
        _settings: body?.settings || {},
        _actor: `admin:${claims.name || claims.sub}`,
      });
      console.log(`[wifi] settings updated by admin:${claims.name || claims.sub}`);
      return { settings: effectiveSettings(settings, env) };
    },
  };
}
