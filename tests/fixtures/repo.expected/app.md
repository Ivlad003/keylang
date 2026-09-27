<!-- keylang:generated — не редагувати, `keylang map` -->

# map

- app
  - module [checkout](src/app/checkout.ts#L1)
    - order domain.order
    - db infra.db
    - fn [checkout](src/app/checkout.ts#L4) (id: string, items: number[]) → Order
      - calls domain.order.createOrder, infra.db.save
