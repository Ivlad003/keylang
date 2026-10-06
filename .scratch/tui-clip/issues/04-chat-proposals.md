# 04: Пропозиції з чату через MERGE

**Status:** ready-for-agent

**Type:** code

**Blocked by:** 03

**Verify:** `node --test tests/tui-clip-proposals.test.ts` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check --strict`

**Джерело:** spec §3, §4.5, П4; [ADR 0021](../../../docs/adr/0021-tui-clip-chat.md) п. 4; MCP `apply_diff` (`src/mcp.ts`), `proposalProblem` і `writeProposal` (`src/proposals.ts`)

**What to build:** Коли відповідь моделі містить блок `keylang path=<файл>` з повним текстом рукописної специфікації, чат записує його як пропозицію з тією самою брамою, що в `apply_diff`. Людина відкриває її в MERGE клавішею `m`. Сам чат жодного файла специфікації чи коду не змінює.

- **Розбір.** Перший блок `keylang path=<p>` у відповіді стає кандидатом. Решта блоків відкинута з приміткою. Текст відповіді без блоку йде в історію.
- **Брама.** `proposalProblem` з тим самим предикатом згенерованих файлів, що в `apply_diff`. До неї три відмови: буфер цілі не збережено; для цілі вже чекає пропозиція; ціль — не `.md` під каталогом специфікацій («код пише харнес»).
- **Запис.** `writeProposal`. Чат пише «пропозиція: `<p>` · m — MERGE», рядок стану показує `≈ N proposal(s): m`.

- [ ] тести тікета — у новому файлі `tests/tui-clip-proposals.test.ts`
- [ ] e2e з `mockModel`, що відповідає текстом і блоком для `keylang/flows/checkout.md`: з'являється `.keylang/proposals/keylang/flows/checkout.md`, `m` відкриває MERGE. До `w` дерево файлів, крім `.keylang/proposals/` і `.keylang/chat/`, не змінилося (`treeBytes`). Після `w` файл має текст моделі
- [ ] відмови, кожна з причиною в чаті й без запису: ціль `keylang/map/app.md` (згенерована); незбережений буфер цілі; для цілі вже чекає пропозиція; ціль `src/app.ts`; шлях `../outside.md`
- [ ] два блоки у відповіді: записано лише перший, примітка про другий
- [ ] блок для нового файла `keylang/flows/refund.md`: пропозиція нового файла, як в `apply_diff`
- [ ] `state.analysis.verdicts` до `w` той самий
- [ ] `docs/tui.md`, розділ «Скрепка»: пропозиції з чату, відмови

## Comments

### Notes

- 2026-10-06 (тікет написано): повний текст файла, а не diff — припущення П4 спеки. Так у чату та сама брама й той самий MERGE, що в `apply_diff`.
