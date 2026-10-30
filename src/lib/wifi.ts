/**
 * Cafe WiFi — browser side.
 * The SSID/password never live in the bundle or in public tables: they come from /api/wifi,
 * which checks a server-issued customer token and the booking (own, confirmed, paid if
 * applicable, within 15 min before → 30 min after the slot) before returning them.
 */

const CUSTOMER_TOKEN_KEY = "cafeq_wifi_token";
/** Shared with the Payments panel: one admin unlock covers both. */
export const ADMIN_TOKEN_KEY = "cafeq_payments_admin_token";

export type WifiAccessStatus =
  | "available"
  | "not_yet"
  | "ended"
  | "not_configured"
  | "awaiting_confirmation"
  | "awaiting_payment"
  | "cancelled"
  | "not_dine_in"
  | "not_found";

export type WifiAccess = {
  code: string;
  status: WifiAccessStatus;
  available_from?: string;
  available_until?: string;
  ssid?: string;
  password?: string;
};

export type WifiSettings = {
  ssid: string;
  password: string;
  valid_from: string | null;
  valid_until: string | null;
  session_minutes: number;
  updated_at: string | null;
  updated_by: string | null;
};

export class WifiApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
    this.name = "WifiApiError";
  }
}

async function postWifi<T>(body: Record<string, unknown>, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/wifi", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new WifiApiError("Couldn't reach the server. Check your connection and try again.", "NETWORK");
  }
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // Plain `vite dev` serves index.html for /api/* — the functions run on Vercel or `vercel dev`
    throw new WifiApiError("WiFi details aren't available on this server.", "NO_SERVER", res.status);
  }
  if (!res.ok) throw new WifiApiError(data?.error || "WiFi request failed.", data?.code, res.status);
  return data as T;
}

// ─── Customer session ────────────────────────────────────────────────────────

type StoredToken = { token: string; userId: string };

export function getWifiToken(userId: string | undefined | null): string | null {
  if (!userId) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOMER_TOKEN_KEY) || "null") as StoredToken | null;
    return stored && stored.userId === userId ? stored.token : null;
  } catch {
    return null;
  }
}

export function clearWifiSession(): void {
  try {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/** Exchanges the customer's password for a server-signed WiFi token. Never throws. */
export async function requestWifiSession(email: string, password: string, userId: string): Promise<boolean> {
  try {
    const { token } = await postWifi<{ token: string }>({ action: "session", email, password });
    localStorage.setItem(CUSTOMER_TOKEN_KEY, JSON.stringify({ token, userId } satisfies StoredToken));
    return true;
  } catch (err) {
    console.warn("[wifi] could not start a WiFi session:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Access for the given bookings. Throws WifiApiError("…", "LOGIN_REQUIRED") without a valid session. */
export async function fetchWifiAccess(userId: string, codes: string[]): Promise<Record<string, WifiAccess>> {
  const token = getWifiToken(userId);
  if (!token) throw new WifiApiError("Confirm your password to see the cafe WiFi.", "LOGIN_REQUIRED", 401);
  try {
    const { access } = await postWifi<{ access: Record<string, WifiAccess> }>({ action: "access", codes }, token);
    return access;
  } catch (err) {
    if (err instanceof WifiApiError && err.status === 401) clearWifiSession();
    throw err;
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export const wifiAdminApi = <T = any>(token: string | null, action: string, params: Record<string, unknown> = {}) =>
  postWifi<T>({ action, ...params }, token);

// ─── QR code ─────────────────────────────────────────────────────────────────

/** Escapes \ ; , : " as the WiFi QR format requires. */
const escapeWifi = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");

/** Standard WiFi QR payload, scannable by iOS/Android cameras. */
export const buildWifiQrValue = (ssid: string, password: string) =>
  `WIFI:T:WPA;S:${escapeWifi(ssid)};P:${escapeWifi(password)};;`;
