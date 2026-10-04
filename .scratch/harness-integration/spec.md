# Харнеси агентів: опис → код

**Джерело:** grilling із користувачем 2026-09-28 (Q1–Q25), [ADR 0005](../../docs/adr/0005-harness-integration.md), design §7.6, M8. Терміни — `CONTEXT.md` («Feature», «Baseline», «Harness», «Managed block», «Planned», «Proposal»).

## Мета

Після `keylang init` на чужому репозиторії харнес (Claude Code, Codex, opencode, Cursor) без ручного налаштування:
- бачить keylang (інструкції, MCP, skill);
- додає фічу чи інтеграцію за файлом `keylang/features/<slug>.md`;
- не може непомітно порушити архітектуру (baseline, deny на правила, хук `Stop`);
- отримує від keylang об'єктивне «готово» чи список прогалин.

Код пише харнес. keylang дає контекст і рамки, а потім звіряє.

## Рішення користувача (2026-09-28)

| # | Рішення |
|---|---|
| Q1 | keylang — специфікація для генерації (planned → код), поверх контексту й перевірки правил; не оркестратор |
| Q2, Q21 | Готово = усі `planned` фічі реалізовано (K202, без K201) + кожен крок її потоків static `ok` + нових порушень правил і baseline немає. Тести й trace не блокують |
| Q3 | Спільні стандарти (`AGENTS.md`, MCP, CLI) + тонкі адаптери лише для зворотного зв'язку й захисту |
| Q4 | Ціль — чужий репо з першого запуску (brownfield) |
| Q5, Q11′, Q18 | Зовнішні системи — наявні вузли `external.<pkg>`; нового виду вузла немає |
| Q6, Q7 | Фіча — файл `keylang/features/<slug>.md` без нової граматики; після реалізації лишається, `planned` прибирається за K202 |
| Q8, Q17 | Файли фіч харнес пише напряму; `keylang/rules*.md` — лише через пропозицію. Захист — інструкція + deny у дозволах харнеса, де він є. `check` git не читає |
| Q9, Q16 | `init` генерує `keylang/rules.baseline.md` на рівні шарів з поточного графу |
| Q10, Q19 | MCP: `context`, `validate_spec`, `scaffold` (лише текст, без LLM), `feature_status` |
| Q12 | Контракти — наявний рядок сигнатури; структуровані контракти поза v1 |
| Q13 | `init` визначає харнеси за каталогами; `--agents=…\|none`; `keylang agents [--check]`; керовані блоки |
| Q14 | Хук `Stop` (Claude, Codex, Cursor через імпорт `.claude/settings.json`) на нових порушеннях, без повторного блокування; opencode — лише інструкція |
| Q15 | Skill `keylang-feature` у `.agents/skills/` + копія в `.claude/skills/` |
| Q20 | MCP-команда `npx -y keylang@<версія init> mcp` |
| Q22 | Інтеграція — `planned module external.<pkg>` + крок потоку до нього |
| Q23 | Порядок: адаптери → інструменти фічі → рамки й хук → інтеграції |
| Q24 | CLI e2e + ручна перевірка на чужих TS/Python-репо через Claude Code і Codex |

## Перевірені факти (2026-09-28)

- `init` пише лише `keylang.json` і карту (`src/cli.ts:754`). Файлів для харнесів немає.
- MCP зараз має `search`, `node`, `code`, `flows`, `check`, `explain`, `apply_diff` (`src/mcp.ts`).
- Пакети вже є вузлами `external.<pkg>` синтетичного шару `external` (`src/imports.ts:23`); правила їх називають (`keylang/rules.md:18`).
- `planned module external.stripe` і крок потоку на модуль приймаються: `ID unverified … planned module`, `static unverified … not implemented` (перевірено на тимчасовому репо).
- Baseline виражається наявною граматикою: `deny <шар> <шари…>` + точкові `allow` (перемагає конкретніше правило, format.md §7).
- Формати харнесів (офіційна документація, 2026-09-28):
  - Claude Code читає `AGENTS.md` лише без `CLAUDE.md`, тому потрібен `@AGENTS.md`. MCP — `.mcp.json`. Хуки — `.claude/settings.json`: `Stop` з exit 2 чи `decision:"block"` повертає агента до роботи. Є `stop_hook_active`.
  - Codex: `AGENTS.md` (32 KiB), `.codex/config.toml` і `.codex/hooks.json` лише в trusted-проєкті; кожен хук схвалюється в `/hooks`. Skills — `.agents/skills`.
  - Cursor: `AGENTS.md`, `.cursor/mcp.json`, `.cursor/hooks.json` (`stop` → `followup_message`, `loop_limit`), імпорт хуків із `.claude/settings.json` за замовчуванням. Skills — `.agents/skills`, `.claude/skills`.
  - opencode: `AGENTS.md`, `opencode.json` (`mcp` у V1 і V2 різної форми), хуки лише JS-плагінами, несумісними між V1 і V2. Skills — `.agents/skills`, `.claude/skills`.

