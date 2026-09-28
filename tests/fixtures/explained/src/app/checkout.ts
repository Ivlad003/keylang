// SPDX-License-Identifier: MIT

/** Checkout: turns a cart into an order. */

import { createOrder, Ledger, type Order } from "../domain/order.ts";

export function checkout(id: string, items: number[]): Order {
  const order = createOrder(id, items);
  new Ledger().add(order);
  return order;
}
