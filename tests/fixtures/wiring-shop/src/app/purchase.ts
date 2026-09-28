import type { Store } from "../domain/store.ts";

export function createPurchase({ store }: { store: Store }): { buy(): string } {
  return { buy: () => store.save() };
}
