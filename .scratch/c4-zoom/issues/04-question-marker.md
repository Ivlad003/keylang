# 04: Рядок `- ? питання` у файлі фічі

**Джерело:** spec §4.2 B2, Р2; research-c4-zoom-tools §8 п. 6 (Spec Kit `[NEEDS CLARIFICATION]`); research-c4-zoom-literature §6 (Ambig-SWE, ClarifyGPT)

**What to build:** У файлах `keylang/features/*.md` елемент списку, що починається з `? ` (після маркера `- `), — відкрите питання. Парсер дає вузол `kind: "question"` з текстом і spans; він дозволений на будь-якій глибині під `flow`, `planned` і на верхньому рівні файла фічі, не має вкладених елементів (K004 як для інших листків). Поза файлом фічі — K001 з підказкою «questions belong to a feature file». `fmt` зберігає рядок без змін. `validate_spec` і `feature <slug>` рахують питання як `Gap{kind:"question"}` з позицією; питання тримає сходинку не вище `behavior`/`structure` залежно від місця (під `flow` → `behavior`, під `planned` → `structure`, верхній рівень → `idea`). У редакторі TUI друк `?` як звичайного символу не змінюється; доповнення після `- ` пропонує `? `. format.md: окремий підрозділ граматики файла фічі з EBNF-рядком `question`. Узгодити з тікетом заморожування design-v0.2/40: додати пункт у його список змін формату до v1.

**Blocked by:** 03

**Type:** code

**Status:** needs-triage

**Verify:** `npm run typecheck` · `npm test`

- [ ] `parse --json`: вузол `question` з текстом і spans; `fmt` ідемпотентний на файлі з питаннями
- [ ] питання в `flows/*.md` → K001 з позицією й підказкою
- [ ] `feature <slug>`: кожне питання — рядок прогалини з файлом і рядком; `--format json` має `kind: "question"`; сходинка обмежена за місцем
- [ ] MCP `validate_spec` повертає питання як прогалини, не як помилки
- [ ] format.md містить EBNF і приклад; design-v0.2/40 має пункт про `question`

## Comments
