# rules extra

- layers domain < app
  - domain
  - app.buy
- layers app.buy < domain
- layers domain < domain
- deny app domain.order.create
- deny app
- module [not an id](./x.md)
- module [a.b](x
