import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Returns the configured deployed backend URL.
 * Automatically checks environment variables and falls back to window origin on mobile devices
 * to guarantee that mobile phones reach the same server/database instead of an unreachable localhost.
 */
export function getBackendUrl(): string {
  const envUrl =
    import.meta.env?.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env?.["VITE_SUPABASE_URL"] || process.env?.["SUPABASE_URL"] : undefined) ||
    import.meta.env?.VITE_BACKEND_URL;

  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/$/, "");
  }

  // In browser, dynamically resolve the shared deployed host URL
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
}

/**
 * Retrieves the active JWT token from storage if present.
 */
export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem("cafeq_auth_session");
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session?.token && (!session.expiresAt || session.expiresAt > Date.now())) {
      return session.token;
    }
  } catch {
    return null;
  }
  return null;
}

let cachedClient: SupabaseClient<Database> | null = null;
let lastUsedToken: string | null = null;

/**
 * Returns a configured Supabase client with proper Authorization headers.
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  const url =
    import.meta.env?.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env?.["VITE_SUPABASE_URL"] || process.env?.["SUPABASE_URL"] : undefined);

  const key =
    import.meta.env?.VITE_SUPABASE_ANON_KEY ||
    (typeof process !== "undefined" ? process.env?.["VITE_SUPABASE_ANON_KEY"] || process.env?.["SUPABASE_PUBLISHABLE_KEY"] : undefined);

  if (!url || !key) {
    return null;
  }

  const token = getStoredAuthToken();

  if (cachedClient && lastUsedToken === token) {
    return cachedClient;
  }

  lastUsedToken = token;

  cachedClient = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        if (token) {
          h.set("Authorization", `Bearer ${token}`);
        } else if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  return cachedClient;
}

export const supabase = getSupabaseClient();
