# 42: Транспорт `keylang lsp` на `vscode-jsonrpc` — не зараз

**Джерело:** research-pl §5 Р-7; знахідка 10; рішення Q21 (spec)

**What to build:** Це міграція, від якої ADR 0006 (41) відмовився. Тікет описує, якою вона буде, якщо спрацює тригер перегляду.

Для редактора й користувача нічого не змінюється: ті самі можливості, позиції, коди помилок і коди виходу. `src/lsp.ts` перестає сам розбирати `Content-Length` і диспетчеризувати JSON-RPC. Натомість він бере `createMessageConnection(new StreamMessageReader(stdin), new StreamMessageWriter(stdout))` з `vscode-jsonrpc/node.js`, обробники `onRequest`/`onNotification` і константи й типи `vscode-languageserver-protocol`. Повний `vscode-languageserver` не береться, бо життєвий цикл і коди виходу лишаються за keylang.

Без змін лишаються клас Server і чисті функції `lsp-features.ts`. `serveLsp(read, write)` повертає код і не викликає `process.exit`, а `cli.ts` завантажує `./lsp.ts` динамічним імпортом.

Контракти, яких бібліотека не дає, зберігаються явно:
- -32700 з `id: null` на невалідний JSON без розриву сесії — власним `contentTypeDecoder`;
- код 2 з причиною в stderr на кадр без Content-Length;
- негайна -32800 без другої відповіді;
- -32002 до `initialize` (40).

Якщо -32700 чи код 2 тримаються лише на зіставленні текстів помилок бібліотеки, міграцію зупиняють і повертаються до ADR 0006.

**Blocked by:** 41, 40 <!-- 41 — ADR LSP-транспорту; 40 — життєвий цикл до `initialize` -->

**Status:** wontfix

**Контракт:** зараз немає. Після повернення з'являються нові runtime-залежності: `vscode-jsonrpc`, `vscode-languageserver-protocol`, `vscode-languageserver-types`. Для 8.2.0 / 3.17.5 перевірено: MIT, без install-скриптів (editors/vscode/package-lock.json:57-95). CLI- і протокольний контракт не змінюються.

**Умова повернення:** спрацював тригер перегляду ADR 0006:
- новий транспортний баг P1/P2;
- потреба в динамічній реєстрації (зокрема `workspace/didChangeWatchedFiles`), `$/progress`, інкрементальній синхронізації, семантичних токенах чи іншій частині протоколу, яку дорожче писати, ніж взяти;
- другий транспорт.

Тоді тікет повертається в needs-triage з такими критеріями агента:
- tests/lsp.test.ts і tests/core.test.ts:173 проходять без зміни очікувань;
- у src/lsp.ts немає `Content-Length` і `process.exit`;
- `npm ls --omit=dev` показує нові пакети з ліцензіями;
- карту перегенеровано з новим ребром на `external.vscode-jsonrpc`, `map --check` і `check` зелені.

Ручний прогін `node editors/vscode/test/run.mjs` потребує дисплея, VS Code і мережі. Це окремий пункт «перевірка людиною» (ready-for-human), а не критерій агента.

**Чому не зараз:** ADR 0006 записав виняток. Три закріплені контракти транспорту бібліотека з типовою поведінкою не дає, а власний транспорт уже закрито тестами. Міграція коштувала б адаптерів і не дала б користувачу нової можливості.

Ключові файли: `src/lsp.ts`, `src/cli.ts`, `package.json`, `docs/adr/0006-lsp-transport.md`
