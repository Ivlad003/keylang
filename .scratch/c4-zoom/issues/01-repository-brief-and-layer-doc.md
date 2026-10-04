# 01: Brief репозиторію й документ шару

**Джерело:** spec §4.1 A1, Р1, Р11, §1b; research-c4-zoom-literature §9 п. 1–2; design §5.4; ADR 0004

**What to build:** Два верхні рівні C4 отримують текст без моделі.

**Brief репозиторію** (рівень «система», Р1) — вузол представлення, не ID мови. Знімок отримує поле `system` (`.keylang/index.json`, format.md §11) з `brief` і `sources`. Джерела по черзі: перший абзац прози кореневого `README.md` (заголовки, HTML-блоки й рядки лише із зображеннями чи бейджами пропускаються, далі `briefOf`), інакше `description` з кореневого `package.json`, `Cargo.toml` (`[package]` або `[workspace.package]`) чи `pyproject.toml` (`[project]`). Ці файли входять у manifest знімка, тож їхня зміна робить знімок неактуальним. `<dir>/map-explained/README.md` починається абзацом brief-у з рядком походження (`README.md` або назва маніфесту); без джерела — `—` і підказка `keylang explain --missing --llm`.

**Модель для репозиторію.** `explain --missing --llm` питає її останньою хвилею, після шарів, і лише коли детермінованого джерела немає. Відповідь — `<dir>/explain/brief/@system.md`: `@` не може починати сегмент ID, тож файл не зіткнеться з шаром `system` (це ім'я не зарезервоване). База застарілості — хеш ID шарів і текстів їхніх brief-ів. `explain --stale` показує цей файл як `stale` за зміни бази й ніколи як `gone`.

**Документ шару** (Р11). Вузол шару в знімку зараз завжди має `doc: null` (`src/snapshot.ts`). Тепер `doc` береться з `README.md` теки шару, інакше з doc-коментаря index-модуля в цій теці (`index.ts`/`index.js`, `mod.rs`, `lib.rs`, `__init__.py`). Тека шару — спільна тека його глобів (`src/tui/**` → `src/tui`); шар без однієї спільної теки документа не має. README шару входить у manifest. Походження — «код», як у doc-коментаря. `planBriefs` уже пропускає вузли з `doc`, тож модель питають лише для шарів без документа.

Brief шару моделлю й застарілість шару від усього під ним уже працюють (`planBriefs`, `snapshotBaseline`) і не змінюються.

**Blocked by:** None (can start immediately)

**Type:** code

**Model:** claude:claude-opus-5-5

**Status:** ready-for-agent

**Verify:** `node --test tests/repository-brief.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] тести тікета — у новому файлі `tests/repository-brief.test.ts`: Verify запускає його окремо, тож без нього тікет не закриється
- [ ] e2e: фікстура з README (заголовок, бейдж, абзац) і `package.json` → README карти з поясненнями починається абзацом з README і рядком походження `README.md`; без README — `description` і `package.json`; без обох — `—` і підказка
- [ ] зміна лише README робить `map --check` застарілим (код 1)
- [ ] шар із `README.md` у теці → колонка Explanation і рядок шару показують документ з походженням «код»; `explain --missing --llm` з мок-провайдером цей шар не запитує
- [ ] doc-коментар `index.ts` теки шару теж дає документ; шар без документа запитується, як зараз
- [ ] шар `system` у `keylang.json` і збережений `@system.md` не конфліктують; після зміни brief-у шару `explain --stale` показує `@system` як `stale`, не `gone`
- [ ] format.md §11 (поле `system`, `doc` шару), tools.md (`explain --missing`) і design §5.4 оновлено; карту keylang перегенеровано

## Comments
