# rules

- layers domain < application < presentation
  - infrastructure
- allow infrastructure presentation
  Сервер інжектить `presentation.api`, тому інфраструктурі дозволено бачити презентацію.
- deny domain infrastructure
  Домен чистий: жодного I/O.
- entry
  - infrastructure.logger
  - infrastructure.server
  - presentation.terminal
- module application.purchase
  - exports buy, cancel
  - no-cycles
