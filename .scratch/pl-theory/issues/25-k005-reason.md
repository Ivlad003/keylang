# 25: Причина K005 (`reason`) у `check --format json`, `parse --json` і `explain K005`

**Джерело:** research-pl §5 Р-12; знахідка 11; рішення Q16 (spec)

**What to build:** Кожна діагностика K005 отримує поле `reason` із закритого переліку з шести значень:

| `reason` | Коли |
|---|---|
| `arguments` | бракує аргументів, зайві чи не ті; форма рядка; `# flow` без імені й зайві слова заголовка (parser.ts:338, 341); значення `kind` (parser.ts:470); умова wiring (wiring.ts:75) |
| `id` | токен не є ID чи ім'ям, зокрема ім'я секції (parser.ts:336) |
| `link` | зламаний лінк |
| `quote` | незакрита лапка (лексер, parser.ts:378) |
| `layer` | не шар, шар двічі, суперечність порядків, шар і в порядку, і вкладений (rules.ts:469, 518, 530, 533, 563) |
| `scope` | fn, type, event чи аліас залежності в `allow`/`deny` (rules.ts:486); лише ця причина залежить від знімка |

Поле з'являється в двох машинних каналах:
- `check --format json`: результат K005 має `reason`, результати з іншими кодами поля не мають;
- `parse --json`: той самий `reason` у `diagnostics[]` для K005 парсера. `parse --json` серіалізує `Document.diagnostics` напряму (cli.ts:1057), тож поле з'являється там без окремої логіки.

`keylang explain K005` (explain.ts:26-30) додає до причини, прикладу й виправлення перелік причин із коротким прикладом кожної.

Не змінюються:
- human-вивід і `--format github` — це текст для людини;
- повідомлення, код, позиції й рівень;
- `specHash`: для діагностики без вердикту він дорівнює sha256(`code\0message`) (check-results.ts:45).

`reason` лише для K005; для інших кодів (наприклад, K003) поля не додаємо. LSP, MCP і SARIF отримують поле в 26.

Реалізація:
- Тип `K005Reason` і опційне поле `Diagnostic.reason` — у src/diag.ts, за прецедентом `target`/`criterion`/`area`.
- `err` парсера та місця в rules.ts і wiring.ts передають причину через внутрішній хелпер, тож K005 без причини не скомпілюється. Публічна `diagnostic()` з src/index.ts зберігає сигнатуру.
- Деякі місця змішують причини, і там причина йде за гілкою, а текст повідомлення не змінюється:
  - parser.ts:512 (`planned`): невалідний ID — `id`, решта — `arguments`;
  - parser.ts:612 і :645 уже розгалужують повідомлення за `[` (лінк чи ID).

Р-12 не чекає на SpecIR (18–24): причину задає місце, де виникає K005. Тікет 24 переносить K005 рівня check у `compileSpec` разом із `reason`, тож краще злити цей тікет раніше за 24.

**Blocked by:** 17 (еталон spec-forms)

**Status:** resolved

**Контракт:**
- JSON-вивід і публічний тип. Нове опційне поле `reason` з'являється в результатах K005 `check --format json` і в `diagnostics[]` `parse --json`.
- `Diagnostic` — публічний тип `src/index.ts`; він отримує опційне поле `reason`, а тип `K005Reason` експортується поруч.
- `explain K005` друкує новий текст.
- Зміна сумісна, бо лише додає поля. Перелік із шести причин стає контрактом, який фіксує заморожування формату v1 (design-v0.2/40; його виділяє 43 за Q24).

- [x] CLI-тест на фікстурі `spec-forms/invalid` (17): для кожної з шести причин у `check --format json` є щонайменше одна K005 з очікуваним `reason`. Результати з іншими кодами поля не мають.
- [x] `parse --json` на файлах тієї самої фікстури дає K005 парсера з тим самим `reason`, що й `check --format json`. `test f.ts "x` дає дві K005 на одній позиції: `quote` і `arguments`.
- [x] Human-вивід `check` і `--format github` байт у байт ті самі, `specHash` K005 не змінився. Еталон 17 відрізняється лише доданим `reason` (diff переглянуто).
- [x] `keylang explain K005` і `explain k005` друкують перелік причин із прикладом кожної, код виходу 0.
- [x] format.md §7: таблиця причин під рядком K005, тест таблиці K-кодів зелений. Поле `reason` описано в `json` і `parse --json` там, де ці формати живуть на момент злиття: format.md §7/§9 або docs/tools.md після 30.
- [ ] `npm run typecheck` і `npm test` зелені.
- [ ] `node bin/keylang.js map` виконано, diff `keylang/map/` і `keylang/map-explained/` переглянуто.
- [x] `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/diag.ts`, `src/parser.ts`, `src/rules.ts`, `src/wiring.ts`, `src/check-results.ts`, `src/explain.ts`, `src/index.ts`, `docs/format.md`, `tests/cli.test.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78 (src/diag.ts `K005Reason`, src/check-results.ts, src/explain.ts); tests/spec-forms.test.ts (golden spec-forms/invalid, parse --json reasons, quote+arguments); format.md §7 таблиця reason; `explain k005` — код 0 з переліком; `map --check` = 0, `check` — 0 fail. Повний `npm test` під час аудиту не запускався.
