# flow checkout

Покупка з термінала: від кнопки до збереженого замовлення.

- kind business
- trigger presentation.terminal.checkout
- step application.purchase.buy
  - reads infrastructure.products.find
  - step domain.orderAggregate.create
  - step infrastructure.orderStore.save
  - emits event order.created
- invariant total = сума(price × qty) по позиціях
  - test tests/purchase.test.ts "computes total"
- when товару немає на складі
  - then application.purchase.OutOfStock
  - test tests/purchase.test.ts "rejects out of stock"
