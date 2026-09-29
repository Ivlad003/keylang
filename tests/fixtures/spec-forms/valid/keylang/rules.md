# rules

- layers domain < app
  - infra
- deny [app](app.md) [domain](domain.md)
- allow app infra
- entry
  - app
- no-cycles
- module domain.order
  - no-cycles
  - exports create, place
