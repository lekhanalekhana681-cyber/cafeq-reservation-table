/**
 * CafeQ Menu Management Service
 * Handles live menu state, price edits from admin panel,
 * stock status synchronization, cocktail licensing visibility toggles,
 * and real-time cross-tab & Supabase synchronization.
 */

import { menu as initialMenu, type MenuItem } from "@/data/menu";
import {
  setItemStock,
  getOutOfStockItemIds,
  STORAGE_OUT_OF_STOCK_KEY,
} from "./stock";
import { getPublicClient } from "./bookings.functions";

export const STORAGE_MENU_ITEMS_KEY = "cafeq_menu_items";
export const STORAGE_HIDE_COCKTAILS_KEY = "cafeq_hide_cocktails";

// Cross-tab broadcast channel for real-time synchronization
const MENU_CHANNEL_NAME = "cafeq_menu_sync_bus";
let menuChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    menuChannel = new BroadcastChannel(MENU_CHANNEL_NAME);
  } catch {
    menuChannel = null;
  }
}

const memoryStore: Map<string, string> =
  (globalThis as any).__cafeq_memory_store__ ||
  ((globalThis as any).__cafeq_memory_store__ = new Map<string, string>());

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return {
    getItem: (key: string) => (memoryStore.has(key) ? memoryStore.get(key)! : null),
    setItem: (key: string, value: string) => {
      memoryStore.set(key, String(value));
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
  };
}

/**
 * Get current menu items, merging seed menu with any admin price/stock edits
 * and out-of-stock items.
 */
export function getStoredMenu(): MenuItem[] {
  try {
    const storage = getStorage();
    const raw = storage.getItem(STORAGE_MENU_ITEMS_KEY);
    const outOfStockIds = new Set(getOutOfStockItemIds());

    if (!raw) {
      // First time initialize with seed data, aligned with out-of-stock state
      const initialized = initialMenu.map((m) => ({
        ...m,
        isAvailable: outOfStockIds.has(m.id) ? false : (m.isAvailable ?? true),
      }));
      storage.setItem(STORAGE_MENU_ITEMS_KEY, JSON.stringify(initialized));
      return initialized;
    }

    const savedItems: MenuItem[] = JSON.parse(raw);
    const savedMap = new Map<string, MenuItem>(savedItems.map((i) => [i.id, i]));

    // Idempotently merge: ensure all items from initialMenu exist and have user overrides
    const merged = initialMenu.map((baseItem) => {
      const saved = savedMap.get(baseItem.id);
      const isMarkedOutOfStock = outOfStockIds.has(baseItem.id);

      if (saved) {
        return {
          ...baseItem,
          price: typeof saved.price === "number" ? saved.price : baseItem.price,
          isAvailable: isMarkedOutOfStock
            ? false
            : saved.isAvailable !== undefined
            ? saved.isAvailable
            : (baseItem.isAvailable ?? true),
          tag: saved.tag !== undefined ? saved.tag : baseItem.tag,
        };
      }

      return {
        ...baseItem,
        isAvailable: isMarkedOutOfStock ? false : (baseItem.isAvailable ?? true),
      };
    });

    // Purge any saved items that are no longer in initialMenu
    const initialIds = new Set(initialMenu.map((i) => i.id));
    const cleanedSaved = savedItems.filter((i) => initialIds.has(i.id));
    if (cleanedSaved.length !== savedItems.length) {
      storage.setItem(STORAGE_MENU_ITEMS_KEY, JSON.stringify(cleanedSaved));
    }

    return merged;
  } catch (err) {
    console.error("Failed to read menu from storage:", err);
    return initialMenu;
  }
}

/**
 * Save menu items to local storage and broadcast to other tabs
 */
export function saveStoredMenu(items: MenuItem[]): void {
  try {
    const storage = getStorage();
    storage.setItem(STORAGE_MENU_ITEMS_KEY, JSON.stringify(items));
    notifyMenuUpdated();
  } catch (err) {
    console.error("Failed to save menu items:", err);
  }
}

/**
 * Update the price of a specific menu item (Used by Admin Menu Manager)
 */
export function updateMenuItemPrice(id: string, newPrice: number): boolean {
  if (newPrice < 0) return false;
  try {
    const items = getStoredMenu();
    const targetIdx = items.findIndex((i) => i.id === id);
    if (targetIdx === -1) return false;

    items[targetIdx] = {
      ...items[targetIdx],
      price: Math.round(newPrice),
    };

    saveStoredMenu(items);

    // Persist to Supabase if available
    const supabase = getPublicClient();
    if (supabase) {
      supabase
        .from("menu_items")
        .update({ price: Math.round(newPrice), updated_at: new Date().toISOString() })
        .or(`id.eq.${id},name.ilike.${items[targetIdx].name}`)
        .then(({ error }) => {
          if (error) console.warn("Supabase menu price update warning:", error.message);
        });
    }

    return true;
  } catch (err) {
    console.error("Failed to update item price:", err);
    return false;
  }
}

/**
 * Update any attributes of a menu item (e.g., isAvailable / price).
 * Fully synchronizes local storage, stock state list, and Supabase database.
 */
