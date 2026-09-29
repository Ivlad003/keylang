# flow buy

- planned fn app.buy.refund () → void
- trigger app.buy.buy
  - step domain.order.create
  - step infra.db.save
  - when stock is low
    - then domain.order.place
    - then the receipt is stored
  - invariant the total is the sum of the lines
    - test tests/buy.test.ts "sums the lines"
  - step app.buy.refund
