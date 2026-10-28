/**
 * Per-Item Kitchen Status Utilities
 * Every food item in a ticket moves on its own:
 *   PENDING → PREPARING → READY → SERVED   (any unfinished item can be CANCELLED)
 * The ticket-level kitchen status is always DERIVED from its items.
 *
 * Mirrored in SQL by kds_item_transition_allowed / kds_derive_ticket_status
 * (supabase/migrations/20261029000000_per_item_kitchen_status.sql).
 */

export const ITEM_STATUSES = ["PENDING", "PREPARING", "READY", "SERVED", "CANCELLED"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type TicketStatus = "new" | "preparing" | "ready" | "completed" | "cancelled";

/** The minimum an item needs for status logic (OrderItem satisfies this). */
export type StatusItem = {
  id: string;
  status?: string | null;
  startedAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  cancelledAt?: string | null;
};

const FORWARD: Record<ItemStatus, ItemStatus | null> = {
  PENDING: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED",
  SERVED: null,
  CANCELLED: null,
};

export function isItemStatus(raw: unknown): raw is ItemStatus {
  return typeof raw === "string" && (ITEM_STATUSES as readonly string[]).includes(raw);
}

/** The next forward stage for an item, or null when it is finished. */
export function getNextItemStatus(status: ItemStatus): ItemStatus | null {
  return FORWARD[status];
}

/**
 * Only single-step forward moves are allowed, plus cancelling any unfinished item.
 * Served and cancelled items are final.
 */
export function canTransitionItem(from: ItemStatus, to: ItemStatus): boolean {
  if (to === "CANCELLED") return from !== "SERVED" && from !== "CANCELLED";
  return FORWARD[from] === to;
}

/**
 * Normalizes a stored item status. Items saved before per-item tracking only had
 * "pending"/"done" (or nothing), so their real stage is inferred from the ticket.
 */
export function backfillItemStatus(
  raw: unknown,
  ticket: { kitchenStatus?: string | null; status?: string | null }
): ItemStatus {
  if (isItemStatus(raw)) return raw;

  const bookingStatus = (ticket.status || "").toLowerCase();
  const kitchen = (ticket.kitchenStatus || "").toLowerCase();
  if (bookingStatus === "cancelled" || kitchen === "cancelled") return "CANCELLED";
  if (bookingStatus === "completed" || kitchen === "completed") return "SERVED";
  if (kitchen === "ready") return "READY";
  if (kitchen === "preparing") return raw === "done" ? "READY" : "PREPARING";
  return "PENDING";
}

/**
 * Ticket status derived from its items:
 * - no items, or every item cancelled          → cancelled (empty → new)
 * - every live item PENDING                     → new
 * - every live item SERVED                      → completed
 * - every live item READY or SERVED (≥1 READY)  → ready
 * - anything else (something cooking, or mixed) → preparing
 */
export function deriveTicketStatus(items: Array<{ status?: string | null }>): TicketStatus {
  if (items.length === 0) return "new";
  const live = items.filter((i) => i.status !== "CANCELLED");
  if (live.length === 0) return "cancelled";
  if (live.every((i) => i.status === "PENDING")) return "new";
  if (live.every((i) => i.status === "SERVED")) return "completed";
  if (live.every((i) => i.status === "READY" || i.status === "SERVED")) return "ready";
  return "preparing";
}

/**
 * Returns a copy of `items` with the given items moved to `to`, stamping the
 * matching timestamp. Throws on an invalid jump; items already at `to` are left as-is.
 */
export function applyItemTransition<T extends StatusItem>(
  items: T[],
  itemIds: string[],
  to: ItemStatus,
  nowIso: string = new Date().toISOString()
): T[] {
  const ids = new Set(itemIds);
  return items.map((item) => {
    if (!ids.has(item.id)) return item;
    const from = (item.status as ItemStatus) || "PENDING";
    if (from === to) return item;
    if (!canTransitionItem(from, to)) {
      throw new ItemTransitionError("INVALID_TRANSITION", `Cannot move item from ${from} to ${to}.`, from);
    }
    const stamp =
      to === "PREPARING" ? { startedAt: nowIso }
      : to === "READY" ? { readyAt: nowIso }
      : to === "SERVED" ? { servedAt: nowIso }
      : { cancelledAt: nowIso };
    return { ...item, status: to, ...stamp };
  });
}

export class ItemTransitionError extends Error {
  constructor(
    public readonly code: "INVALID_TRANSITION" | "CONFLICT" | "NOT_FOUND",
    message: string,
    public readonly currentStatus?: ItemStatus
  ) {
    super(message);
    this.name = "ItemTransitionError";
  }
}

// ─── Progress (customer tracking, history, admin) ──────────────────────────────

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  PENDING: "Queued",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

export const ITEM_STATUS_BADGE_CLASS: Record<ItemStatus, string> = {
  PENDING: "bg-muted text-muted-foreground border-border",
  PREPARING: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  READY: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  SERVED: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  CANCELLED: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 line-through",
};

export type ItemProgress = {
  total: number; // live (non-cancelled) items
  pending: number;
  preparing: number;
  ready: number;
  served: number;
  cancelled: number;
};

export function getItemProgress(items: Array<{ status?: string | null }>): ItemProgress {
  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  const cancelled = count("CANCELLED");
  return {
    total: items.length - cancelled,
    pending: count("PENDING"),
    preparing: count("PREPARING"),
    ready: count("READY"),
    served: count("SERVED"),
    cancelled,
  };
}

/** e.g. "2 of 3 items ready", "3 of 3 items served", "1 of 2 items in prep" */
export function formatItemProgress(items: Array<{ status?: string | null }>): string {
  const p = getItemProgress(items);
  if (p.total === 0) return p.cancelled > 0 ? "All items cancelled" : "No items";
  const noun = p.total === 1 ? "item" : "items";
  if (p.served === p.total) return `${p.served} of ${p.total} ${noun} served`;
  if (p.ready + p.served > 0) return `${p.ready + p.served} of ${p.total} ${noun} ready`;
  if (p.preparing > 0) return `${p.preparing} of ${p.total} ${noun} in prep`;
  return `${p.total} ${noun} waiting`;
}

// ─── Time helpers (KDS timer & KPIs) ───────────────────────────────────────────

/** Parses an ISO / Postgres timestamp to epoch ms; invalid or missing → null. */
export function parseTimestamp(raw?: string | null): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** mm:ss under an hour, h:mm:ss beyond. Negative input is treated as 0. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

/** Average startedAt → readyAt across items, in whole minutes (null when nothing to average). */
export function averagePrepMinutes(items: StatusItem[]): number | null {
  const durations = items
    .map((i) => {
      const start = parseTimestamp(i.startedAt);
      const ready = parseTimestamp(i.readyAt);
      return start !== null && ready !== null && ready >= start ? ready - start : null;
    })
    .filter((d): d is number => d !== null);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000);
}

export function isSameLocalDay(ms: number | null, reference: number): boolean {
  if (ms === null) return false;
  const a = new Date(ms);
  const b = new Date(reference);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
