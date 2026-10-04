# 08: `spec-to-code --mode hybrid` (CLI)

**Джерело:** plan.md крок 8 і §1 C17, C18, §2 «два дизайни hybrid»; design/design-spec-to-code-hybrid.md; review-spec-to-code-hybrid.md; decisions.md (Q3 default algo; Q4 `--apply` відмовляє на нових помилках)

**What to build:** `keylang spec-to-code <id> --mode hybrid [--prompt "<інструкція>"]`: keylang будує детермінований каркас (stub із оголошеною сигнатурою + тестові файли з іменами тестів зі спеки), потім один запит до налаштованої моделі — особливо `cli:*`-агента, який може читати репо — зі stub-ом, сигнатурою, кроками потоку, оголошеними пакетами й контекст-паком сусідів; агент повертає готове тіло й тести у фіксованому форматі (для наявного файлу — блоки `imports` і `append`, для нових файлів — цілий файл). keylang перевіряє контракт: код є, парситься, немає `not implemented`, сигнатура і K202 збережені, залежності лише з `package.json` + вбудовані Node (Rust — toolchain + Cargo; Python — пропуск із приміткою), немає нових нерозв'язаних імпортів, усі імена тестів присутні; знахідки (нові помилки діагностики, кроки не `static ok`, незаплановані експорти) стають примітками; один retry на порушення контракту, ніколи після обрізання за `max_tokens`. Запис лише через `--apply` (safe-write; відмова з кодом 1, якщо кандидат додає помилку) або `--print`; за замовчуванням — пропозиції в `.keylang/proposals`. Коли модель читає репо, відбиток репо до й після виклику мусить збігатися — інакше код 2 «агент змінив файли; keylang нічого не записав». Default лишається `algo`; hybrid без моделі падає в algo з приміткою в stderr; `--prompt` з algo — код 2. MCP `scaffold` лишається algo без моделі. Прогрес і примітки — у stderr, stdout зберігає форму.

**Blocked by:** 02, 03 <!-- 02 — агент-CLI, readsRepo; 03 — Analysis.packages для перевірки залежностей -->

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] `specToCode(analysis, id, options)` з об'єктом опцій (`into, mode, model, instruction, signal, overlay, analyzer, evidence, context, progress`); обидва виклики (CLI, MCP) переведено
- [ ] чиста побудова запиту hybrid; парсер відповіді з блоками за шляхом і частиною (регекс збігає довжину fence; CRLF зберігається)
- [ ] контрактні перевірки та знахідки за списком; retry; `maxTokens` = clamp(8192, оцінка, 32000); Anthropic-відповідь зі `stop_reason: max_tokens` — помилка «answer cut»
- [ ] guard відбитка репо (git status + sha1 брудних шляхів, файли-кандидати, proposals; без git — лише кандидати й спеки з приміткою)
- [ ] CLI: `--mode algo|llm|hybrid`, `--prompt`, USAGE, коди виходу
- [ ] e2e у `tests/draft.test.ts` з мок-моделлю та фікстурою refund + `zod`: `--mode hybrid --print` — рівно 1 промт зі stub-ом, `assert.fail(`, порядком кроків і `Declared packages: zod`; stdout з `ID ok`/`static ok`; нічого не записано; без `--print` — пропозиції; `--apply` пише точний текст; відповідь, що ламає контракт (змінена сигнатура + імпорт `left-pad`) — 2 промти, другий з `Problems:`, код 2, нічого не записано; `--prompt x --mode algo` → 2; `--mode fast` → 2 з трьома режимами; фейковий `claude` з 02 отримує `--tools Read,Grep,Glob` і stub на stdin, режим `write` → 2 з текстом guard; переписаний цілий файл наявного модуля — зайве ігнорується, оригінал збережено як префікс; Python planned fn з `import os` — без порушення, з приміткою
- [ ] `docs/tools.md` (spec-to-code: hybrid, формат відповіді, перевірки, retry, guard, `--prompt`, суворіший `--apply`; scaffold = `--mode algo --print`); `docs/adr/0012-spec-to-code-hybrid.md`
- [ ] `npm run typecheck`, `npm test`, `map --check`, `check` — зелені

Ключові файли: `src/spec-to-code.ts`, `src/cli.ts`, `src/llm.ts`, `src/mcp.ts`, `src/agent-context.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: hybrid не реалізовано. Є `spec-to-code --mode algo|llm` через спільну операцію (0eb0886, df219cd; коміт прямо каже «No hybrid»), сигнал скасування вже доходить до запитів моделі, а `specToCode(analysis, id, into, model, options)` має позиційні аргументи — його треба перевести на об'єкт опцій за тікетом.
