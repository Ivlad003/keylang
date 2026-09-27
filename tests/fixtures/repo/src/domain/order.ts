export interface Order {
  id: string;
  total: number;
}

export function total(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}

export function createOrder(id: string, items: number[]): Order {
  return { id, total: total(items) };
}
