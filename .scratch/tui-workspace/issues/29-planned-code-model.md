# 29: Генерувати модельний код і тести для planned fn

**What to build:** той самий spec-to-code екран підтримує llm-mode, скасування й перевірку отриманого кандидата.
**Blocked by:** [23 — caller abort для LLM](23-model-flow-and-cancellation.md), [28 — template candidate](28-planned-code-template.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A13, A22–A24.

## З чого почати

Знайти модельний варіант `specToCode`, розбір model-output і candidate validation. Підтримувані режими тут algo/llm, не додавати hybrid без окремого контракту.

## Кроки

1. Розширити форму та request mode=llm; агент береться з конфіга, відсутність доступу показується до запиту.
2. Прокинути signal і frozen input identity до model call; TUI-прогрес використовує той самий operation ID.
3. Використати наявний parse/validate candidate path: помилкова відповідь не стає порожнім успішним файлом.
4. Показати model/provenance, diff, diagnostics та tests; не приймати автоматично навіть синтаксично валідний код.
5. Перед proposal-write перевірити inputs і всі targets/proposals; unrelated navigation лише прибирає auto-open, не змінює ціль.
6. CLI llm і TUI використовують ту саму операцію; timeout і provider errors зберігають чинні повідомлення/коди.

## Перевірки

- Локальний mock повертає код і тест: ті самі candidates/diagnostics у CLI preview та TUI.
- Порожня/невалідна відповідь, timeout, Cancel: немає source/proposal-записів.
- Source/spec змінено під час відповіді: outdated, нові байти збережено.
- Перехід до іншого файла не вставляє candidate в нього й не викрадає фокус.

## Приймання

- [x] Algo продовжує працювати повністю офлайн.
- [x] Result приймається через той самий MERGE і список code/test цілей.
- [x] Модель не змінює семантику planned або featureStatus.

**Межі:** не запускати згенеровані тести чи зовнішній харнес.
**Validation:** `npm run typecheck`, `npm test`; тільки локальний mock провайдера.

## Result

Модельний код і тести для planned fn — та сама операція `spec-to-code` з 28 з `mode: "llm"`; CLI `spec-to-code <id> --mode llm [--into] [--print]` — той самий принтер над нею (стару llm-гілку для preview/proposal прибрано; `--apply` лишився старою гілкою для 30); у TUI — рядок `mode` тієї самої форми.

- **`src/spec-to-code.ts`** — `specToCode(…, model?, options: LlmCallOptions = {})`: signal іде в `complete` запиту коду й кожного тесту. Наявна перевірка відповіді збережена: без функції з назвою — `the model did not return a function named …; nothing written`, тест без оголошеної назви — помилка; порожня відповідь — помилка провайдера (`… answered without text`). Файл коду читається до першого запиту.
- **`src/operations.ts`** — `SpecToCodeRequest.mode?: "algo" | "llm"` (типово algo; інше значення — 2 з повідомленням CLI); `SpecToCodePayload.mode: algo|llm`, `model: SpecCodeModelInfo | null` (`agent`, `requests`). `runSpecToCode`: аналіз → знімок → `modelSetup(mode, agent, "spec-to-code")` (llm без моделі/ключа — 2 `spec-to-code --mode llm: …` до запиту) → для proposal з моделлю сховище і pending (refuse → 1) файла коду **до** запиту → клієнт-обгортка рахує запити й пише прогрес `asking <agent> (request n: the code|a test file)` → `specToCode` із signal (`LlmCancelled`/abort → cancelled, payload null; помилка/тайм-аут → 2 з повідомленням) → далі без змін шляхом 28 (перевірка всього набору, `beforeCommit`, свіжість цілей/пропозицій/`keylang.json`/джерел/специфікацій, атомарний запис по черзі). Stats не пишуться (як і в старій llm-гілці).
- **`src/cli.ts`** — `cmdSpecToCode`: усе, крім `--apply`, іде в `specToCodePrinter(…, mode)`.
- **`src/tui/state.ts`, `app.ts`** — `SpecCodeForm.mode` (типово algo, навіть з `agent`: шаблон офлайн); рядок `mode` (`←→`), примітки режиму, деталі форми; llm без `agent` — відмова форми на рядку mode; запит несе `mode: "llm"`; повідомлення після MERGE для llm — «the model's code is a candidate: review it, run its tests, then check»; `inputsChanged` робить outdated і spec-to-code preview (також ще запущений).
- **`src/tui/view.ts`, `actions.ts`** — мітки ` · llm · `, `--mode llm` в operationLabel; F6: `Spec to code · llm`, рядок `written by <agent> in N request(s): provenance, not evidence — review each hunk in MERGE; nothing is accepted for you and its tests are not run`, заголовок stdout з `--mode llm`; назва форми `spec to code · llm|template`; дія «Spec to code: a planned fn's stub and failing tests, or the model's code and tests (algo, llm)», alias `spec-to-code --mode llm`.
- **`docs/tools.md`** — рядок таблиці, абзац 28 (без «`--mode llm` старою гілкою»), новий абзац «Модельний код для planned fn (spec-to-code, llm)».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,features,operations,tui}.md`, `map-explained/README.md`; у чистій копії HEAD + мої файли — ті самі байти, крім рядка extract у README (WIP, як і в HEAD); WIP `extract.md` байтово ті самі (sha1 файлів і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +2; хелпери `refundReply`, `cliSpecAsync`, `answerAll`; `specForm` отримав `mode`; оновлено очікування форми в двох тестах 28):
1. Справжній worker, `heldModel`: рядок mode (типово algo, примітки), форма нічого не питає; preview llm — 3 запити (код, 2 тести), прогрес тієї самої операції називає модель, `model {agent, requests: 3}`, кандидат перевірено як код, дерево незмінне, `print` = CLI `--mode llm --print` байт у байт, stderr приміток той самий; F6 з provenance. Proposal: під час відповіді відкрито інший файл → 3 пропозиції = CLI у двійнику, фокус не забрано, MERGE не відкрито; нових файлів — лише пропозиції; ID-вердикти planned і звіт `feature` тієї фічі незмінні; через F6 → список → MERGE код зливається окремо, тести чекають.
2. Cancel під час другого запиту → cancelled/null, запит закрито, пізня відповідь нічого не змінює; редагування під час preview → outdated, правку збережено; операція: порожня відповідь, порожній блок, функція іншої назви → 2, нічого не записано; специфікацію змінено під час відповіді → 1 `…: changed on disk while the candidate was computed`, нові байти лишились; тайм-аут 200 мс → 2 `anthropic: no answer within 200 ms (KEYLANG_LLM_TIMEOUT_MS)`; pending код → 1 без запиту; без ключа → 2 `spec-to-code --mode llm: …` без запиту; без `agent` — відмова форми, algo preview працює без жодного запиту.

Перевірки: `npm run typecheck` ✓; `npm test` 553 tests, 552 pass / 0 fail / 1 skipped ✓ (попередній прогін — 1 fail «committed keylang map is stale», бо тести стартували до перегенерації карти; після неї тест і повний прогін зелені); `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; порівняння CLI зі збіркою HEAD (`git archive` + WIP `src/extract/ts.ts`) з локальним mock на 26 сценаріях (llm proposal/`--print`, без ключа, без agent, чужа функція, порожня відповідь, тест без назви, HTTP 400, тайм-аут, поганий `KEYLANG_LLM_TIMEOUT_MS`, pending замінюється, implemented, typo, `--into` інший модуль/добрий/`keylang.gen.ts`, без тестів, доповнення наявного файла, Python-примітка, `--apply` (стара гілка), `--apply --print`, поганий mode, без id, algo proposal/`--print`, без джерел) — stdout, stderr, код, дерево й кількість запитів: 26/26 SAME.

Коміт: `df219cd` (Write a planned fn's code and tests with the model through the spec-to-code operation); сторонній WIP не зачеплено.

Передано наступним задачам:
- 30: `--apply` (і `--mode llm --apply`) — ще стара гілка `cmdSpecToCode` з `safeWriteAll`; операція вже дає `targets` з `before`/`after` і для llm.
- 35/37: рядок mode форми; спільний патерн «пре-перевірка цілі до моделі».

Припущення й залишки:
- Hybrid не додано (немає контракту), типовий режим форми — algo навіть з `agent`.
- Відсутність облікових даних форма не перевіряє (лише `agent`); операція відмовляє 2 до першого запиту, у F6 — повідомлення CLI.
- Пакет контексту F4 у промпт spec-to-code не йде (промпт як у CLI).
- До моделі перевіряються лише сховище й pending файла коду; пропозиції тестів, що чекають, — після кандидата (цілі тестів відомі після запиту коду), як у 28.
- Stats модельного коду не пишуться, як у старій CLI-гілці.
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `df219cd` (Write a planned fn's code and tests with the model through the spec-to-code operation); критерії приймання перевірено тестами з локальними mocks і порівнянням CLI з HEAD (26/26).
