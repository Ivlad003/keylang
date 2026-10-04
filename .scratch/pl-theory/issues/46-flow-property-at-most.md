# 46: `at-most <N> <id>`: верхня межа кількості викликів

**Джерело:** research-pl §5 Р-13; знахідка 3; рішення Q23 (spec)

**What to build:** `- at-most <N> <id>` стоїть у тих самих позиціях, що `never` (45). Він означає, що в межах кожного виклику області `<id>` викликається не більше N разів. N — невід'ємне десяткове ціле, інакше K005. `at-most` — один токен, контекстне ключове слово лише в потоках (ADR 0008). `at-most 0 <id>` дозволено, і вердикт у нього той самий, що в `never <id>`. `fmt` цю форму не переписує.

Вердикти рядка `trace`:
- `fail` — у піддереві span області більше N spans `<id>`. Повідомлення містить кількість, межу й тест. Спостережене перевищення дає `fail` і в неповному запуску;
- `ok` — запуск завершений, `dropped: 0`, `<id>` є в `instrumented`, у кожній області ≤ N spans і немає spans `<id>` в інших деревах викликів;
- `unverified` — в інших випадках.

Вузол — той самий вид властивості з 45 (SpecIR `Flow.properties`), і символ `<id>` потрапляє у `flowSymbols` так само.

Евристика `quantitative()` (src/flows.ts:208-211) для прози `invariant` без тесту зараз дає `tests unverified … needs a separate predicate or test (quantitative or negative property)` (src/flows.ts:173). Після зміни причина називає нові форми `at-most <N> <id>` і `never <id>`.

Нове слово має потрапити в EBNF-блок format.md і в перелік K004 (src/parser.ts:590), інакше тест 33 впаде.

**Blocked by:** 45 <!-- `never <id>` -->

**Status:** needs-triage

**Контракт:** нова граматика (контекстне `at-most`). JSON-вивід `check` отримує нові результати `trace` з `area` `at-most <N> <id>`. Змінюється текст причини `quantitative()` у `tests unverified`, вердикт той самий. Сумісно: жоден валідний текст не змінює значення.

## Що має вирішити тріаж

- Коли брати: після 45 і заморожування v1 (Q23).

- [ ] `at-most x a.b`, `at-most -1 a.b` і `at-most 3` дають K005 з позицією. Коректна форма ідемпотентна у `fmt`.
- [ ] CLI-тест: 3 spans при `at-most 2` дають `trace fail` з кількістю, межею й тестом, так само з `complete: false`. 2 spans дають `ok`, 1 span із `complete: false` — `unverified`.
- [ ] `at-most 0 <id>` дає ті самі вердикти, що `never <id>`, на тих самих trace.
- [ ] Тест «a count or a negation needs its own predicate» (tests/flows.test.ts:556) оновлено під нову причину.
- [ ] EBNF-блок і перелік K004 оновлено, тест 33 зелений. format.md §5 і «Flows: докази кроку» описують форму.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/parser.ts`, `src/flows.ts`, `src/trace-evidence.ts`, `docs/format.md`, `tests/flows.test.ts`

## Comments

- 2026-10-04 — рішення людини: реалізація після заморожування v1 (design-v0.2/40); ADR — 0009, не 0008. Статус needs-triage лишається до freeze.
