# map

Приклад зі слайдів Шемсединова, доповнений API модулів. Помилку слайда
`order domain.aggregate` збережено навмисно: `keylang check` має її знайти.
Карту написано вручну: коду, з якого `keylang map` її
згенерував би, тут немає.

- domain
  - module [orderAggregate](src/domain/order.ts#L1)
    - fn [create](src/domain/order.ts#L8) (items: Item[]) → Order
    - fn [total](src/domain/order.ts#L21) (order: Order) → Money
- infrastructure
  - module [config](src/infra/config.ts#L1)
  - module [logger](src/infra/logger.ts#L1)
    - options infrastructure.config.log
    - fn [log](src/infra/logger.ts#L14) (level, msg)
  - module [products](src/infra/products.ts#L1)
    - fn [find](src/infra/products.ts#L6) (id: ProductId) → Promise<Product>
  - module [orderStore](src/infra/order-store.ts#L1)
    - fn [save](src/infra/order-store.ts#L9) (order: Order) → Promise<void>
  - module [server](src/infra/server.ts#L1)
    - api presentation.api
    - console infrastructure.logger
    - options infrastructure.config.server
- application
  - module [purchase](src/app/purchase.ts#L1)
    - order domain.aggregate
    - catalog infrastructure.products
    - orders infrastructure.orderStore
    - fn [buy](src/app/purchase.ts#L12) (cart: Cart) → Promise<Order>
      - calls infrastructure.products.find, domain.orderAggregate.create, infrastructure.orderStore.save
    - fn [cancel](src/app/purchase.ts#L30) (id: OrderId) → Promise<void>
    - type [OutOfStock](src/app/purchase.ts#L44) extends Error
- presentation
  - module [terminal](src/ui/terminal.ts#L1)
    - checkout application.purchase
  - module [api](src/ui/api.ts#L1)
    - purchase application.purchase
