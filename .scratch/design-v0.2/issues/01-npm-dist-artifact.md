# 01: npm-артефакт запускається з `node_modules`

**Етап:** M1.1 · **Джерело:** design §7.4 «Збірка релізу», review RV01

**What to build:** `npm pack` дає tarball, який після встановлення в чистий тимчасовий каталог запускає справжній CLI з `node_modules`: `--version`, `parse`, `map` з WASM-граматиками. Розробка й далі виконує TS напряму; `prepack` компілює JS у `dist/` із переписаними відносними `.ts`-імпортами, опублікований entrypoint завантажує `dist/*.js`. На встановленні компіляція не виконується, native-коду немає.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [ ] `npm pack` → встановлення tarball у тимчасовий каталог → `node node_modules/keylang/bin/keylang.js --version` повертає 0 і версію з `package.json`
- [ ] у тому самому середовищі `parse --json` і `map` на копії `tests/fixtures/repo` дають той самий результат, що локальний запуск
- [ ] поле `files` пакета містить `bin`, `dist` і WASM-граматики; вихідний `src/*.ts` до tarball не потрібен для запуску
- [ ] `npm test` містить перевірку tarball (може бути позначена як повільна, але працює офлайн)
- [x] `npm run typecheck`, `npm test` зелені; `--help` не змінився

## Answer

`prepack` компілює `src/` у `dist/` (`rewriteRelativeImportExtensions`) і копіює WASM у `dist/wasm`. У чекауті `bin/keylang.js` статично імпортує `src/cli.ts`; під час `npm pack` файл тимчасово імпортує `dist/cli.js` і відновлюється в `postpack`. Тест ставить tarball у чистий каталог офлайн і звіряє `--version`, `--help`, `parse --json` і `map` з локальним запуском.
- [ ] `docs/design.md` §7.4 і README/AGENTS (якщо згадують запуск) відповідають фактичній збірці
