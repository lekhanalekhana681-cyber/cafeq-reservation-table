/**
 * Per-User Notification Opt-in / Opt-out Management
 * Stores preferences in Supabase & LocalStorage with sensible opt-in defaults.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { NotificationPreferences } from "./types";

const STORAGE_PREFS_KEY = "cafeq_notification_preferences";

function getPublicClient() {
  const url = import.meta.env?.VITE_SUPABASE_URL || process.env?.["SUPABASE_URL"];
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  smsEnabled: true,
  emailEnabled: false,
  whatsappEnabled: false,
  remindersEnabled: true,
};

export async function getUserNotificationPreferences(identifier: {
  userId?: string;
  phone?: string;
  email?: string;
}): Promise<NotificationPreferences> {
  const cleanPhone = identifier.phone ? identifier.phone.replace(/\D/g, "") : undefined;
  const cleanEmail = identifier.email?.trim().toLowerCase();

  const supabase = getPublicClient();
  if (supabase) {
    try {
      let query = supabase.from("notification_preferences").select("*");
      if (identifier.userId) {
        query = query.eq("user_id", identifier.userId);
      } else if (cleanPhone) {
        query = query.eq("phone", cleanPhone);
      } else if (cleanEmail) {
        query = query.eq("email", cleanEmail);
      } else {
        return DEFAULT_PREFERENCES;
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (!error && data) {
        return {
          userId: data.user_id || undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          smsEnabled: data.sms_enabled ?? true,
          emailEnabled: data.email_enabled ?? true,
          whatsappEnabled: data.whatsapp_enabled ?? true,
          remindersEnabled: data.reminders_enabled ?? true,
        };
      }
    } catch (err) {
      console.warn("Could not load preferences from Supabase, checking local storage:", err);
    }
  }

  // Local storage fallback
  try {
    const allPrefs: Record<string, NotificationPreferences> = JSON.parse(
      localStorage.getItem(STORAGE_PREFS_KEY) || "{}"
    );

    const key = identifier.userId || cleanPhone || cleanEmail;
    if (key && allPrefs[key]) {
      return { ...DEFAULT_PREFERENCES, ...allPrefs[key] };
    }
  } catch (err) {
    console.error("Local preferences read error:", err);
  }

  return DEFAULT_PREFERENCES;
}

export async function updateUserNotificationPreferences(
  identifier: {
    userId?: string;
    phone?: string;
    email?: string;
  },
  updates: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const current = await getUserNotificationPreferences(identifier);
  const updated: NotificationPreferences = {
    ...current,
    ...updates,
    userId: identifier.userId || current.userId,
    phone: identifier.phone || current.phone,
    email: identifier.email || current.email,
  };

  const cleanPhone = updated.phone ? updated.phone.replace(/\D/g, "") : undefined;
  const cleanEmail = updated.email?.trim().toLowerCase();

  const supabase = getPublicClient();
  if (supabase) {
    try {
      await supabase.from("notification_preferences").upsert(
        {
          user_id: updated.userId || null,
          phone: cleanPhone || null,
          email: cleanEmail || null,
          sms_enabled: updated.smsEnabled,
          email_enabled: updated.emailEnabled,
          whatsapp_enabled: updated.whatsappEnabled,
          reminders_enabled: updated.remindersEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: updated.userId ? "user_id" : "phone" }
      );
    } catch (err) {
      console.warn("Could not save preferences to Supabase:", err);
    }
  }

  // Save to LocalStorage
  try {
    const allPrefs: Record<string, NotificationPreferences> = JSON.parse(
      localStorage.getItem(STORAGE_PREFS_KEY) || "{}"
    );
    const primaryKey = updated.userId || cleanPhone || cleanEmail;
    if (primaryKey) {
      allPrefs[primaryKey] = updated;
      localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(allPrefs));
    }
  } catch (err) {
    console.error("Failed to save preferences to localStorage:", err);
  }

  return updated;
}
