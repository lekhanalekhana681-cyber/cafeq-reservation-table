/**
 * Out-of-Stock Management for CafeQ
 * Allows kitchen staff to mark dishes or beverages as out-of-stock,
 * which hides or disables them in real time across the menu and booking pre-order picker.
 */

import { emitKitchenEvent } from "./kitchen.sync";
import type { MenuItem } from "@/data/menu";

const STORAGE_OUT_OF_STOCK_KEY = "cafeq_out_of_stock_items";

export function getOutOfStockItemIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_OUT_OF_STOCK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isItemOutOfStock(itemId: string): boolean {
  const list = getOutOfStockItemIds();
  return list.includes(itemId);
}

export function setItemStock(itemId: string, outOfStock: boolean): boolean {
  if (typeof window === "undefined") return false;
  try {
    const current = new Set(getOutOfStockItemIds());
    if (outOfStock) {
      current.add(itemId);
    } else {
      current.delete(itemId);
    }
    const updated = Array.from(current);
    localStorage.setItem(STORAGE_OUT_OF_STOCK_KEY, JSON.stringify(updated));

    // Emit event so customer menu, reserve page, and kitchen screens update instantly
    emitKitchenEvent("STOCK_CHANGED", { itemId, outOfStock, allOutOfStock: updated });
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
  return menuItems.filter((item) => !outOfStockIds.has(item.id));
}
