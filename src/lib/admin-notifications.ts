/**
 * Admin Notifications Service
 * Stores and manages in-app notifications for restaurant managers (new reservations, cancellations, alerts).
 * Persists to LocalStorage and syncs via window events.
 */

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: "reservation" | "cancellation" | "payment" | "menu" | "system";
  read: boolean;
  createdAt: string;
  bookingCode?: string;
  customerName?: string;
}

const STORAGE_KEY = "cafeq_admin_notifications";

function getStoredNotifications(): AdminNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: AdminNotification[] = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error("Failed to read admin notifications from storage:", err);
    return [];
  }
}

function saveNotifications(notifications: AdminNotification[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 200)));
    window.dispatchEvent(new CustomEvent("cafeq_notification_update"));
  } catch (err) {
    console.error("Failed to save admin notifications:", err);
  }
}

export async function getAdminNotifications(): Promise<AdminNotification[]> {
  const list = getStoredNotifications();
  // Sort newest first
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createAdminNotification(
  data: Omit<AdminNotification, "id" | "createdAt" | "read">
): Promise<AdminNotification> {
  const newNotif: AdminNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    read: false,
    ...data,
  };

  const current = getStoredNotifications();
  current.unshift(newNotif);
  saveNotifications(current);
  return newNotif;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const current = getStoredNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(updated);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const current = getStoredNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
  saveNotifications(updated);
}

export async function clearAllNotifications(): Promise<void> {
  saveNotifications([]);
}

export async function getUnreadNotificationsCount(): Promise<number> {
  const list = getStoredNotifications();
  return list.filter((n) => !n.read).length;
}
