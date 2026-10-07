# 01: ADR: факти фреймворків — прив'язки, перехоплення, події й точки входу

**Status:** ready-for-agent

**Type:** docs

**Blocked by:** None (can start immediately)

**Verify:** `test -f docs/adr/0022-framework-facts.md` · `npm test`

**Джерело:** [spec](../spec.md); [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md)

## What to build

Рішення автора, від якого залежать 03–15 і 30–31. На Magento без конфігурації фреймворку видно ≈ 1 виклик з 5, а точок входу keylang не знає (spec §2).

Що вирішити й записати в `docs/adr/0022-framework-facts.md`:

1. **Джерело фактів.** Конфігурація, яку фреймворк виконує (`di.xml`, `events.xml`, `routes.xml`, `webapi.xml`, `crontab.xml`, `queue_*.xml`, `services.yaml`, декоратори NestJS), — факт знімка нарівні з кодом. Чи входить вона в manifest джерел і `snapshotId` (пропозиція: так, інакше вердикт застаріє непомітно).
2. **Модуль адаптера.** Інтерфейс `FrameworkAdapter` поруч із `Frontend` (`src/frontends.ts`): `detect(root)`, `files` (глоби конфігів), `facts(files) → { bindings, intercepts, events, entries, holes }`. Адаптер вмикається автоматично за виявленням (Magento: `app/etc/di.xml` або `registration.php` з `ComponentRegistrar::MODULE`) чи явно `frameworks: ["magento"]` у `keylang.json`.
3. **Нові види ребер і їхнє місце в контрактах.** Варіанти: (а) нові `EdgeKind` (`bind`, `intercept`, `dispatch`, `subscribe`); (б) лишити `call`, але з полем `via` (`preference`, `plugin:around`, `observer`, `closure-arg`). Пропозиція: (б) для викликів, які фреймворк справді робить (правила й флоу бачать їх як виклики), і окремий список `entries` у знімку. Вплив на `deny` (чи порушує правило залежність, яку створює `di.xml` модуля A на клас модуля B — пропозиція: так, ребро належить модулю, чий конфіг його оголосив).
4. **Режими static.** Чи ходить `--static=shape` через `via`-ребра (пропозиція: ні, як для хуків; `behavior` — так) і як вердикт називає ребро («through the preference `X` in `etc/di.xml:12`»).
5. **Невизначеність.** Неоднозначна прив'язка (кілька preference за областями `frontend`/`adminhtml`/`global`) — усі ребра з областю чи дірка; virtualType; аргументи, задані рядком.
6. **Версія формату** (ADR 0007): нові поля `keylang.json` (`frameworks`) — розширення без нової редакції.

Відкриті питання до автора — список у кінці ADR зі своїми рекомендаціями.

## Критерії готовності

- [ ] ADR 0022 записано з рішенням по кожному з 6 пунктів і прикладом на `QuoteManagement::submitQuote`
- [ ] `docs/snapshot.md` і `docs/semantics.md` отримали розділ «Дорожня карта» з посиланням на ADR
- [ ] `CONTEXT.md`: терміни **Framework adapter**, **Binding**, **Entry point** (з _Avoid_)

**Межі:** лише рішення й документація; коду немає.

## Comments

### Рішення автора (2026-10-07)

- **Конфіги фреймворку — факти знімка** нарівні з кодом: входять у manifest джерел і `snapshotId`.
- **Ребра — `call` з полем `via`** (`preference`, `plugin:before|around|after`, `observer`, `dispatch`, `closure-arg`, …) і позицією в конфігу; нових `EdgeKind` не вводити.
- **`deny` бачить DI-ребра:** ребро належить модулю, чий конфіг його оголосив.
- **Вмикання адаптера:** автовиявлення (Magento — `registration.php` / `app/etc/di.xml`); `frameworks: []` у `keylang.json` вимикає, `frameworks: ["magento"]` вмикає явно.
- **Мови:** механізм адаптерів і `via`-ребер мовно-незалежний — працює для всіх мов, які keylang читає (TS/JS, Python, Rust, PHP) і в поліглотному репо одночасно; Magento — перший адаптер, не особливий випадок.
- Пріоритет: Magento-гілка (01 → 04 → 06–10) іде першою.
