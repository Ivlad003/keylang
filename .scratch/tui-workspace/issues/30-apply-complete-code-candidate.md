# 30: Явно застосовувати весь code/test-кандидат

**What to build:** після перегляду diff користувач може застосувати всі цілі spec-to-code одним явним рішенням, як CLI --apply.
**Blocked by:** [09 — commit-протокол](09-map-write-and-commit-protocol.md), [28 — типізований candidate](28-planned-code-template.md).
**Status:** resolved
**Parent:** [Специфікація](../spec.md), A13, A22, A25.

## З чого почати

Знайти apply-гілку `cmdSpecToCode`, `safeWriteAll`, candidate.before, code-path policy. Режим генерації не впливає на застосування; model-candidate має ту саму форму після 29.

## Кроки

1. На завершеному candidate-result додати Apply entire candidate; до дії видимі всі цілі та їхній diff.
2. Apply — окремий явний commit-запит із ідентичністю кандидата; натискання Enter у палітрі або завершення генерації його не запускає.
3. Перевірити свіжість input identity, before кожного target, code-path boundaries і конфлікти dirty/MERGE для всіх цілей до першого запису.
4. Застосувати через спільний commit-шлях; на I/O-помилці повернути точні completed/failed/not-attempted. Не додавати all-or-nothing обіцянки.
5. Не видаляти сторонні proposals для цих файлів. Якщо candidate раніше вже збережено як proposal, заборонити shortcut apply із конфліктною pending-ціллю й запропонувати MERGE, замість неявного очищення.
6. Після success/partial повторити аналіз. `u` лишається undo останнього MERGE, не загальним undo цього запису.

## Перевірки

- Preview → явний Apply: тексти як CLI --apply, без окремої proposal, нові каталоги створено.
- Один target змінився після preview: жоден target не застосовано при preflight-conflict.
- Збій другого write: перший записаний і listed, другий failed, решта не claimed completed.
- Повтор Apply старого кандидата, active MERGE, dirty target або pending proposal: зрозуміла відмова без втрати даних.

## Приймання

- [x] Повне застосування не є типовим output-mode генерації.
- [x] Новіший код не затирається очікуванням зі старого candidate.
- [x] Алгоритмічні й модельні candidates проходять один interface.

**Межі:** без запуску тестів і без автоматичного статусу feature done.
**Validation:** `npm run typecheck`, `npm test`.

## Result

Повне застосування кандидата spec-to-code — нова спільна операція `apply-code`, що отримує вже побудований кандидат; CLI `spec-to-code <id> [--into] [--mode algo|llm] --apply` — принтер над preview `spec-to-code` + `apply-code` (стару гілку з `safeWriteAll` прибрано); у TUI — `a` у F6 на завершеному записі spec-to-code з кроком, що перелічує всі файли.

- **`src/operations.ts`** — `SpecToCodeCandidate.basis: CandidateBasis` (`SourceInputs` + `specs: {path, sha256|null}[]`), той самий basis тепер використовує й перевірка свіжості proposal (поведінка 28/29 без змін; тексти специфікацій замінено хешами). `ApplyCodeRequest { kind: "apply-code", root, candidate, mode?, pending?: refuse|keep }` (типово refuse), `ApplyCodePayload { id, files: AppliedFile{role, file, state completed|failed|not-attempted, error?}[], refused, error }`; `apply-code` у `WRITING_KINDS`. `applyProblems`: перша ціль, яку не дозволяє `codeProposalProblem` (`spec-to-code: <file>: …`) або протокол запису без expect (`<file>: …`) — 2; кожна ціль ≠ `before` (`<file>: changed|created on disk while the change was prepared; nothing written`), кожна пропозиція, що чекає (лише refuse), змінений `keylang.json`, джерела (крім самих цілей — вони названі як ціль) і специфікації — 1, усе названо, нічого не записано. `runApplyCode`: перевірка → `beforeCommit({ targets })` (відмова сесії — 1) → повторна перевірка → по черзі: оберт event loop і signal між файлами (Cancel — `cancelled`), `writeProblem` з expect безпосередньо перед кожним, `writeAtomic` (CRLF/права як у `safeWriteAll`); збій — 2, `written before it stopped: …`, `not written: …`; `written` конверта — лише записані.
- **`src/cli.ts`** — `specToCodeApplyPrinter`: stdout `print`, stderr примітки, потім `apply-code` з `pending: "keep"` (як раніше: пропозиції лишаються); успіх — той самий рядок ``<files> written; run `keylang map`, then …``; будь-який незаписаний файл — 2 (як раніше, і для конфлікту); при збої посередині після помилки — `keylang: <file>: written` / `keylang: <file>: not written`. Прибрано імпорти `safeWriteAll`, `specToCode`, `codeProposalProblem`, `writeProposal`.
- **`src/tui/app.ts`** — `a` у F6 → `applyCandidate`: відмова до кроку для запису, що виконується/не завершений/не spec-to-code, outdated (`Enter builds it again`), MERGE на цілі, dirty-буфер цілі, пропозиція для цілі (`merge it in MERGE (Enter in F6, m or Proposals) instead; applying never removes it`); далі `requestOperation` → крок `withSavedInputs` з `writes` = усі цілі, `writesNote`, без збереження жодного буфера. `commitGate` для apply-code — MERGE/dirty на цілях. `afterApplyCode`: кожен кандидат spec-to-code з записаною ціллю → outdated («its files were written since this run»), повідомлення «no test was run … u undoes only the last MERGE, not this write». Оновлення чистих буферів і повторний аналіз — чинний `endCommit`.
- **`src/tui/state.ts`, `view.ts`** — `SaveBarrier.writesNote`; мітка `spec-to-code <id>[ --mode llm] --apply`; F6: підказка `Enter rerun · a apply all · Esc back` і рядок «a applies the entire candidate…» на поточному завершеному кандидаті без пропозицій; звіт apply-code: `N file(s) written` / `refused, nothing written` / `K of N file(s) written, failed|cancelled`, кожен файл `written` / `failed: <err>` / `not attempted`.
- **`docs/tools.md`** — абзац «Застосування всього кандидата (spec-to-code --apply)», у абзаці 28 прибрано «`--apply` поки йде старою гілкою».
- **Карта** — перегенеровано `keylang/map{,-explained}/{cli,operations,tui}.md`, `map-explained/README.md`; у чистій копії HEAD + мої файли — ті самі байти, крім WIP-рядка extract і підсумку в README (як і в HEAD); WIP `extract.md` байтово ті самі (sha1 файлів і diff до/після), не закомічено.

