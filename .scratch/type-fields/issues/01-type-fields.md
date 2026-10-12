# 01: поля planned type, форма типів у знімку, keylang types

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npx oxlint` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec.md

**What to build:** Усе з spec.md §2–§6: синтаксис і IR поля, SpecIR, форма TS-типів у фактах і знімку, перевірка K201/K202 за полями, `src/ts-projection.ts` і команда `keylang types`, документація (grammar, semantics, snapshot, cli, explain). Тести: CLI-тести парсингу/fmt/діагностик полів, check проти коду (збіг, розбіжність, невідома форма), `keylang types` (вивід, --out, --check).

**Checklist:**

- [x] §2 синтаксис: вузол `field` під `planned type` (`src/parser.ts`, `src/ir.ts`), K005 `field`, K005 `arguments` для полів псевдоніма, K002 повтору (`src/resolve.ts`), `fmt` `- name?: type`
- [x] §3 SpecIR: `Planned.fields`, `PlannedField`, `plannedDeclaration().fields`; hover і `explain <id>` показують поля
- [x] §4 форма коду: `DeclFact.shape` / `TypeFieldFact` (TS interface, object alias, клас), `TypeNode.shape`, `SnapshotNode.shape`, `EXTRACTOR_VERSION` m1.25; карта поля не пише
- [x] §5 перевірка: K201 з відмінностями полів, K202 «fields are not checked» для невідомої форми
- [x] §6 `src/ts-projection.ts` (`projectTypes`, `plannedIdsOf`) і `keylang types [<flow|feature>…] [--out f] [--check]`
- [x] документація: grammar.md (таблиці, приклад з діагностиками, EBNF), semantics.md (K201/K202, `planned`, reason `field`), snapshot.md (`shape`), cli.md (таблиця й розділ `types`), `src/explain.ts`
- [x] тести: `tests/type-fields.test.ts`

## Comments

### 2026-10-12 — реалізація (агент у worktree)

Припущення й рішення, де spec мовчить:

- `--out` — шлях відносно кореня репозиторію (як у `wire`), перевіряється `targetProblem`; файл без маркера `// keylang:generated …` не перезаписується (код 1, як `tour`). `--check` без `--out` — код 2.
- `keylang types` лише читає: `analyze` без кешу фактів (`persistFacts: false, saveFacts: false`), тож і `--check` нічого не пише.
- `projectTypes` має додатковий необов'язковий вхід `outDir` — тека вихідного файла для відносних шляхів `import type` (без нього — корінь). Шлях зберігає розширення джерела (`.ts`): type-only import його дозволяє.
- `import type` — лише для вузла коду виду `type` чи класу (`module` з `class: true`) у файлі `.ts/.tsx/.mts/.cts`. Реалізований `planned` без імен у CLI теж стає `import type` (він «є в коді»), інтерфейсу для нього немає.
- Ім'я flow/feature: flow — `planned` рядки його секції (від заголовка до наступного `# flow` того ж файла); feature — `planned` файла `<dir>/features/<name>.md`. Інше ім'я — код 2.
- Планований модуль, що не названий, але має вибрані `planned fn`, дає інтерфейс з місцем першого fn за ID; названий `planned module` бере всі свої нереалізовані `planned fn`.
- Підпис `planned type`, що не `= …` і не `extends …`, з полями — інтерфейс без heritage; без полів — `unknown` з `// TODO: fields <підпис>`. Неявний підпис fn (не `(…)`) — відкрита форма з коментарем.
- Форма класу записується у факти (публічні типізовані поля екземпляра, без `static`/`private`/`protected`/`#`, без значень-функцій), але в знімок іде лише для вузлів `type`: клас у знімку — модуль, і `planned type` на клас усе одно K201 за видом.
- Метод інтерфейсу без типу результату у форму не входить (немає анотації). Успадковані через `extends` поля у форму не входять — план, що їх перелічує, дасть `missing field`.
- K201 показує перші три відмінності, решта — `and N more`. Додатково до spec: `field X is optional in the code` (план обов'язковий, код — ні).
- Відкрите: два ID з однаковим останнім сегментом дають однакові імена в проєкції (TypeScript повідомить про дубль) — не розв'язано.
