# 26: `reason` K005 у LSP, MCP і SARIF

**Джерело:** research-pl §5 Р-12; знахідка 11; рішення Q16 (spec)

**What to build:** Поле `reason` з 25 доходить до решти машинних каналів. Для інших кодів поля немає.

- **LSP.** Діагностика K005 має `data.reason` поруч із `data.verdict` (lsp-features.ts:212). Так зберігається інваріант format.md:392: діагностики LSP «збігаються з `check --format json`» за кодами, повідомленнями, позиціями, `data.verdict`, а тепер і за `data.reason`.
- **MCP.** `validate_spec` і `scaffold` перелічують поля діагностики явно (mcp.ts:238-240, 268), тож без правки причина туди не дійде; їм треба додати `reason`. MCP `check` уже отримує `reason` через `checkResults` (mcp.ts:165) після 25, і тест це закріплює. Для харнесів це головний канал (ADR 0005): за `reason` агент лагодить специфікацію, не розбираючи текст повідомлення.
- **SARIF.** Результат K005 має `properties.reason` поруч із verdict, criterion і `specHash` (cli.ts:1185).

Human-вивід і `--format github` не змінюються.

**Blocked by:** 25 (reason у check/parse/explain)

**Status:** resolved

**Контракт:** JSON-вивід. Додаються LSP `data.reason`, поле `reason` у діагностиках MCP `validate_spec` і `scaffold` та SARIF `properties.reason`. Зміна сумісна, бо лише додає поля.

- [x] tests/lsp.test.ts: pull-діагностика K005 має `data.reason` і `data.verdict`, діагностика з іншим кодом `data.reason` не має.
- [x] tests/mcp.test.ts: `validate_spec` на тексті з незакритою лапкою повертає K005 з `reason: "quote"`, MCP `check` повертає `reason` у результаті K005.
- [x] `check --format sarif` на фікстурі `spec-forms/invalid` (17): кожен результат K005 має `properties.reason`, результати з іншими кодами — ні. Human-вивід і `--format github` байт у байт ті самі.
- [x] Документацію оновлено там, де LSP, MCP і SARIF описано на момент злиття (semantics.md §7/§9 або docs/tools.md після 30). Зокрема, інваріант «збігаються з `check --format json`» називає `data.reason`.
- [ ] `npm run typecheck` і `npm test` зелені.
- [ ] `node bin/keylang.js map` виконано, diff `keylang/map/` і `keylang/map-explained/` переглянуто.
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/lsp-features.ts`, `src/mcp.ts`, `src/cli.ts`, `docs/format.md`, `tests/lsp.test.ts`, `tests/mcp.test.ts`, `tests/cli.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78 (src/lsp-features.ts `data.reason`, src/mcp.ts validate_spec/scaffold, SARIF `properties.reason`); tests/lsp.test.ts «a pulled K005 has data.reason», tests/mcp.test.ts (reason quote), tests/spec-forms.test.ts (sarif лише на K005); docs/tools.md (LSP `data.reason`, json/sarif).
