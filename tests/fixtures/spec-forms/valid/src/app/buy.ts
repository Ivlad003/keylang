import { create } from "../domain/order.ts";
import { save } from "../infra/db.ts";

export function buy(): void {
  create();
  save();
}
