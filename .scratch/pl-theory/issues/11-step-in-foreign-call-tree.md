# 11: Крок, спостережений лише в іншому дереві викликів, — `unverified`, а не `missing step`

**Джерело:** research-pl §5 Р-5; знахідка 3; рішення Q13 (spec). Баг: `fail` без підтвердженої відсутності суперечить design §4.2 (docs/design.md:221-222) і §4.3: «Неповний trace не доводить відсутність кроку» (:249).

**What to build:** Адаптери Rust і Python роблять span з іншого потоку коренем trace (format.md:318; adapters/rust/keylang_trace.rs:43-44). Python будує вкладення за стеком окремого потоку (adapters/python/keylang_trace.py:133-134). У Rust і Python один годинник на процес (`rs-{pid}-…`, keylang_trace.rs:276; `py-{pid}-…`, keylang_trace.py:79), тож за `clockId` span іншого потоку не відрізнити. TS-адаптер у воркері пише корені з власним `clockId`.

Зараз крок, чий єдиний span лежить у такому корені, дає `trace fail … missing step in t1` (src/trace-evidence.ts:394-395). Так буває навіть із `links` на батька і хоча крок виконався.

Відтворення: CHECKOUT, завершений запуск, усі символи інструментовано. Spans: `a` checkout 1–10, `b` buy під `a` 2–9, `c` create під `b` 3–4, `d` save без батька на годиннику `worker` 1–2. Результат — `6:3: trace fail infrastructure.store.save: missing step in t1`, код 1 (S11). Те саме дають `d` з `links: ["b"]` (S11b) і `d` на тому самому годиннику 11–12, після тригера (S11c).

Після зміни діє таке правило. Під образом батька образу кроку немає, але в запуску є span цього символу в іншому дереві викликів, і цей span не почався раніше за образ батька на тому самому годиннику. Тоді вердикт — `unverified` з причиною `` observed outside `<parent>` in another call tree (root `<root>`): nesting unknown ``. Тут `<parent>` — символ образу батька, `<root>` — символ кореневого span того дерева. Дерево «інше», коли корінь ланцюжка `parentSpanId` span не збігається з коренем образу батька. Годинник на правило не впливає: з іншим `clockId` чи з тим самим вердикт однаковий.

`fail … missing step` лишається у трьох випадках:
- span символу в запуску немає ніде;
- усі spans символу лежать у тому самому дереві, що й образ батька, але поза ним;
- spans в іншому дереві почалися раніше за образ батька на тому самому годиннику.

Кроки з образом під батьком не змінюються. Для незавершеного запуску чи неінструментованого символу, як і зараз, першим спрацьовує `unverified` з `absenceDoubt` (:307-313). `links` кореневого span на образ батька не стають доказом вкладення (`ok`), це поза тікетом. Адаптери й схема JSONL не змінюються.

Тікет оновлює визначення `fail` у підрозділі «Семантика» (10), а не лише таблицю, і прибирає звідти застереження про корінь іншого дерева. У .keylang/trace/tui.jsonl є окремий корінь `tui.app.App.reanalyze`, але той самий крок має образ під батьком. Тож вердикти `@flow tui` не змінюються (перевірено на поточних файлах).

**Blocked by:** 10 (семантика flows)

**Status:** resolved

**Контракт:** змінюється семантика вердикту trace: `fail` → `unverified` для кроку, спостереженого лише в іншому дереві викликів. Через це код виходу `check` без `--strict` на такому запуску змінюється з 1 на 0, з `--strict` лишається 1. Зміна несумісна (виправлення надійності), її треба записати в «Несумісних змінах» spec. Форма JSON, адаптери й схема trace не змінюються.

- [x] CLI-тест у tests/flows.test.ts на завершеному інструментованому запуску. `save` лише як кореневий span на годиннику `worker` дає `trace unverified` з «observed outside `application.purchase.buy` in another call tree» (S11). Те саме дає span з `links: ["b"]` (S11b) і кореневий span на тому самому годиннику, що почався після тригера (S11c).
- [x] Кореневий span `save` на тому самому годиннику, що почався раніше за образ `buy`, дає `trace fail … missing step in t1`. `save` під тригером, але поза `buy`, теж дає `fail … missing step`.
- [x] Наявні перевірки проходять без змін: тест «a removed step fails in a complete run…» (:490) і частина «No invocation of the trigger runs `save`» тесту :593 (:616-619).
- [x] На S11 `check` дає 0, а `check --strict` — 1 через `unverified`. У `check --format json` рядок має `criterion: "trace"` і `verdict: "unverified"`, stdout — чистий JSON.
- [x] format.md описує правило в трьох місцях: визначення `fail` у «Семантиці», колонки `unverified` і `fail` рядка `trace` таблиці (:279), описи адаптерів TS (:312), Python (:316) і Rust (:318). Адаптери мають казати, що вкладення кореневого span невідоме і такий крок дає `unverified`. Застереження з тікета 10 прибрано.
- [ ] `npm run typecheck` і `npm test` зелені. `node bin/keylang.js map` виконано, diff переглянуто, зокрема карту з поясненнями (`explain.map` увімкнено). `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/trace-evidence.ts`, `docs/format.md`, `tests/flows.test.ts`; для довідки — `adapters/rust/keylang_trace.rs`, `adapters/python/keylang_trace.py`, `src/adapters/trace.ts`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; `src/trace-evidence.ts`; тест `tests/flows.test.ts` «a step seen only in another call tree is unverified, not a missing step» (S11, S11b, S11c, ранній корінь і те саме дерево → `missing step`, `check` 0, `--strict` 1); format.md «Семантика» і пункт зіставлення (:690). Прогін `npm test` у межах аудиту не виконувався.
