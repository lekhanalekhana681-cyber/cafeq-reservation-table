/**
 * CafeQ Menu Management Service
 * Handles live menu state, price edits from admin panel,
 * cocktail licensing visibility toggles, and real-time cross-tab synchronization.
 */

import { menu as initialMenu, type MenuItem } from "@/data/menu";

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

/**
 * Get current menu items, merging seed menu with any admin price/stock edits
 */
export function getStoredMenu(): MenuItem[] {
  if (typeof window === "undefined") return initialMenu;

  try {
    const raw = localStorage.getItem(STORAGE_MENU_ITEMS_KEY);
    if (!raw) {
      // First time initialize with seed data
      localStorage.setItem(STORAGE_MENU_ITEMS_KEY, JSON.stringify(initialMenu));
      return initialMenu;
    }

    const savedItems: MenuItem[] = JSON.parse(raw);
    const savedMap = new Map<string, MenuItem>(savedItems.map((i) => [i.id, i]));

    // Idempotently merge: ensure all items from initialMenu exist and have user overrides
    const merged = initialMenu.map((baseItem) => {
      const saved = savedMap.get(baseItem.id);
      if (saved) {
        return {
          ...baseItem,
          price: typeof saved.price === "number" ? saved.price : baseItem.price,
          isAvailable: saved.isAvailable !== undefined ? saved.isAvailable : baseItem.isAvailable,
          tag: saved.tag !== undefined ? saved.tag : baseItem.tag,
        };
      }
      return baseItem;
    });

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
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_MENU_ITEMS_KEY, JSON.stringify(items));
    notifyMenuUpdated();
  } catch (err) {
    console.error("Failed to save menu items:", err);
  }
}

/**
 * Update the price of a specific menu item (Used by Admin Menu Manager)
 */
export function updateMenuItemPrice(id: string, newPrice: number): boolean {
  if (typeof window === "undefined" || newPrice < 0) return false;
  try {
    const items = getStoredMenu();
    const targetIdx = items.findIndex((i) => i.id === id);
    if (targetIdx === -1) return false;

    items[targetIdx] = {
      ...items[targetIdx],
      price: Math.round(newPrice),
    };

    saveStoredMenu(items);
    return true;
  } catch (err) {
    console.error("Failed to update item price:", err);
    return false;
  }
}

/**
 * Update any attributes of a menu item
 */
export function updateMenuItem(id: string, updates: Partial<MenuItem>): boolean {
  if (typeof window === "undefined") return false;
  try {
    const items = getStoredMenu();
    const targetIdx = items.findIndex((i) => i.id === id);
    if (targetIdx === -1) return false;

    items[targetIdx] = {
      ...items[targetIdx],
      ...updates,
    };

    saveStoredMenu(items);
    return true;
  } catch (err) {
    console.error("Failed to update menu item:", err);
    return false;
  }
}

/**
 * Check if the Cocktails category is currently hidden by Admin
 * (Alcohol license requirement)
 */
export function isCocktailsCategoryHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_HIDE_COCKTAILS_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Toggle hiding or showing the entire Cocktails category
 */
export function setCocktailsCategoryHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_HIDE_COCKTAILS_KEY, hidden ? "true" : "false");
    notifyMenuUpdated();
  } catch (err) {
    console.error("Failed to toggle cocktails category visibility:", err);
  }
}

/**
 * Broadcast update event
 */
function notifyMenuUpdated(): void {
  if (menuChannel) {
    menuChannel.postMessage({ type: "MENU_UPDATED", timestamp: Date.now() });
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cafeq_menu_changed", { detail: { timestamp: Date.now() } }));
  }
}

/**
 * Subscribe to real-time menu updates (price changes, cocktail visibility toggle)
 */
export function subscribeToMenuUpdates(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleChannelMsg = () => callback();
  const handleCustomEvent = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_MENU_ITEMS_KEY || e.key === STORAGE_HIDE_COCKTAILS_KEY) {
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
