# Опційний семантичний backend для TypeScript

**Status:** paused

**Джерело:** рішення автора 2026-10-06 — [ADR 0020](../../docs/adr/0020-typescript-semantic-backend.md); [рев'ю 2026-10-05](../../docs/review-2026-10-05.md), «DX для coding agents» п. 7 і «Що не зроблено і чому»; design §7 «Резолвінг», §9 (M10), §10 п. 7. Терміни — `CONTEXT.md`.

> **Не в релізі 0.6.0.** Фіча на паузі: runner shiftwork не бере тікетів фічі зі статусом `paused`. Після релізу автор відповідає на відкрите питання 1 ADR 0020 (через нього тікет 01 має статус `needs-info`), а тоді — `npx shiftwork feature resume ts-semantic-backend`.

## 1. Мета

Виклик через значення з виведеним типом (`const repo = openRepo(); repo.save()`) має давати ребро, а не дірку, коли в репозиторії встановлено `typescript`. Тоді крок потоку отримує `static ok` без анотації, якої аналізатор сьогодні вимагає. Без пакета все працює як зараз. Ребро такого виклику має походження `semantic`, видиме в усіх клієнтах. Знімок лишається детермінованим, а теплий `check` — швидким.

## 2. Що вже є (перевірено за кодом 2026-10-06, коміт `bcc4f2b`)

| Що | Де | Стан |
|---|---|---|
| походження ребра | `Provenance` у `src/snapshot.ts` | лише `"syntactic"`; snapshot.md §11: «`provenance: semantic` … лишаються дорожньою картою» |
| походження вердикту | `evidence.provenance` у `src/verdict.ts` | `syntactic`, `test-report`, `trace` |
| типізований отримувач | `receiverTarget` у `src/graph.ts` | анотація, `new X()`, тип поля. Виведений тип — дірка `dynamic-call` «call through a local value» (`holeReason`) |
| `snapshotId` | `buildSnapshot` у `src/snapshot.ts` | схема 7, `EXTRACTOR_VERSION`, граматики, конфігурація, файли, входи резолвера (`graph.resolverInputs`: `tsconfig` `paths`, `references`, оголошені пакети) |
| кеш фактів | `src/fact-cache.ts` | на файл: шлях, вміст, версії екстрактора й граматик |
| показ ребер | `--explain-edge` (`src/explain-edge.ts`) друкує `provenance`; MCP `node` (`src/mcp.ts`) — ребра без нього; карта (`src/emit.ts`) — рядки `- calls`; підсумок `keylang map` (`src/operations/generate.ts`); формати `check` (`src/check-format.ts`, `src/check-results.ts`) | — |
| `typescript` | `devDependencies` keylang (5.9.3, для `npm run typecheck`) | не runtime-залежність |
| адаптери | `src/adapters/node-test.ts` (`generateMap`), `src/adapters/trace-hooks.ts` | рахують `snapshotId` повним аналізом |

## 3. Прототип-вимір (2026-10-06)

Метод: разовий скрипт поза репозиторієм. Він бере `typescript` 5.9.3 з `node_modules` keylang, `tsconfig.json` keylang з `allowJs`, а коренями Program — 165 файлів знімка. Результат:

- Program будується за 1,5–1,7 с; `getResolvedSignature` для 7 393 дірок викликів займає 1,9–2,6 с. Теплий `check` зараз — ~1,0 с.
- Зіставлено 7 371 дірку. З них checker дав:
  - 256 оголошень fn і методів репозиторію з тілом — це ребра (верхня межа);
  - 1 060 замикань тієї самої fn;
  - 6 замикань іншої fn;
  - 5 507 методів і функцій поза репозиторієм;
  - 541 лише сигнатуру типу;
  - 1 — нічого.

Розбивку й наслідки наведено в ADR 0020, «Контекст». Повторити вимір на keylang і на `bench/` (якщо репозиторії клоновано й залежності встановлено) — частина тікета 04.

## 4. Контракт (ADR 0020 «Рішення», п. 1–8)

### 4.1 Завантаження й ідентичність (тікет 01)

- `typescript` береться розв'язанням Node від кореня аналізованого репозиторію (`createRequire`). Копія з установки keylang не береться ніколи.
- **Пакет недоступний** — його немає, `require` кидає помилку або немає `createProgram`. Тоді backend вимкнено: manifest записує `typescript: null`, `doctor` пише причину, а коди виходу не змінюються.
- **Manifest** отримує поле backend: версію `typescript` або `null` і хеш опцій компілятора. Поле входить у `snapshotId`, схема 7 → 8.
- **Опції компілятора** беруться з кореневого `tsconfig.json` або `jsconfig.json`, а без них — типові з `allowJs`. Зламаний `tsconfig` вимикає backend із причиною і не дає коду 2.
- `doctor` друкує рядок `typescript`: версію й шлях або причину.
- `keylang/rules.md` отримує `deny lang external.typescript`, `deny check external.typescript` і `deny base external.typescript`.

### 4.2 Резолвінг (тікет 02)

| `getResolvedSignature(call).declaration` | Результат |
|---|---|
| fn, метод, конструктор чи accessor з тілом у файлі знімка, що є вузлом | ребро `call`, `resolved`, `provenance: semantic` |
| замикання тієї самої fn (стрілка, `function`) | ні ребра, ні дірки; лічильник у `stats` |
| метод чи функція поза знімком | зовнішній виклик; але дірка, коли клас репозиторію реалізує чи розширює цей тип |
| лише сигнатура типу (тип функції, сигнатура виклику, параметр типу; член інтерфейсу репозиторію) | дірка; причина називає тип |
| нічого, або оголошення не зіставляється з вузлом | дірка, як зараз |

- Розв'язуються лише дірки (`dynamic-call`, `unresolved-call`) і ребра `ambiguous`; для `ambiguous` — коли оголошення є серед `candidates`. Розв'язані синтаксичні ребра не змінюються.
- **Корені Program** — файли TS/JS знімка. CompilerHost читає ті самі тексти, що й екстрактор: диск або overlay буфера в LSP і TUI.
- **Зіставлення оголошення з ID** — за файлом і позицією імені. Колонки TS (UTF-16) переводяться в кодові точки знімка.
- `EXTRACTOR_VERSION` зростає.

### 4.3 Показ походження (тікет 03)

- **`check`.** Людський вивід називає semantic-доказ у повідомленні кроку й `deny`. JSON, SARIF і GitHub-формат мають `provenance: "semantic"`.
- **`--explain-edge` і MCP.** `--explain-edge` уже друкує `provenance`. MCP `node` віддає `provenance` для кожного ребра.
- **Карта.** Рядки `- calls` формату не змінюють: semantic-ребро в них таке саме, як інші, бо карта — представлення (ADR 0014). Підсумок `keylang map` каже, скільки ребер `semantic`.
- **TUI і LSP.** Розгорнутий рядок жолоба й hover показують походження доказу.

### 4.4 Кеш і бюджет (тікет 04)

- **Окремий кеш результатів backend** у `.keylang/cache/`. Ключ: версія `typescript`, хеш опцій, хеші файлів знімка й входи поза manifest (відкрите питання 5 ADR 0020).
- **Запис** best-effort, як у кеша фактів (ADR 0016 п. 4). Режими `--check` кешу не пишуть. Зіпсований чи чужий кеш ігнорується.
- **Інкрементальний прохід** дає той самий результат, що й повний. LSP і TUI тримають Program між поколіннями (`oldProgram`).
- **Бюджет на keylang:**
  - теплий `check` без змін — ≤ +10 % (~1,1 с);
  - після зміни одного файла TS — ≤ 3 с;
  - холодний запуск вимірюється й записується.

  Виміри йдуть у `bench/results.md`.

### 4.5 Документація (тікет 05)

Кожен тікет 01–04 сам оновлює документацію свого контракту: snapshot.md §11, tools.md. Тікет 05 зводить решту:

- абзац **Семантичний backend** у snapshot.md §11, «Мови» → **TypeScript**: коли backend працює, що розв'язує, CI після встановлення залежностей;
- `llm.txt` для агентів;
- визначення Edge у `CONTEXT.md`;
- design §7, §9, §10;
- статус ADR 0020.

## 5. Тікети

| NN | Тікет | Status | Blocked by |
|---|---|---|---|
| [01](issues/01-load-typescript-and-snapshot-id.md) | Завантаження `typescript` з репозиторію; версія в manifest і `snapshotId` | needs-info (відкрите питання 1 ADR 0020) | — |
| [02](issues/02-semantic-call-edges.md) | Резолвінг отримувачів через checker: ребра `semantic` | ready-for-agent | 01 |
| [03](issues/03-show-semantic-provenance.md) | Походження `semantic` у `check`, explain, MCP, карті й TUI | ready-for-agent | 02 |
| [04](issues/04-semantic-cache-and-budget.md) | Кеш результатів backend і бюджет часу | ready-for-agent | 02 |
| [05](issues/05-docs-format-llm.md) | Документація: snapshot.md §11, llm.txt, CONTEXT.md, design | ready-for-agent | 03, 04 |

Ланцюг: 01 → 02 → (03, 04) → 05.

## 6. Перевірка

- **Тести** йдуть у тимчасовому TS-репозиторії, офлайн.
  - `node_modules/typescript` фікстури — посилання на devDependency keylang: `createRequire(import.meta.url).resolve("typescript/package.json")`.
  - Для версій і збоїв завантаження — пакет-заглушка `node_modules/typescript` (`package.json` з іншою `version` і `main`, що експортує `version` чи кидає помилку).
  - Приклад з ADR 0020 — основна фікстура.
- **Verify код-тікета** спершу запускає новий файл тестів тікета, а далі загальний набір: `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check --strict`.
- **keylang має `typescript` у власних `node_modules`**, тож після тікета 02 його власна карта й вердикти зміняться. Карту треба перегенерувати (`node bin/keylang.js map`) і переглянути diff. Нове порушення власних правил виправляють у коді чи правилах — це рішення тікета, записане в його Notes.
- **Бюджет часу** — вимір із записом у `bench/results.md`, а не гейт Verify: цифри залежать від машини.

## 7. Перед відновленням (`feature resume`)

1. Автор відповідає на відкрите питання 1 ADR 0020 (вимикач і вимога в `keylang.json` чи змінна середовища). Відповідь записує в ADR і в Notes тікета 01, а тоді ставить тікету 01 `ready-for-agent`.
2. Відкриті питання 2–8 v1 не блокують. Тікети беруть типові відповіді з ADR: одна Program з кореневим `tsconfig`, JS з `allowJs`, а союзи й члени інтерфейсів лишаються дірками.

## 8. Припущення

Ці рішення обрано без людини. Змінити будь-яке можна правкою спеки до відновлення.

- **П1.** Кеш фактів файлів зберігає ключ, а версія `typescript` іде в ключ окремого кешу backend-а. Синтаксичні факти від `typescript` не залежать, тож вимога автора «версія в ключі кешу» стосується кешу, що зберігає результати checker.
- **П2.** Карта не позначає semantic-ребра в рядку `- calls`. Походження видно в індексі, `check`, `--explain-edge`, MCP, TUI й підсумку `keylang map`.
- **П3.** Бюджет — ціль із виміром, не гейт.
