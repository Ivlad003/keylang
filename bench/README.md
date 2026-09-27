# Бенчмарк conformance

Репозиторії, на яких перевіряється `keylang map` / `keylang check` (обрано 2026-09-27). Клонуються в `bench/repos/` (не в git): `bench/clone.sh`.

| Репозиторій | Мова | Роль у бенчмарку |
|---|---|---|
| [keylang](../) | TypeScript | самоопис з M1: карта `src/`, правила, потоки |
| [Ivlad003/kosmo-tui](https://github.com/Ivlad003/kosmo-tui) | TypeScript | TUI-застосунок; переглядач трейсів kosmo-trace — джерело ідей для `trace` (M3/M5) |
| [SalesforceCommerceCloud/storefront-next-template](https://github.com/SalesforceCommerceCloud/storefront-next-template) | TypeScript | великий продуктовий репо (~760 МБ з ресурсами): стрес-тест індексації, шари Next.js |
| [tshemsedinov/reslop](https://github.com/tshemsedinov/reslop) | JavaScript | інструмент рев'ю AI-коду; стиль Metarhia — той самий, що на слайдах |
| [tshemsedinov/circlecam](https://github.com/tshemsedinov/circlecam) | JavaScript | Node/Electron, маленький: перший JS-репо для `extract` |
| [tshemsedinov/meet-unmirror](https://github.com/tshemsedinov/meet-unmirror) | JavaScript | Chrome-розширення, крихітний: нуль-конфіг `keylang init` має дати корисну карту |
| [HowProgrammingWorks/Index](https://github.com/HowProgrammingWorks/Index) | — (Markdown) | без коду: перевірка, що `keylang` коректно каже «мов не знайдено», а не падає |
| [Ivlad003/health-tracker](https://github.com/Ivlad003/health-tracker) | Python | ціль для Python-запитів (M4) |
| [Ivlad003/voice-transcriber](https://github.com/Ivlad003/voice-transcriber) | Rust | приватний, локально `~/pet_project/voice-transcriber`; ціль для Rust-запитів (M4) |

Критерій M1: для TS/JS-репозиторіїв карта генерується без правок конфігу, штучно доданий заборонений імпорт ловиться, `unverified` не змішується з `ok`. Результати — у `bench/results.md` після кожного етапу.
