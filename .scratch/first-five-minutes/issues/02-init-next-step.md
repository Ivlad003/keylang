# 02: `init` закінчується «що далі»; точне повідомлення без підтримуваних мов

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npx oxlint` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [рев'ю 2026-11-19](../../../docs/review-2026-11-19.md) §3 рядки 3 і 12.

**What to build:**

**1. Підсумок `init`.** `cmdInit` (`src/cli.ts:1961-2033`) друкує звіти стадій: конфіг, `.gitignore`, карта, baseline, харнеси. Чим закінчити і що робити далі, він не каже. Виняток — рядок про невиявлений харнес (`:2026-2030`).

Після успішного `init` (не `--check`, код 0) у stderr додати блок у три рядки:

```
keylang: ready: <N> layers (<a>, <b>, …), map in <dir>/map/, baseline in <dir>/rules.baseline.md
keylang: next: keylang check            # verify the code against the baseline
keylang: then: write the rules you mean in <dir>/rules.md; keylang explain <code> for any finding
```

- Список шарів скорочується до перших 6 з `…`.
- `<dir>` — `config.dir` (типово `keylang`).
- Коли харнес не виявлено, наявний рядок про `keylang agents` лишається і стоїть перед блоком.
- stdout `init` не змінюється: машинний вивід стадій лишається там, де був.

**2. Повідомлення без підтримуваних мов.** У `src/operations/generate.ts:454` перелік мов без PHP: `(TypeScript, JavaScript, Python, Rust)`. А `map`, `map --check`, `baseline`, `draft`, `spec-to-code` і `code-to-spec` (`src/operations/generate.ts:50`, `:104`, `:264`; `src/operations/draft.ts:94`, `:258`, `:551`; `src/operations/code.ts:99`; `src/cli.ts:1202`) радять `run keylang init`. Порада хибна, коли `init` уже був і мов просто немає: Go, Java, лише Markdown.

- Перелік мов будувати з одного джерела (`src/languages.ts`), щоб він не розходився з кодом.
- Коли в репозиторії взагалі немає файлів підтримуваних мов, повідомлення каже це прямо і називає підтримувані мови, без поради `init`: `no TypeScript, JavaScript, Python, Rust or PHP files under <label>; keylang reads only these languages`.
- Коли файли є, але `keylang.json` відсутній чи їх виключає, порада `keylang init` (або перевірити `layers`/`exclude`) лишається.

Код виходу 2 не змінюється.

- [ ] після `init` у stderr — три рядки «ready / next / then»; stdout без змін
- [ ] `init --check` і `init` з помилкою блоку не друкують
- [ ] повідомлення «no supported source files» називає всі п'ять мов з одного джерела
- [ ] репозиторій лише з `.go` або `.md`: повідомлення без поради `init`, код 2
- [ ] CLI-тести на обидва випадки; очікувані stderr фікстур оновлено після перевірки нового тексту
- [ ] `docs/cli.md` (рядок `init`) і `docs/course/02-install-and-check.md`, якщо там є вивід `init`, узгоджено

Ключові файли: `src/cli.ts` (`cmdInit`), `src/operations/generate.ts`, `src/operations/draft.ts`, `src/operations/code.ts`, `src/languages.ts`, `tests/cli-*.test.ts`, `docs/cli.md`

## Comments
