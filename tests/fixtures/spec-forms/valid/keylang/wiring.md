# wiring

- wire app.buy.buy
  - order domain.order.create
    - when env.MODE = fast → domain.order.place
    - compose domain.order.place
  - store infra.db.save
