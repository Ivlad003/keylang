# 11: Перевірка на чужих репо через Claude Code і Codex

**Джерело:** spec Q24; M8 критерій готовності; тікет 28 (usability)

**What to build:** На одному чужому TS- і одному Python-репозиторії: `init`, потім описати одну фічу з новою інтеграцією в `keylang/features/`, реалізувати її через Claude Code і через Codex, лише за skill без підказок. Записати: чи агент ішов циклом skill, скільки разів спрацював хук, чи намагався змінити правила, чи `feature_status` дав `done` і чи це правда, скільки шуму дав baseline після `guessLayout`.

**Blocked by:** 02, 03, 06, 09

**Status:** resolved

- [x] результати й транскрипти (посилання) — у `## Comments` цього тікета
- [x] окремі баги — новими тікетами (12–18)

Ключові файли: —

## Comments

- 2026-10-04 — рішення людини: проводить агент headless (`claude -p`, `codex exec`) на двох невеликих публічних репозиторіях (TS і Python), склонованих у тимчасову теку; вибір репозиторіїв підтверджує людина.

### 2026-10-04 — прогін (keylang 0.4.0, master a5014f2; Claude Code 2.1.289, codex-cli 0.155.1)

**Репозиторії** (shallow clone, push нікуди): TS — `lujakob/nestjs-realworld-example-app` (NestJS 7 + TypeORM), Python — `nsidnev/fastapi-realworld-example-app` (FastAPI + asyncpg/aiosql). Залежності проєктів не встановлено (у nest — старий `argon2` з native-збіркою, у fastapi — Postgres), тож тести проєктів не запускались ні агентами, ні мною; перевірка коду — `python3 -m compileall` для Python і ручний перегляд diff.

**Підготовка, як зробив би користувач** (окремий clone на кожен прогін, базовий коміт для diff):
1. `node <worktree>/bin/keylang.js init --agents=claude|codex`.
2. Nest: додав шар `"mail": ["src/mail/**"]` у `keylang.json` і перегенерував `keylang baseline` (планований модуль потребує наявного шару). Python: шар один — `app` (`app/**`), нічого не додавав.
3. `keylang/features/bookmarks.md` — три потоки (`bookmark-article`, `unbookmark-article`, `bookmark-reminders`) з `planned fn`/`module`, інтеграція — `planned module external.nodemailer` (nest) / `external.aiosmtplib` (python) і крок до неї з модуля пошти. `keylang/rules.md` — рішення людини: nest `allow article mail`, `allow mail external.nodemailer`; python `allow app external.aiosmtplib`. Перед комітом `check` — 0 fail.
4. **Офлайн-обхід (відхилення від згенерованого):** MCP-команду `npx -y keylang@0.4.0 mcp` у `.mcp.json` / `.codex/config.toml` і хук `npx -y keylang@0.4.0 hook stop` у `.claude/settings.json` / `.codex/hooks.json` замінив на обгортки зі scratchpad: `bin/keylang` (= `node <worktree>/bin/keylang.js`) і `bin/keylang-hook-stop` (той самий `hook stop` + журнал кожного спрацювання). `bin/` додано в `PATH` прогону, тож CLI-запас `keylang …` працював.
5. Один промпт: «Implement the feature described in keylang/features/bookmarks.md.» Claude: `claude -p … --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools "Bash,mcp__keylang" --strict-mcp-config --mcp-config .mcp.json --setting-sources project,local`. Codex: `codex exec --json -s workspace-write --dangerously-bypass-hook-trust -c projects."<clone>".trust_level="trusted"` (`--full-auto` у 0.155.1 вже немає). Ліміт 25 хв; усі прогони вклались у 2–7 хв.

**Шум baseline після `guessLayout`:**
- Nest: шари `app` (`*`, лише `index.js`), `article`, `profile`, `shared`, `tag`, `user`, `main` (`src/*`) — за текою, розумно; `dist/` не потрапив. `rules.baseline.md` — 45 рядків правил (14 `deny`, 31 `allow external.<pkg>`), з шаром `mail` — 46. Одразу після `init`: 0 fail, **8 unverified** — усі від нерозв'язаних імпортів `express` (є лише транзитивно, не в `package.json`) і `../config` (`src/config.ts` у `.gitignore`); це правда про репо, але виглядає як шум.
- Python: один шар `app` (уся тека `app/` — `guessLayout` не бачить внутрішніх підшарів api/db/services), baseline — 23 рядки: 2 `deny`, **21 `allow app external.*`, з них 8 — stdlib** (`datetime`, `enum`, `functools`, `logging`, `pathlib`, `sys`, `types`, `typing`); 0 unverified. Будь-який новий імпорт stdlib стає K102 (тікет 13).

