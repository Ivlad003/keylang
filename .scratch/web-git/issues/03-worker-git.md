# 03: Git в `app.html`: isomorphic-git у worker-і

**Status:** resolved

**Type:** code

**Blocked by:** 01

**Verify:** `node --test tests/web-e2e/static.test.ts` · `npm run typecheck` · `npm run test:web` · `node --test tests/web.test.ts`

**Джерело:** spec §2, §3; research.md §7

**What to build:** Worker відповідає на `/api/git` і `/api/changes` так само, як сервер.

- `isomorphic-git` — devDependency, у bundle worker-а (≈180 КБ).
- `web/worker/git.ts`: isomorphic-git поверх fs у пам'яті; спільний `cache`; порівняння лише вмісту.
- `web/worker/git-changes.ts`: той самий API, що `src/git-changes.ts` (типи звідти). Відповідає синхронно зі знімка, який worker асинхронно рахує перед запитом (`prepare(since)`); непорахованого просить не мовчки, а помилкою.
- `scripts/build-web.mjs`: `src/git-changes.ts` для worker-а → `web/worker/git-changes.ts`.
- `web/src/local.ts`: `.git` більше не пропускається, якщо він не більший за 512 МБ; більший — git вимкнено з поясненням.
- `docs/tui.md`: «Перегляд без запису» — git в `app.html`.

- [x] e2e: `app.html` на git-фікстурі відповідає на `/api/git` і `/api/changes` (з базою за замовчуванням і з `since=HEAD`) байт у байт як `keylang web --read-only`
- [x] e2e: тека без `.git` — `available: false`, без помилок
- [x] збірка: модуль Node без shim-а, як і раніше, зупиняє її

## Comments

### Notes

- 2026-10-09 (реалізація): `web/worker/git.ts` (isomorphic-git, спільний `cache`), `web/worker/git-changes.ts` (API `src/git-changes.ts`, типи — `typeof cli.*`), підміна модуля в `scripts/build-web.mjs` (`keylang-git-changes` — справжній модуль для чистих хелперів). Worker готує git перед `/api/git` і `/api/changes` (`prepareGit`).
- 2026-10-09 (рішення): `isomorphic-git` закріплено точно на 1.42.2. Новіші 1.43.x вийшли за останні 6 днів, а прототип був на 1.43.2. Тести пройшли й на 1.42.2.
- 2026-10-09 (знахідка): у пакетах `clean-git-ref` (Apache-2.0) і `diff3` (MIT) немає файла ліцензії. `build-web.mjs` пише стандартний текст ISC, MIT чи Apache-2.0 за полем `license`.
- `analysis.js`: 851 → 1019 КіБ.
- Тести: `tests/web-e2e/static.test.ts` (+2: з `.git` — байт у байт із сервером, разом із `since=main` і 400; без `.git` — `available: false`).
- 2026-10-10 (знахідка на клоні keylang, якої не дала мала фікстура): 1) обхід `WORKDIR` в isomorphic-git хешує кожен файл (жоден stat браузера не збігається з індексом), тому «Зміни» рахувались 18 с; 2) бінарні й великі файли, яких `app.html` не читає, ставали «видаленими» (42 замість 1). Виправлено: робоче дерево isomorphic-git не обходить; oid бази й індексу береться з об'єктів, незмінений файл визначається stat-перевіркою git (розмір і `File.lastModified` проти запису індексу, з захистом від racy git), інакше SHA-1 (`@noble/hashes`); непрочитані файли передаються worker-у метаданими (`unread` у `local-protocol.ts`). Тепер 2,4 с на базу, і відповіді для бази фічі, `HEAD`, `master`, `HEAD~5`, `master^`, `HEAD~2^`, `master^{commit}` і короткого SHA збігаються з Node байт у байт. isomorphic-git тепер нічого не пише, тож його fs повністю read-only.
- 2026-10-10: розбір ревізій `~N`/`^N`/`^{commit}` — свій (`Reader.commit`): isomorphic-git розв'язує лише імена.
- Фікстура `tests/git-fixture.ts` тепер має бінарні файли: незмінений, змінений на гілці (без hunk-а, тож не в списку) і untracked.
