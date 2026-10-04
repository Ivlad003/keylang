# 12: Якість brief-ів: короткий промт і повне тіло перевантаженої функції

**Джерело:** тікет 11, вибірка 40 brief-ів 2026-10-04 (`KEYLANG_AGENT=cli:claude`): 5 хибних із 40 (12,5 %), системні вади читання.

**What to build:**
- Промт `detail=brief`: прибрати рядок «Say plainly when the input does not show something» (12 із 40 brief-ів мали мета-коментарі «the input does not show…») і вимагати до двох коротких речень, ~200 символів, щоб текст не обрізався на 280 символах посеред думки (37 із 40).
- Перевантажена TS-функція: вузол має `line = endLine` першого перевантаження, тож тіло не потрапляє в промт (хибний brief `base.diag.diagnostic`). Давати в промт діапазон рядків реалізації разом із тілом.
- Позначка походження brief-а називає модель, а не лише харнес (`llm · claude` → `llm · claude:<model>`), якщо провайдер її знає.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Type:** code

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

- [x] тест: промт brief не містить рядка про невидимий ввід і має обмеження довжини
- [x] тест: для перевантаженої функції промт містить тіло реалізації (фікстура з двома сигнатурами й тілом)
- [x] позначка моделі в brief-і, де вона відома; наявні brief-и не стають `stale` без причини
- [x] docs/tools.md / ADR 0004 описують зміни, якщо вони зачіпають контракт

## Comments

- 2026-10-04 (агент), гілка `done/explained-map-12`:
  - **Промпт brief-а** (`src/explain-llm.ts`): «at most two short sentences … about 200 characters in all»; рядок «Say plainly when the input does not show something» для `brief` замінено на «Say only what the code does; no remarks about the input or what it leaves out». Для `short`/`full` рядок лишився: там відповідь читають як відповідь, а не в карті.
  - **Перевантаження** (`src/graph.ts`, `addDecl`): коли перевантаження стоять поспіль в одному файлі, `endLine`/`endCol` вузла тягнуться до реалізації. Тож у промпті (і в `context`/MCP, і для прив'язки рядків до fn у потоках) — усі сигнатури й тіло. Дублікат, оголошений далі (не поспіль), свій діапазон не розширює. Виправлено в графі, а не лише в промпті, бо діапазон вузла читають і інші місця; fingerprint і closure від `endLine` не залежать, тож baseline не змінився. Для keylang змінився лише `base.diag.diagnostic` (тепер рядки 81–90, було 81–81), у карті — лише номери рядків від зміщення коду.
  - **Підпис моделі** (`src/agent-cli.ts`, `src/llm.ts`, `src/operations.ts`): `parseResultLine` бере з `modelUsage` Claude Code модель із найбільшим `outputTokens`; `LlmCallOptions.onModel` передає її, і `answeringAgent` підписує відповідь `cli:claude:<модель>`, якщо в агента моделі немає. Агент із моделлю (`cli:claude:opus`) підписується як задано. codex/opencode/cursor/власні CLI модель не повідомляють — підпис лишається іменем агента. Модель з пробілом, `<`, `>` чи `--` відкидається (заголовок, ADR 0012). Формат реальної відповіді Claude Code (`modelUsage`) — припущення з документації CLI; у тестах лише фейк.
  - **Свіжість закомічених brief-ів.** Baseline brief-а — closure коду вузла; промпт і підпис у нього не входять. Тож 40 закомічених brief-ів лишаються свіжими: README карти з поясненнями — 40 LLM, 0 stale. Вони зберігають старий текст і підпис `llm · claude`, доки код не зміниться або їх не перегенерують явно (`explain <id> --llm --brief`). Описано в ADR 0004 «Наслідки» і docs/tools.md.
  - Тести: `tests/explained-map.test.ts` (промпт brief без «does not show» і з обмеженням; нова фікстура з двома перевантаженнями й тілом — червоний без змін у графі), `tests/agent-cli.test.ts` (фейк `claude` з `modelUsage`: brief-и підписано `cli:claude:claude-opus-5-5`, карта — `_(llm · claude:claude-opus-5-5 · …)_`; `cli:claude:opus` лишається як задано).