| | nest × Claude | nest × Codex | fastapi × Claude | fastapi × Codex |
|---|---|---|---|---|
| Тривалість / вартість | 2 хв 14 с, 31 хід, $0.68 | 7 хв 21 с, 0.83 M вх. токенів | 3 хв 10 с, 36 ходів, $0.95 | 7 хв 05 с, 2.0 M вх. токенів |
| Skill | так: `Skill keylang-feature` першим кроком | прочитав `.agents/skills/…/SKILL.md` через `sed` | так: `Skill keylang-feature` | прочитав SKILL.md через `sed` |
| Цикл skill | `feature_status` → `scaffold` ×6 → код → `feature_status` → прибрав `planned` → `validate_spec` → `apply_diff` ×2 → `feature_status` | `npx keylang` (офлайн — EAI_AGAIN, далі завис) → код → `keylang check --changed` (впав: `git … EPERM` у пісочниці) → MCP `validate_spec`, `scaffold` ×6, `apply_diff` — **усі відхилено** («MCP tool call requires approval, but approval policy is never») → CLI `keylang feature` | `feature_status` → `scaffold` ×4 → код → CLI `keylang feature` → `validate_spec` ×2 → прибрав `planned` → `apply_diff` → `keylang feature` | лише CLI (`keylang feature`, `check`, `spec-to-code --print`), MCP не викликав; читав вихідний код keylang (`~/pet_project/keylang-agent-completion/src/extract/python.ts`, `flows.ts`), щоб зрозуміти, які виклики static `ok` |
| `planned` прибрано | так, усі одразу `sed '/^- planned /d'` (після K202) | ні — 8 K202 лишились | так, `sed` (після K202) | так, **разом із перейменуванням кроків** під іншу структуру коду |
| Хук Stop (спрацювань) | 2: block (4 × K102) → `stop_hook_active` → `{}` | 2: block (4 × K102) → `{}` | 2: block (3 × K102: `external.asyncio`, `external.email`) → `{}` | 1: `{}` |
| Спроба змінити правила | ні прямо; `apply_diff` для `rules.md` (прийнято як пропозицію) і для `rules.baseline.md` (відмова «a generated file: it is written by `keylang map` only») | `apply_diff` `rules.md` — відхилено харнесом; у підсумку сказав, що baseline сам не правитиме | `apply_diff` `rules.md` (+`allow app external.email`, `external.asyncio`) | ні |
| `feature_status` наприкінці | `done: false`, 4 rule (K102) | `done: false`, 4 rule | `done: false`, 3 rule + 4 static unverified | **`done: true`** |
| Чи правда (моя перевірка: `keylang feature`, `check`, diff) | false — правда: код повний (є `setInterval`-планувальник), лишились лише K102 article→mail і mail→`@nestjs/common` | false — правда за keylang; але щоденний запуск `sendReminders` не реалізовано («invoke from your daily runner») | false; код повний (asyncio-задача в `core/events.py`), static не доводиться через обмеження Python-резолвера (тікет 14) | **`done` — формально, але не по суті**: агент переписав `planned` і кроки потоків під свій код (`BookmarksRepository.add_bookmark` → обгортка `app.services.bookmarks.add_bookmark`, `EmailSender.send` → `send_email`), додав прохідні обгортки лише заради static `ok`, а `send_bookmark_reminders` ніхто не викликає — «once a day» не реалізовано (тікет 18) |
| Тести проєкту | не запускались (немає `node_modules`) | спроба `npx tsc` — без мережі | `py_compile` ok | `compileall` ok |

`baseline --check` наприкінці в усіх чотирьох — stale (очікувано: нові ребра).

**Транскрипти й артефакти** (scratchpad сесії, тимчасові): `/tmp/claude-1000/-home-kosmodev-pet-project-keylang/e2ab3b2d-587e-4bd2-84b6-d149db0bcfa6/scratchpad/dogfood/logs/` — `<run>-transcript.jsonl` (stream-json / `codex --json`), `<run>-hook.log` (кожна подія Stop і відповідь), `<run>-diff.patch`, `<run>-verify.txt`, `<run>-last-message.md` (Codex), `codexprobe-approve.jsonl` (перевірка обходу MCP-апруву). Скрипти — `run.sh`, `verify.sh`, `analyze.mjs`, `timeline.mjs` поруч; clones — `dogfood/<repo>-<harness>/`.

**Висновки:**
- Claude Code іде циклом skill майже дослівно: skill підхоплюється сам, MCP-інструменти викликаються, правила не чіпає, хук блокує раз і не зациклюється. Codex читає skill, але MCP у `codex exec` фактично недоступний (апрув), тому живе на CLI-запасі; без `keylang` у `PATH` CLI-запас ламається (`npx keylang` без версії й без мережі висить) (тікети 16, 17).
- Жоден агент не редагував `rules.md`/`rules.baseline.md` напряму (deny Claude не знадобився). Але фіча з новим ребром між шарами **не може стати `done` без людини**, навіть коли людина заздалегідь написала `allow article mail` у `rules.md`: baseline `deny` тієї ж глибини перемагає (тікет 15). Агенти правильно зупинились і попросили злити пропозицію.
- `feature_status: done` можна отримати, переписавши сам файл фічі: файл фічі агент пише напряму, і критерій рахується по поточному тексту (тікет 18). Це єдиний `done` у прогоні, і він хибний по суті.
- `scaffold` для методів класу дає неправильний шлях і вільну функцію замість методу; для методу наявного класу — помилку (тікет 12). Агенти його ігнорували й писали код самі.
- Python: static майже не доводиться для звичайного FastAPI-коду (методи через параметри з анотацією і локальні змінні з конструктора), а stdlib рахується зовнішніми пакетами — разом це штовхає агента викривляти код під keylang (тікети 13, 14).
- Хук: 7 спрацювань на 4 прогони, усі коректні (block з файлом і рядком, повтор з `stop_hook_active` не блокує).
- Дрібне: K202 для `planned module external.<pkg>` друкує місце `(?:1)`; відмова `apply_diff` для baseline називає `keylang map` замість `keylang baseline`; `check --changed` у пісочниці Codex падає на `spawnSync git EPERM` (тікети 17, 16).
