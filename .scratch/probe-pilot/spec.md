# Знахідки AI-пілоту usability-проби

**Джерело:** [AI-пілот 2026-10-04](../../docs/usability-probe-results-2026-10-04-ai-pilot.md) (чотири headless-сесії Claude Code на NestJS і FastAPI RealWorld), протокол [usability-probe](../../docs/usability-probe.md), тікет design-v0.2/28. Пілот — сигнал від AI, а не від людей: тікети нижче фіксують лише те, що відтворено на master `c408f53` справжнім CLI. Рішення про семантику чекають на людину (`needs-triage`) і, де сказано, на пробу з людьми.

## Спільне відтворення

Копія `tests/fixtures/repo` у тимчасовій теці, у ній файл `keylang/flows/pilot.md`:

```markdown
# flow pilot

- trigger app.checkout.checkout
- step domain.order.createOrder
  - calls infra.db.save
  - test tests/nope.test.ts "creates order"
   - step domain.order.total
- invariant total is the sum of items
  - test tests/missing.test.ts "sums"
- when items are empty
  - then Rejected
```

З кореня копії: `node <keylang>/bin/keylang.js check keylang/flows/pilot.md --strict` →

```
keylang/flows/pilot.md:7:4: K003 indentation must be a multiple of 2 spaces, found 3
keylang/flows/pilot.md:3:1: ID ok app.checkout.checkout: exact
keylang/flows/pilot.md:4:1: ID ok domain.order.createOrder: exact
keylang/flows/pilot.md:4:1: static ok domain.order.createOrder: called from app.checkout.checkout
keylang/flows/pilot.md:7:4: ID ok domain.order.total: exact
keylang/flows/pilot.md:7:4: static ok domain.order.total: called from domain.order.createOrder
1 fail, 0 unverified, 5 ok
```

Рядки 5, 6, 8, 9, 10 і 11 не дають жодного результату; рядок 7 дає K003 і водночас два `ok`.

## Тікети

| # | Тікет | Статус |
|---|---|---|
| 01 | [`test` і `invariant` без `check.tests` мовчать, навіть коли файла тесту немає](issues/01-silent-test-lines.md) | needs-triage |
| 02 | [`calls` / `reads` під кроком потоку не перевіряються](issues/02-flow-calls-unchecked.md) | needs-triage |
| 03 | [`then` одним словом без кандидата мовчить; доповнення після `then` пропонує ID](issues/03-then-bare-word-no-candidate.md) | needs-triage |
| 04 | [Рядок із K003 отримує `ok`](issues/04-k003-line-gets-ok.md) | needs-triage |
| 05 | [K005 на `step planned <id>` не підказує окремий рядок `planned`](issues/05-k005-step-planned-hint.md) | ready-for-agent |
| 06 | [`explain K005` відсилає до `format.md`, якого немає в пакеті](issues/06-explain-without-format-md.md) | ready-for-agent |
| 07 | [K001 у згенерованому baseline не каже «перегенеруй»](issues/07-k001-generated-file-hint.md) | ready-for-agent |
| 08 | [Hover на ключових словах і рядках без ID](issues/08-hover-keyword-role.md) | ready-for-agent |
| 09 | [`new module` пише `# flow <name>` у `features/`](issues/09-new-module-flow-heading.md) | needs-triage |
| 10 | [`init` на Python-пакеті вгадує один шар](issues/10-init-python-package-layers.md) | resolved |
| 11 | [Два неточні повідомлення розкладки: `new module` без `keylang.json`, колізія module ID](issues/11-layout-messages.md) | ready-for-agent |
| 12 | [Підсумок `check` не відділяє baseline від ручних специфікацій](issues/12-check-summary-by-origin.md) | needs-triage |

Порядок: 05, 06, 07, 11 — лише тексти повідомлень, їх можна злити до проби з людьми. 01–04 і 09 змінюють вердикти чи шаблон і чекають рішення; 03 — це Р-9, яке протокол відкладає до проби з людьми.

## Не відтворено або без тікета

- **`fmt --check` вважає файл неформатованим після правок** (сесія 2). Відтворення немає: сесії 3 і 4 бачили протилежне, а транскрипту з точним текстом у репозиторії немає. `fmt` нормалізує запис, тож це, найімовірніше, очікувана поведінка; повторити на людях.
- **Обмін двох кроків місцями `check` не помічає** (сесії 1–4). Окремо не відтворював: за специфікацією так і має бути — static-доказ — шлях без порядку (format.md «Flows: докази кроку»), порядок доводить лише trace. Окремого тікета немає; дані — у Р-14 і pl-theory/44–47.
- **`init` у порожній теці відмовляє** (`no supported source files found`, код 2). Відтворено; це задокументовано в протоколі як очікувана поведінка, а не дефект. Повідомлення `new module` у такій теці — тікет 11.
- **Назви шарів TS-`init`** (`app: ["*"]`, `main: ["src/*"]`, «одна тека на фічу»). Відтворено (`main: ["src/*"]` на тимчасовому TS-репо), але це документована евристика (`src/config.ts`, `guessLayout`), а не дефект. Без даних від людей тікета немає.
- **Застарілий `planned` після перейменування мовчки лишається `unverified`** (сесії 1, 2). Так задумано: нереалізований `planned` дає `unverified`, а `feature` — прогалину. Тікет 12 частково зменшує шум.
- **Протокол проби** (виправлення 1–6 з пілоту) — внесено в `docs/usability-probe.md` у цій самій зміні, без тікетів. Пункти 7 (підказувати `new module`) і 8 (посередник LSP для AI-повтору) залишено ведучому й тікету design-v0.2/28.

## Побічна знахідка (не з пілоту)

`node bin/keylang.js check <копія>` з кореня keylang читає `keylang.json` самого keylang, а не копії: копія `tests/fixtures/repo` з кореня дає `6 fail, 1 unverified, 0 ok`, а з кореня самої копії — `0 fail, 0 unverified, 4 ok`; копія `spec-forms/valid` — `23 fail, 1 unverified, 0 ok` проти `4 fail, 2 unverified, 10 ok`. Шлях у `check` — це шлях до специфікацій, а корінь — поточна тека (`--help`: «default: ./keylang»), тож це, ймовірно, задумано. Протокол тепер пояснює це й запускає `check` для теки з власним `keylang.json` з її кореня. Тікета немає; якщо людина вважає це пасткою, кандидат — попередження, коли шлях лежить під іншим `keylang.json`.

## Несумісні зміни

- **10:** у Python-репо **без** `keylang.json`, де весь код — один пакет у корені, вгадана розкладка змінює ID (`app.api.routes.get_user` → `api.routes.get_user`). Репо з `keylang.json` не зачеплені. Реалізовано; описано в `docs/format.md` («Вгадані шари») і `docs/tools.md` (`init`).
- 05–08, 11 змінюють лише тексти повідомлень і hover.
- Варіанти в 01–04, 09 і 12 можуть додати вердикти чи попередження в stdout `check` і JSON або змінити граматику; вибраний варіант має дописати себе сюди.