export function updateMenuItem(id: string, updates: Partial<MenuItem>): boolean {
  try {
    const items = getStoredMenu();
    const targetIdx = items.findIndex((i) => i.id === id);
    if (targetIdx === -1) return false;

    const currentItem = items[targetIdx];
    items[targetIdx] = {
      ...currentItem,
      ...updates,
    };

    saveStoredMenu(items);

    // Keep outOfStock list & kitchen events synchronized if isAvailable is updated
    if (updates.isAvailable !== undefined) {
      setItemStock(id, !updates.isAvailable);
    }

    // Persist to Supabase database (matching on id or name)
    const supabase = getPublicClient();
    if (supabase) {
      const dbUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.isAvailable !== undefined) {
        dbUpdates.is_available = updates.isAvailable;
      }
      if (updates.price !== undefined) {
        dbUpdates.price = updates.price;
      }

      supabase
        .from("menu_items")
        .update(dbUpdates)
        .or(`id.eq.${id},name.ilike.${currentItem.name}`)
        .then(({ error }) => {
          if (error) {
            console.warn("Supabase menu_items update warning:", error.message);
          }
        });
    }

    notifyMenuUpdated();
    return true;
  } catch (err) {
    console.error("Failed to update menu item:", err);
    return false;
  }
}

/**
 * Async version of updateMenuItem with full Supabase persistence confirmation
 */
export async function updateMenuItemAsync(id: string, updates: Partial<MenuItem>): Promise<boolean> {
  const syncSuccess = updateMenuItem(id, updates);
  if (!syncSuccess) return false;

  const supabase = getPublicClient();
  if (supabase) {
    try {
      const items = getStoredMenu();
      const item = items.find((i) => i.id === id);
      if (!item) return true;

      const dbUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.isAvailable !== undefined) {
        dbUpdates.is_available = updates.isAvailable;
      }
      if (updates.price !== undefined) {
        dbUpdates.price = updates.price;
      }

      const { error } = await supabase
        .from("menu_items")
        .update(dbUpdates)
        .or(`id.eq.${id},name.ilike.${item.name}`);

      if (error) {
        console.warn("Supabase menu_items update error:", error.message);
      }
    } catch (err) {
      console.warn("Supabase menu_items async update failed:", err);
    }
  }

  return true;
}

/**
 * Synchronize menu items from Supabase database (if available)
 */
export async function syncMenuFromSupabase(): Promise<MenuItem[]> {
  const supabase = getPublicClient();
  if (!supabase) return getStoredMenu();

  try {
    const { data, error } = await supabase.from("menu_items").select("*");
    if (error || !data || data.length === 0) return getStoredMenu();

    const currentMenu = getStoredMenu();
    const dbMapByName = new Map(data.map((r) => [r.name.toLowerCase(), r]));
    const dbMapById = new Map(data.map((r) => [r.id, r]));

    const merged = currentMenu.map((item) => {
      const dbRow = dbMapByName.get(item.name.toLowerCase()) || dbMapById.get(item.id);
      if (dbRow) {
        return {
          ...item,
          price: typeof dbRow.price === "number" ? dbRow.price : Number(dbRow.price) || item.price,
          isAvailable:
            dbRow.is_available !== undefined && dbRow.is_available !== null
              ? Boolean(dbRow.is_available)
              : item.isAvailable,
        };
      }
      return item;
    });

    saveStoredMenu(merged);
    return merged;
  } catch (err) {
    console.warn("Could not sync menu from Supabase:", err);
    return getStoredMenu();
  }
}

/**
 * Check if the Cocktails category is currently hidden by Admin
 * (Alcohol license requirement)
 */
export function isCocktailsCategoryHidden(): boolean {
  try {
    const storage = getStorage();
    return storage.getItem(STORAGE_HIDE_COCKTAILS_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Toggle hiding or showing the entire Cocktails category
 */
export function setCocktailsCategoryHidden(hidden: boolean): void {
  try {
    const storage = getStorage();
    storage.setItem(STORAGE_HIDE_COCKTAILS_KEY, hidden ? "true" : "false");
    notifyMenuUpdated();
  } catch (err) {
    console.error("Failed to toggle cocktails category visibility:", err);
  }
}

/**
 * Broadcast update event across BroadcastChannel and window CustomEvent
 */
export function notifyMenuUpdated(): void {
  if (menuChannel) {
    try {
      menuChannel.postMessage({ type: "MENU_UPDATED", timestamp: Date.now() });
    } catch {
      // Ignore
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("cafeq_menu_changed", { detail: { timestamp: Date.now() } })
    );
  }
}

/**
 * Subscribe to real-time menu updates (stock changes, price changes, cocktail visibility toggle)
 */
export function subscribeToMenuUpdates(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleChannelMsg = () => callback();
  const handleCustomEvent = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_MENU_ITEMS_KEY ||
      e.key === STORAGE_HIDE_COCKTAILS_KEY ||
      e.key === STORAGE_OUT_OF_STOCK_KEY
    ) {
      callback();
    }
  };

  if (menuChannel) {
    menuChannel.addEventListener("message", handleChannelMsg);
  }
  window.addEventListener("cafeq_menu_changed", handleCustomEvent);
  window.addEventListener("storage", handleStorage);

  return () => {
    if (menuChannel) {
      menuChannel.removeEventListener("message", handleChannelMsg);
    }
    window.removeEventListener("cafeq_menu_changed", handleCustomEvent);
    window.removeEventListener("storage", handleStorage);
  };
}
