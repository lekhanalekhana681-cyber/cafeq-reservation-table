/**
 * System Audit & Activity Logger
 * Records key admin and system actions (login, reservation created/updated/cancelled, menu edits).
 * Persists to LocalStorage and supports search, category, and date filtering.
 */

export interface AuditLogRecord {
  id: string;
  timestamp: string; // ISO string
  user: string;      // e.g. "Admin (CafeQ)", "Customer (Lekhana B S)", "System"
  action: string;    // e.g. "LOGIN", "RESERVATION_CREATED", "RESERVATION_CANCELLED", "MENU_UPDATED"
  category: "auth" | "reservation" | "menu" | "system";
  details: string;
  status: "success" | "warning" | "error";
}

const STORAGE_AUDIT_KEY = "cafeq_system_audit_logs";

function getStoredLogs(): AuditLogRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_AUDIT_KEY);
    if (!raw) return [];
    const list: AuditLogRecord[] = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error("Failed to read audit logs from storage:", err);
    return [];
  }
}

function saveLogs(logs: AuditLogRecord[]) {
  if (typeof window === "undefined") return;
  try {
    // Keep last 300 logs
    localStorage.setItem(STORAGE_AUDIT_KEY, JSON.stringify(logs.slice(0, 300)));
    window.dispatchEvent(new CustomEvent("cafeq_audit_log_update"));
  } catch (err) {
    console.error("Failed to save audit logs:", err);
  }
}

export async function logActivity(entry: {
  user?: string;
  action: string;
  category: "auth" | "reservation" | "menu" | "system";
  details: string;
  status?: "success" | "warning" | "error";
}): Promise<AuditLogRecord> {
  const newRecord: AuditLogRecord = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    user: entry.user || "Admin",
    action: entry.action,
    category: entry.category,
    details: entry.details,
    status: entry.status || "success",
  };

  const logs = getStoredLogs();
  logs.unshift(newRecord);
  saveLogs(logs);
  return newRecord;
}

export async function getAuditLogs(filter?: {
  search?: string;
  date?: string; // YYYY-MM-DD
  category?: string;
}): Promise<AuditLogRecord[]> {
  let logs = getStoredLogs();

  // If no logs exist yet, seed a few standard system bootstrap logs so the table isn't dead
  if (logs.length === 0) {
    const seedTime = new Date().toISOString();
    logs = [
      {
        id: `audit_init_1`,
        timestamp: seedTime,
        user: "System",
        action: "SYSTEM_INITIALIZED",
        category: "system",
        details: "CafeQ booking and management server operational.",
        status: "success",
      },
    ];
    saveLogs(logs);
  }

  // Sort newest first
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (filter?.category && filter.category !== "all") {
    logs = logs.filter((l) => l.category === filter.category);
  }

  if (filter?.date) {
    logs = logs.filter((l) => l.timestamp.startsWith(filter.date!));
  }

  if (filter?.search?.trim()) {
    const q = filter.search.toLowerCase().trim();
    logs = logs.filter(
      (l) =>
        l.user.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
    );
  }

  return logs;
}

export async function clearAuditLogs(): Promise<void> {
  saveLogs([]);
}
