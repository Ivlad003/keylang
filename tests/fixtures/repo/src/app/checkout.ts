import { createOrder, type Order } from "../domain/order.ts";
import * as db from "../infra/db.ts";

export function checkout(id: string, items: number[]): Order {
  const order = createOrder(id, items);
  db.save(order);
  return order;
}
