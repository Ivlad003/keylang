<!-- keylang:generated — не редагувати, `keylang map` -->

# map

- domain
  - module [order](../../src/domain/order.ts#L1)
    - type [Order](../../src/domain/order.ts#L1)
    - fn [total](../../src/domain/order.ts#L6) (items: number[]) → number
    - fn [createOrder](../../src/domain/order.ts#L10) (id: string, items: number[]) → Order
      - calls domain.order.total