## Припущення (зафіксовані без окремого питання)

- Версія в MCP-команді — `version` з `package.json` keylang, що виконав `init`/`agents`.
- `init` без `--agents` і без жодного каталогу харнеса пише лише блок `AGENTS.md` (його читають усі чотири харнеси).
- Маркери керованого блоку — HTML-коментарі `<!-- keylang:begin -->` / `<!-- keylang:end -->` у Markdown; у JSON/TOML ключ `keylang` належить keylang повністю, решта файла зберігається.
- CLI-дзеркало `feature_status`: `keylang feature <slug> [--format json]`, коди 0 (готово) / 1 (прогалини) / 2. Потрібне для opencode і хуків без MCP.
- Baseline — це специфікація правил, яку `check` читає як `rules.md`. `keylang baseline [--check]` регенерує її.

## Несумісні зміни

- `init` починає писати файли поза `keylang/` (`AGENTS.md`, `CLAUDE.md`, MCP-конфіги, skill, хуки). `--agents=none` повертає стару поведінку.
- `init` на репо з порушеннями baseline не має: baseline описує поточний граф, тож `check` одразу після `init` порушень не додає.

## Поза обсягом

Структуровані контракти й assertions; групування пакетів у систему; LLM-режим `scaffold` через MCP; плагін opencode; оркестрація харнесів; eval із реальним харнесом у CI; хуки після кожної правки (`PostToolUse`).

## Граф блокувань

```
01 → 02, 03                   (керовані блоки й визначення харнесів → MCP-конфіги, skill і deny)
04, 05, 06                    (MCP context/validate_spec, scaffold, фіча й feature_status — незалежно)
06 → 03                       (skill описує цикл з feature_status)
07 → 09                       (baseline → хук)
08 → 09                       (check --changed → хук)
06 → 10                       (external у критерії фічі)
02, 03, 06, 09 → 11           (ручна перевірка на чужих репо, людина)
```

## Тікети

| # | Тікет | Статус |
|---|---|---|
| 01 | [`init --agents`, `keylang agents`, блоки `AGENTS.md`/`CLAUDE.md`](issues/01-agents-managed-blocks.md) | ready-for-agent |
| 02 | [MCP-конфіги чотирьох харнесів](issues/02-mcp-configs.md) | ready-for-agent |
| 03 | [Skill `keylang-feature` і deny на правила](issues/03-skill-and-rules-deny.md) | ready-for-agent |
| 04 | [MCP `context` і `validate_spec`](issues/04-mcp-context-validate.md) | ready-for-agent |
| 05 | [MCP `scaffold`](issues/05-mcp-scaffold.md) | ready-for-agent |
| 06 | [Файли фіч і `feature_status`](issues/06-features-and-status.md) | ready-for-agent |
| 07 | [`rules.baseline.md` з `init`](issues/07-rules-baseline.md) | ready-for-agent |
| 08 | [`check --changed`](issues/08-check-changed.md) | ready-for-agent |
| 09 | [Хук `Stop` для Claude, Codex, Cursor](issues/09-stop-hook.md) | ready-for-agent |
| 10 | [Інтеграція через `planned module external.<pkg>`](issues/10-planned-external.md) | ready-for-agent |
| 11 | [Перевірка на чужих репо через Claude Code і Codex](issues/11-dogfood-harnesses.md) | ready-for-human |

<!-- shiftwork:tickets:start -->
| NN | title | status | last route |
| -- | ----- | ------ | ---------- |
| 01 | `init --agents`, `keylang agents`, блоки `AGENTS.md`/`CLAUDE.md` | resolved |  |
| 02 | MCP-конфіги чотирьох харнесів | needs-info | opencode-go/glm-5.3 |
| 03 | Skill `keylang-feature` і deny на правила | needs-info | opencode-go/deepseek-v4.1-flash |
| 04 | MCP `context` і `validate_spec` | resolved |  |
| 05 | MCP `scaffold` | resolved |  |
| 06 | Файли фіч і `feature_status` | resolved |  |
| 07 | `rules.baseline.md` з `init` | resolved |  |
| 08 | `check --changed` | resolved |  |
| 09 | Хук `Stop` для Claude, Codex, Cursor | resolved |  |
| 10 | Інтеграція через `planned module external.<pkg>` | resolved |  |
| 11 | Перевірка на чужих репо через Claude Code і Codex | ready-for-human |  |
<!-- shiftwork:tickets:end -->
