# 27: Додати git-зміни та LLM/hybrid до code-to-spec

**What to build:** користувач пропонує потоки з git-змін або з файла із вибраним способом генерації.
**Blocked by:** [16 — git adapter](16-changed-check.md), [23 — LLM](23-model-flow-and-cancellation.md), [26 — file code-to-spec](26-code-to-spec-file.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A12, A22–A24.

## З чого почати

Знайти `changedFlows`, `gitChanges`, `diffHunks`, since-гілку `cmdCodeToSpec`, `draftFlowWithModel`. Не плутати filterChanged findings із пошуком змінених functions.

## Кроки

1. Запит має взаємовиключні source-варіанти file/line або since; форма перемикає їх явно, приховане старе поле не відправляється.
2. Git-збір використовує явний root і чинну інтерпретацію diff; вже згадані у flows функції лишаються в notes, не дублюються.
3. Додати mode algo/llm/hybrid. Модельні потоки узгоджуються існуючим draft-модулем; unknown/dropped/conflict notes показуються.
4. Hybrid без агента має видимий algo-fallback. Для кількох flow перевіряти abort перед наступним модельним запитом.
5. Порожній diff/відсутність нових придатних fn — успішний no-op без proposal, stats чи цільових файлів.
6. Один зведений candidate зберегти тільки після freshness/target/proposal checks; часткова LLM-відповідь не видається за повний результат.

## Перевірки

- Git repo з changed fn, already-described fn і untracked за чинним CLI-контрактом: той самий набір draft/notes.
- Порожні зміни → zero-write no-op; поганий ref/немає git → код 2.
- Model mock для двох потоків, Cancel між ними → немає неповної proposal.
- Форма не допускає одночасно file і since; CLI-моделі та defaults збережені.

## Приймання

- [x] Усі code-to-spec режими доступні без окремої команди.
- [x] Зміна source під час генерації не застосовується як актуальний candidate.
- [x] Результат лишається пропозицією, а не підтвердженою специфікацією.

**Межі:** не запускати git checkout/commit і не змінювати diff-семантику CLI.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Code-to-spec з git-змін і з моделлю — та сама операція `code-to-spec` з 26; CLI `--since`, `llm`, `hybrid` з моделлю й невідомий `--mode` — принтер над нею (стару гілку без `basis` прибрано); у TUI — рядки `source`, `since`, `mode` форми.

- **`src/operations.ts`** — `CodeToSpecRequest` тепер тип-перетин з `CodeToSpecSource = { file, line? } | { since }` (взаємовиключні; обидва/жодного — 2 з повідомленнями CLI), `mode?` (типово algo), `context?`. `CodeToSpecCandidate` + `since`, `file: string | null`. `CodeToSpecPayload`: `mode`, `since`, `described`, `candidate: … | null` (null — лише no-op since), `model: CodeModelInfo | null` (`agent`, сумарні `counts`, `flows[{name, rounds, unknown, dropped}]`), `fallback`, `statsError`. `runCodeToSpec`: аналіз → джерело (`codeToSpec` або `gitChangedLines` + `changedFlows` + `describedIds` з ручних flow) → no-op 0 без запису → `modelSetup(…, "code-to-spec")` → базис цілі → для proposal перевірка цілі/пропозиції **до** моделі → `modelFlows` (по одному запиту на потік, abort перед кожним і під час відповіді → cancelled/null; помилка → 2, payload null) → preview 0 / `commitProposal` (свіжість цілі, пропозиції, keylang.json, джерел) → stats лише після запису. Примітки (described, fallback, unknown, dropped, stats) — `warning` у порядку CLI.
- **`src/cli.ts`** — `cmdCodeToSpec` лише розбирає джерело; `codeToSpecPrinter` для всіх джерел і режимів; невідомий mode — algo preview, і лише коли є кандидат — помилка mode (як раніше). Прибрано `countProposed`, імпорти draft/ir/stats.
- **`src/tui/state.ts`, `app.ts`** — `CodeDraftForm { source, file, line, since (HEAD), into, mode, output }`; рядок `source` (`←→`) показує лише рядки вибраного джерела, `codeDraftRequest` надсилає лише їх (набране в іншому зберігається); `since` порожній — відмова; `mode` типово hybrid за `agent`, llm без агента — відмова форми; контекст F4 для модельного режиму; типова ціль since `flows/changes.md`; `afterCodeDraft` дописує described/unknown/dropped у повідомлення; Enter у F6 для no-op не відкриває MERGE.
- **`src/tui/view.ts`, `actions.ts`** — мітки `code-to-spec <file[:line]|--since ref> --mode <m>`, F6: режим (з «hybrid without a model»), scope since, described, модель «one request per flow», «provenance, not evidence», no-op `no fn outside the flows changed since <ref>, nothing written`; назва дії «Code to spec: flows from code — a file, a line or the git changes (algo, hybrid, llm)» + aliases.
- **`docs/tools.md`** — оновлено абзац code-to-spec, новий «Code-to-spec з git-змін і з моделлю».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,operations,tui}.md`, `map-explained/README.md`; WIP `extract.md` байтово ті самі (sha1 файлів і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +3; `heldModel` приймає функцію відповіді, хелпери `changeCheckout`, `sinceForm`, `cliSince`, `flowReply`; оновлено очікування `codeDraft` у двох тестах 26):
1. Git repo (змінена `refund`, змінена вже описана `buy`, untracked `payment.ts`): форма since, порожній ref і llm без моделі — відмова; preview = CLI `--since HEAD --mode algo --print` байт у байт, stderr described той самий, file/line не надіслано, дерево незмінне; hybrid без моделі = CLI stdout/stderr fallback; proposal = CLI у двійнику, MERGE; після коміту — no-op 0, candidate null, дерево (без `.keylang`) незмінне = CLI; `HEAD~1` = CLI; `no-such-ref`, `--output=leak.txt` — 2 = CLI stderr, `leak.txt` немає; без git — 2 = CLI.
2. Hybrid з моделлю у worker: два запити по черзі, пропозиція лише після обох, `2 flow(s), 3 agree, 1 llm-only`, stats 3/1, F6; Cancel під час другої відповіді → cancelled/null, запит закрито, пізня відповідь нічого не змінює, дерево незмінне.
3. Операція в процесі: abort між потоками → другого запиту немає, cancelled/null; змінене джерело під час відповіді → failed 1 `src/domain/payment.ts: changed on disk while the draft was computed`, немає `.keylang`; llm без моделі → 2.

Перевірки: `npm run typecheck` ✓; `npm test` 549 tests, 548 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓; порівняння CLI зі збіркою HEAD (`git archive` + WIP `src/extract/ts.ts`) з локальним mock на 38 сценаріях (file/line/since × algo/hybrid/llm, з/без моделі й ключа, `--print`, `--into`, described-only, порожній diff, bad/dash ref, без git, unborn, обидва/жодного джерела, невідомий mode у 4 варіантах, HTTP 400, pending замінюється, stats-каталог, ціль-тека, підкаталог cwd) — stdout, stderr, код, дерево: 36 SAME; 2 навмисні різниці: `--into` поза `keylang/` з моделлю більше не робить запитів (як у 23), тож примітки моделі для цього запуску не друкуються; повідомлення про помилку й код ті самі.

Коміт: `8bc902a` (Draft flows from git changes and with a model through the code-to-spec operation); сторонній WIP не зачеплено.

Передано наступним задачам:
- 29/32/34: `modelFlows` — шаблон багатозапитової модельної операції (abort перед кожним запитом, без часткового payload, stats після запису).
- 37: рядок `source` форми — зразок явного перемикання взаємовиключних джерел.

Припущення й залишки:
- Ціль/пропозиція перевіряються до моделі — свідома різниця з CLI HEAD (див. вище).
- Свіжість git-стану окремо не перевіряється: commit перевіряє вміст джерел знімка, `keylang.json`, ціль і пропозицію (зміна індексу git без зміни файлів — не причина відмови).
- Сумарні `counts` моделі ініціалізовано всіма чотирма статусами нулями (stats ті самі, що й раніше).
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `8bc902a`; критерії приймання перевірено тестами з локальними mocks і порівнянням CLI з HEAD (36/38 SAME, 2 навмисні).
