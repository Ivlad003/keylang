# 09: TUI: побудова коду з `planned fn`, роботи агента, скасування

**Джерело:** plan.md крок 9 і §1 C19; design/design-spec-to-code-hybrid.md §4; decisions.md (Q6 клавіші `a`, `Ctrl+Space`, `Ctrl+X`)

**What to build:** У режимі перегляду `Ctrl+Space` на нереалізованому `planned fn` запускає hybrid spec-to-code (08) з overlay поточних буферів; рядок стану показує `⟳ <дія> · <агент> · <n> s · Ctrl+X cancels` з оновленням раз на секунду; результат відкривається як MERGE на файлі коду (потім тести), нічого не пишеться без `a`/`w`. `a` відкриває промт агенту (вид промту `agent` з ціллю під курсором) — інструкція йде як `--prompt`. `Ctrl+X` скасовує роботу: повідомлення «agent: cancelled; nothing proposed», пропозицій на диску немає. Одночасно одна робота; відмова, коли є непереглянута пропозиція (до і після виклику); перед записом пропозиції перевіряється, що файл на диску та сигнатура плану не змінилися. Ті самі дії — у палітрі `:`; довідка `?` і підказки статусу оновлені. Деінде `Ctrl+Space` працює як сьогодні (чернетка потоку).

**Blocked by:** 08 <!-- 08 — hybrid у CLI -->

**Status:** ready-for-agent

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [ ] стан TUI має дані прогресу агента; вид промту `agent` з ціллю
- [ ] `assist`: `job(label, run)` з одним слотом, періодичним перемальовуванням і очищенням у `finally`; `cancelAgent()`; `buildPlanned(id, instruction?)` з overlay, аналізатором, доказами й контекст-паком, записом пропозицій і відкриттям MERGE
- [ ] `app`: `Ctrl+Space` на planned fn → build; `a` → промт; `Ctrl+X` обробляється до обробки промту; палітра; `view`: сегмент прогресу, мітка промту, HELP/HINTS
- [ ] TUI e2e (фікстура checkout з `application.refund.refund` planned): `Ctrl+Space` — один промт зі stub-ом, потім MERGE `src/application/refund.ts · code`, на диску нічого; після `a` і `w` файл правильний і `static ok`; `a` з повільним моком — сегмент прогресу за регексом, промт містить «The developer asks:», `Ctrl+X` дає повідомлення про скасування і `.keylang/proposals` немає
- [ ] `docs/tools.md` (TUI): таблиця клавіш, абзац `Ctrl+Space`, MERGE, рядок стану
- [ ] `npm run typecheck`, `npm test`, `map --check`, `check` — зелені

Ключові файли: `src/tui/state.ts`, `src/tui/assist.ts`, `src/tui/app.ts`, `src/tui/view.ts`, `src/tui/merge-session.ts`
