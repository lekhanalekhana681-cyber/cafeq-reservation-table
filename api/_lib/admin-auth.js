/**
 * Server-verified admin sessions for refunds, forfeits and balance collection.
 * The admin's password is checked with bcrypt against public.users, then a short-lived
 * HMAC-signed token is issued. Signed with PAYMENTS_ADMIN_SECRET (falls back to the
 * service role key) — both are server-only.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PaymentError } from "./errors.js";

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // matches the admin console's 2-hour session

function getSecret(env = process.env) {
  const secret = env.PAYMENTS_ADMIN_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new PaymentError(503, "NOT_CONFIGURED", "Payments admin is not configured.");
  return secret;
}

const b64url = (s) => Buffer.from(s).toString("base64url");
const sign = (payload, secret) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");

export function issueAdminToken(admin, { env = process.env, now = Date.now() } = {}) {
  const payload = b64url(JSON.stringify({ sub: admin.id, name: admin.name, role: "admin", exp: now + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload, getSecret(env))}`;
}

export function verifyAdminToken(token, { env = process.env, now = Date.now() } = {}) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) throw new PaymentError(401, "UNAUTHORIZED", "Please unlock payments with your admin password.");
  const expected = sign(payload, getSecret(env));
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new PaymentError(401, "UNAUTHORIZED", "Please unlock payments with your admin password.");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (claims.role !== "admin" || !claims.exp || claims.exp < now) {
    throw new PaymentError(401, "UNAUTHORIZED", "Your payments session expired. Please unlock again.");
  }
  return claims;
}

export async function loginAdmin(db, { identifier, password }) {
  if (!identifier || !password) throw new PaymentError(400, "BAD_REQUEST", "Enter your admin username/email and password.");
  const user = await db.rpc("pay_admin_user", { _identifier: identifier });
  const ok = user && user.role === "admin" && !user.is_disabled && bcrypt.compareSync(password, user.password_hash);
  if (!ok) throw new PaymentError(401, "UNAUTHORIZED", "Invalid administrator credentials.");
  return { id: user.id, name: user.name };
}
