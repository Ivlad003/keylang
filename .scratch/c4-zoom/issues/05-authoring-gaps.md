# 05: Прогалини авторства: прогноз `deny`, шар, сигнатура

**Джерело:** spec §4.2 B3, Р9, §1b; harness-integration/15 (агенти зупинялись на K102 від baseline); research-c4-zoom-literature §9 п. 9

**What to build:** `featureStatus` додає три перевірки файла фічі, усі стадії structure.

- **`deny`** — прогалина, блокує `done` (Р9). Для кожного ребра, яке з'явиться після реалізації, коли хоча б один його кінець ще `planned` і не реалізований. Викликач — `trigger` або найближчий батьківський `step`; ціль — `step` або кожна ціль `calls`; для `calls` верхнього рівня викликач — тригер. Ребро оцінює `denyingRule` (`src/rules.ts`, його вже використовує spec-to-code) за всіма специфікаціями правил і редакцією формату з конфігу, тож ручні правила мають перевагу над baseline (ADR 0013). Причина називає правило з файлом і рядком і каже, що робити: людина додає `allow <A> <B>` у `keylang/rules.md`, агент лише пропонує це через `apply_diff`. Коли обидва кінці вже є в коді, ребро судить `check` (прогалина `rule`), і прогноз зникає.
- **`layer`** — підказка: ID `planned` не починається з шару `keylang.json` чи `external`. Зараз такий `planned module` приймається мовчки (відтворено 2026-10-04), а реалізувати його з цим ID неможливо, тож його прогалина `planned` ніколи не закриється.
- **`signature`** — підказка: `planned fn` без сигнатури. Блокує лише стадію ready (Р9): сигнатура в промпті допомагає агенту (CodePromptEval), а після реалізації `planned` прибирається.

`--format json` і MCP `feature_status` віддають нові види без змін схеми з тікета 03.

**Blocked by:** 03, 04 (той самий `src/feature-status.ts`: послідовно, щоб зміни не конфліктували)

**Type:** code

**Model:** claude:claude-opus-5-5

**Status:** resolved

**Verify:** `node --test tests/authoring-gaps.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] тести тікета — у новому файлі `tests/authoring-gaps.test.ts`: Verify запускає його окремо, тож без нього тікет не закриється
- [x] e2e: baseline з `deny app domain`; фіча з тригером в `app` і кроком до `planned fn domain.x.y` → прогалина `deny` з `rules.baseline.md:N` і порадою про `allow`; з `allow app domain` у `rules.md` → прогалини немає
- [x] після реалізації обох кінців прогнозу немає, лишається звичайна оцінка правил
- [x] `planned module nolayer.thing` → підказка `layer`; `planned module external.stripe` → підказки немає
- [x] `planned fn` без сигнатури → підказка `signature` і `stage structure`; після реалізації `done` не блокується
- [x] tools.md і SKILL.md описують нові види

## Comments

- 2026-10-04 (Claude Code, сесія keylang-c9): зроблено без shiftwork. `denyGaps` у `src/feature-status.ts` перевикористовує `denyingRule` і `dependencyKindOf` (`src/rules.ts`); `FeatureInput` отримав `index`, `format` і `layers`, їх передають CLI-операція й MCP. Підказки `layer` і `signature` — на рядку `planned`. Тести — `tests/authoring-gaps.test.ts`.
- Порада залежить від власника правила: для заборони з baseline — `- allow <шар> <шар>` у `keylang/rules.md` через `apply_diff` (для пакета — `external.<pkg>`); для ручної заборони — план потребує іншого шляху. Інакше агент пропонував би `allow`, що програє ручному `deny` (deny-overrides у редакції 2).
