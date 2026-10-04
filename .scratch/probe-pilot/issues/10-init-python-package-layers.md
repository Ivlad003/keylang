# 10: `init` на Python-пакеті вгадує один шар

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04: premature commitment (Python — один шар `app` у 2 з 2 сесій, «useless for rules»), кандидат 9. Сесія 4 після ручного поділу наштовхнулась на 11 і 07.

**What to build:** `guessLayout` (`src/config.ts`) бере корінь джерел `src/` або `lib/`, інакше корінь репозиторію, і робить шар із кожної теки першого рівня. Типовий Python-застосунок (FastAPI RealWorld) — один пакет `app/` у корені з підпакетами `api/`, `services/`, `db/`, `core/`. Тож вгадано один шар `app: ["app/**"]`, а baseline — `deny app external, unassigned`: жодного правила між частинами застосунку.

Відтворення (master `c408f53`): тимчасовий репо з `pyproject.toml` і пакетом `app/` (`__init__.py`, `main.py`, підпакети `api/`, `services/`, `db/`, `core/` з `__init__.py` і модулем у кожному); `node bin/keylang.js init <тека> --agents=none` →

```json
"layers": { "app": ["app/**"] }
```

і `keylang/rules.baseline.md`: `- deny app external, unassigned`.

Після зміни: коли без `src/` / `lib/` корінь репозиторію дає рівно один кандидат у шари, і ця тека — Python-пакет (має `__init__.py`) з підтеками, що містять код, корінь джерел — ця тека, так само як `src/`: шар на кожну підтеку (`api`, `core`, `db`, `services`), файли самої теки — шар `main`, файли кореня репозиторію — `app` (як для `src/`; ім'я `app` тут уже може бути зайняте — тоді діє наявний `freeLayerName` з приміткою в stderr). Для того самого репо очікувано:

```json
"layers": { "api": ["app/api/**"], "core": ["app/core/**"], "db": ["app/db/**"], "services": ["app/services/**"], "main": ["app/*"] }
```

Що не змінюється: TS/JS/Rust-розкладка, репозиторій з кількома теками першого рівня, наявний `keylang.json` (перевірено: повторний `init` друкує `keylang.json: already exists, kept`).

**Несумісна зміна (zero-config).** `guessLayers` читає і `check`/`map` без `keylang.json` (`src/config.ts:134`). У такому Python-репо ID зміняться: `app.api.routes.get_user` → `api.routes.get_user`. Записати це в `docs/tools.md` і в коміті; репо з `keylang.json` не зачеплені.

- [ ] тест CLI: Python-пакет `app/` з підпакетами → шари за підтеками і `main`; baseline має `deny` між ними
- [ ] тест CLI: репо з двома теками першого рівня й TS-репо з `src/` — шари без змін
- [ ] format.md / `docs/tools.md` (опис `init`, «Імена шарів») описують нове правило кореня джерел

Ключові файли: `src/config.ts` (`guessLayout`), `docs/tools.md`, `docs/format.md`, `tests/cli.test.ts`

## Comments
