/**
 * Out-of-Stock Management for CafeQ
 * Allows admin and kitchen staff to mark dishes or beverages as out-of-stock,
 * which reflects in real time across the reservation page, menu, and KDS.
 */

import { emitKitchenEvent } from "./kitchen.sync";
import type { MenuItem } from "@/data/menu";

export const STORAGE_OUT_OF_STOCK_KEY = "cafeq_out_of_stock_items";
const STORAGE_MENU_ITEMS_KEY = "cafeq_menu_items";

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
 * Get unified list of all out-of-stock item IDs.
 * Consolidates both the out-of-stock set and items marked `isAvailable: false`
 * in the stored menu so that Admin and Kitchen toggles stay in 100% agreement.
 */
export function getOutOfStockItemIds(): string[] {
  try {
    const storage = getStorage();
    const rawStock = storage.getItem(STORAGE_OUT_OF_STOCK_KEY);
    const stockList: string[] = rawStock ? JSON.parse(rawStock) : [];
    const stockSet = new Set<string>(stockList);

    // Also inspect cafeq_menu_items to ensure any item toggled to isAvailable: false is included
    const rawMenu = storage.getItem(STORAGE_MENU_ITEMS_KEY);
    if (rawMenu) {
      const menuList = JSON.parse(rawMenu);
      if (Array.isArray(menuList)) {
        for (const it of menuList) {
          if (it && it.id && it.isAvailable === false) {
            stockSet.add(it.id);
          }
        }
      }
    }

    return Array.from(stockSet);
  } catch {
    return [];
  }
}

/**
 * Check if a specific menu item is out of stock by ID or MenuItem object
 */
export function isItemOutOfStock(itemOrId: string | MenuItem): boolean {
  if (typeof itemOrId === "object" && itemOrId !== null) {
    if (itemOrId.isAvailable === false) return true;
    return getOutOfStockItemIds().includes(itemOrId.id);
  }
  const list = getOutOfStockItemIds();
  return list.includes(itemOrId);
}

/**
 * Check if a specific menu item is in stock
 */
export function isItemInStock(item: MenuItem, outOfStockIds?: string[]): boolean {
  if (item.isAvailable === false) return false;
  const list = outOfStockIds || getOutOfStockItemIds();
  return !list.includes(item.id);
}

/**
 * Set stock status for a menu item.
 * Synchronizes both `cafeq_out_of_stock_items` and `item.isAvailable` in `cafeq_menu_items`.
 */
export function setItemStock(itemId: string, outOfStock: boolean): boolean {
  try {
    const storage = getStorage();
    // 1. Update cafeq_out_of_stock_items
    const rawStock = storage.getItem(STORAGE_OUT_OF_STOCK_KEY);
    const existingList: string[] = rawStock ? JSON.parse(rawStock) : [];
    const current = new Set(existingList);

    if (outOfStock) {
      current.add(itemId);
    } else {
      current.delete(itemId);
    }
    const updated = Array.from(current);
    storage.setItem(STORAGE_OUT_OF_STOCK_KEY, JSON.stringify(updated));

    // 2. Synchronize cafeq_menu_items so that item.isAvailable matches
    const menuRaw = storage.getItem(STORAGE_MENU_ITEMS_KEY);
    if (menuRaw) {
      try {
        const menuItems = JSON.parse(menuRaw);
        if (Array.isArray(menuItems)) {
          let modified = false;
          for (const m of menuItems) {
            if (m.id === itemId && m.isAvailable !== !outOfStock) {
              m.isAvailable = !outOfStock;
              modified = true;
            }
          }
          if (modified) {
            storage.setItem(STORAGE_MENU_ITEMS_KEY, JSON.stringify(menuItems));
          }
        }
      } catch (err) {
        console.warn("Could not sync cafeq_menu_items from setItemStock:", err);
      }
    }

    // 3. Emit kitchen event and cross-tab custom event
    emitKitchenEvent("STOCK_CHANGED", { itemId, outOfStock, allOutOfStock: updated });
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("cafeq_menu_changed", {
            detail: { timestamp: Date.now(), itemId, outOfStock },
          })
        );
      } catch {
        // Ignore
      }
    }

    return true;
  } catch (err) {
    console.error("Failed to update item stock:", err);
    return false;
  }
}

export function toggleItemStock(itemId: string): boolean {
  const currentlyOutOfStock = isItemOutOfStock(itemId);
  return setItemStock(itemId, !currentlyOutOfStock);
}

export function filterAvailableMenu(menuItems: MenuItem[]): MenuItem[] {
  const outOfStockIds = new Set(getOutOfStockItemIds());
  return menuItems.filter((item) => item.isAvailable !== false && !outOfStockIds.has(item.id));
}