Тести (`tests/tui.test.ts`, +2; хелпер `applyRecord`, `REFUND_FILES`):
1. Справжній worker: завершення preview нічого не пише; F6 показує всі цілі з diff і підказку `a`; `a` → крок з action `spec-to-code … --apply`, усіма трьома файлами й поясненням; Back нічого не пише й не запускає; Continue → 3 файли = CLI `--apply` у двійнику байт у байт (stdout = `print`, stderr-рядок той самий), нових файлів — лише ці (каталог `tests/` створено, жодної пропозиції/stats); аналіз після запису бачить код (ID ok); кандидат outdated → повторний `a` відмовлено до запуску; F6-звіт apply; `u` — «no merge to undo»; той самий кандидат напряму в операцію → 1, кожна ціль `created on disk…`, дерево незмінне. Модельний кандидат (held mock) — той самий `a`, мітка `--mode llm --apply`, модель більше не питається (3 запити), файли = CLI `--mode llm --apply`.
2. Операції в потоці сесії з хуком: ціль створена після preview → 1, жоден файл не записано, новий файл лишився; специфікацію змінено в `beforeCommit` → 1, нові байти лишились; файл `tests` на місці каталогу → код записано й названо, другий failed, третій not-attempted, код 2, F6 `1 of 3 file(s) written, failed · code 2`, CLI у двійнику — 2 з рядками `written`/`not written`; proposal-кандидат з відкритим MERGE → `a` відмовлено (MERGE + пропозиції тестів), після виходу з MERGE — відмова через кожну пропозицію з порадою MERGE; жодного запису, сховище пропозицій байтово те саме; операція з refuse → 1 з назвою кожної, з keep → 0 і жодна пропозиція не видалена.

Перевірки: `npm run typecheck` ✓; `npm test` 555 tests, 554 pass / 0 fail / 1 skipped ✓; `node bin/keylang.js map --check` ✓ (0); `node bin/keylang.js check` 0 fail / 0 unverified / 71 ok ✓ (до прогону тестів 24 unverified — застарілі локальні звіти тестів/trace, оновлені `npm test`); порівняння CLI `--apply` зі збіркою HEAD (`git archive` + WIP `src/extract/ts.ts`, локальний mock моделі) на 22 сценаріях (базовий, без тестів, тести поза repo/через посилання/Python, код через посилання назовні, згенерований файл, `--into` іншого модуля, доповнення наявного файла, CRLF, пропозиція, що чекає, deny, typo, `--apply --print`, без id, поганий mode, без джерел, підкаталог, llm: добрий/чужа функція/правка під час відповіді/без ключа/без agent, збій другого запису) — stdout, stderr, код, дерево: 21/22 SAME; різниця лише навмисна — рядок `keylang: src/app/refund.ts: written` після помилки часткового запису.

Коміт: `dd7bdd5` (Apply a whole spec-to-code candidate through a shared apply-code operation in CLI and TUI); сторонній WIP не зачеплено.

Передано наступним задачам:
- 35: `apply-code` — писальна операція з кроками й Cancel між файлами; вихід під час commit має чекати поточного файла (як для map).
- 36: запит несе весь кандидат (масиви, без Map) — придатний для JSON-транспорту web.
- 37: `a` у F6 — нова клавіша панелі результатів; у палітрі окремої дії немає (свідомо: apply — лише над переглянутим кандидатом).

Припущення й залишки:
- Код операції для конфлікту стану — 1 (як proposals 28/29), для політики запису й I/O — 2; CLI для будь-якого незаписаного файла лишає 2, як було.
- Нове для CLI: специфікація чи джерело, змінені під час відповіді моделі, тепер відмовляють запис (раніше писало); при кількох конфліктах CLI друкує кожен (раніше — перший).
- Пропозиція, що чекає, відмовляє лише в TUI (`refuse`); CLI (`keep`) пише файли, пропозиції лишаються застарілими, як і раніше.
- Dirty-буфер цілі в TUI наразі недосяжний (код-файли відкриваються лише у read-only переглядачі, буфери — специфікації й конфіг); перевірку залишено як захист і в `commitGate`, тестом не покрито. Відмова сесії в `beforeCommit` окремим тестом не перевірена (та сама функція, що й до кроку).
- Outdated: кандидат стає outdated після збереження входу (чинне правило 29 для preview) і після запису його файлів; proposal-кандидат outdated не позначається, але його пропозиції відмовляють apply.
- Cancel посередині apply окремим тестом не перевірено (шлях той самий, що в 09/28).
- Ручну TTY-перевірку наживо не виконано.

## Comments

- 2026-10-01: виконано, коміт `dd7bdd5` (Apply a whole spec-to-code candidate through a shared apply-code operation in CLI and TUI); критерії приймання перевірено тестами з локальними mocks і порівнянням CLI з HEAD (21/22, різниця навмисна).
