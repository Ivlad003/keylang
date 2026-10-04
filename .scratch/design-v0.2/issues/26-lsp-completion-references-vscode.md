# 26: LSP: детерміноване автодоповнення, references, CodeLens, тонкий VS Code-клієнт

**Етап:** M3 · **Джерело:** design §7.1, §7.3 «Підказки (детерміновані, без LLM)»

**What to build:** Автодоповнення ID зі знімка й `planned` з відкритих специфікацій, відфільтроване за `allow`/`deny` (заборонене не пропонується), з візуальною відмінністю наміру від наявного символу; ключові слова за позицією; signature help; references для ID з flow/rules; CodeLens «flows: checkout» над функцією в коді. Тонкий VS Code-клієнт (окремий пакет або тека), який лише запускає `keylang lsp`.

**Blocked by:** 25

**Status:** resolved

- [x] у фікстурі з `deny domain infrastructure` доповнення під модулем `domain.*` не містить `infrastructure.*`
- [x] доповнення після `step ` у flow пропонує лише callable-цілі та planned fn
- [x] references на `application.purchase.buy` знаходить рядки в flow і rules
- [x] VS Code-клієнт запускається з `code --extensionDevelopmentPath` і показує діагностики — `node editors/vscode/test/run.mjs`, 6/6 кроків у VS Code 1.139.0

## Answer

Контекстне доповнення (ключові слова за позицією, лише callable після `step`, фільтр `deny` для нового рядка під модулем, `planned` із `labelDetails`), references, CodeLens `flows: …`, signature help — `tests/lsp.test.ts`. Тонкий клієнт — `editors/vscode/` (package.json, extension.js, README з ручною перевіркою). Запуск перевірено в справжньому VS Code 1.139.0 (`editors/vscode/test/run.mjs`, `--extensionTestsPath`): 6/6 кроків. Перевірка знайшла й закрила три дефекти: клієнт додає `--stdio` (CLI його відкидав), push і pull давали дублі діагностик, CodeLens без команди VS Code відкидав.
