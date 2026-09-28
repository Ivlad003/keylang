// Orders and their totals. Nothing here does I/O.
// A third sentence the brief leaves out.

import type { Money } from "./money.ts";

/** An order as the shop keeps it, e.g. after checkout. See {@link total}. */
export interface Order {
  id: string;
  total: Money;
}

/**
 * Sums item prices. The sum calls `items.reduce()` once. Rounding is left to the caller.
 *
 * A second paragraph is never part of the brief.
 * @param items prices in cents
 */
export function total(items: number[]): Money {
  return items.reduce((a, b) => a + b, 0);
}

// A note, not documentation.
export function createOrder(id: string, items: number[]): Order {
  return { id, total: total(items) };
}

/** Keeps orders in memory. */
export class Ledger {
  private orders: Order[] = [];

  /** Adds an order to the ledger! Returns nothing. */
  add(order: Order): void {
    this.orders.push(order);
  }

  size(): number {
    return this.orders.length;
  }
}
