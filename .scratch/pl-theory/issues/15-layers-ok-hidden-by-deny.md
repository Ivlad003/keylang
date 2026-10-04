# 15: Рядок `layers` без `ok`, коли залежність угору вирішив `deny`; для `allow` evidence називає виняток

**Джерело:** research-pl §5 Р-3; знахідка 2; рішення Q10 (spec). Баг: код розходиться з format.md:261

**What to build:** Мінімальне відтворення: `keylang/rules.md` з `- layers domain < app` і `- deny domain app`, `src/domain/x.ts` імпортує `src/app/y.ts`. Зараз друкується лише K102, а рядок `layers domain < app` отримує `ok` «convergence: every dependency between `domain`, `app` points down…». Причина в тому, що гілки переможного `deny` і `allow` (src/rules.ts:201-211) виходять із циклу раніше за перевірку порядку. Шари ребра не потрапляють у `violated` (rules.ts:217-218), і рядок отримує `ok` (rules.ts:225, 234). Проте format.md §7 (format.md:261) дає `ok` лише тоді, «коли жодна залежність не порушує порядку його шарів».

Після зміни ребро, що суперечить порядку (`layerViolation` не null, rules.ts:389-395), враховується й тоді, коли його вирішило правило:
- **переможний `deny`:** шари ребра позначено порушеними, тож рядок `layers` лишається без вердикту, як при K101. На ребро одна знахідка, K102, окремої K101 немає;
- **переможний `allow`** («`allow` знімає K101 для своєї пари»): шари не порушено, і `ok` рядка лишається. Evidence називає виняток: «convergence: every dependency between `domain`, `app` points down or is allowed by `allow domain app`, and no dependency hole in the area». Якщо таких `allow` кілька, названо всі, відсортовані.

Ребро вниз за порядком, яке вирішив `deny`, порядку не порушує, тож `ok` рядка `layers` лишається з незмінним evidence.

format.md §7, пункт `layers`, описує випадки `deny` і `allow`.

Цей тікет і 14 правлять той самий цикл `evaluateOnSnapshot` (rules.ts:190-222). Міграція rules.ts на SpecIR (19) чекає на обидва й має зберегти цю поведінку.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Контракт:** семантика, несумісно. Зникає хибний `ok` рядка `layers`, коли ребро вгору вирішив `deny`: у `--format json` результату з цим criterion немає. Змінюється текст evidence `ok`, коли ребро вгору дозволив `allow`. Код виходу не змінюється, бо K102 уже дає 1.

- [x] Відтворення вище: stdout містить K102 у `src/domain/x.ts:1:1` і не містить K101. У `--format json` немає результату `layers domain < app` з `verdict: "ok"`, код виходу 1.
- [x] Та сама фікстура з `- allow domain app` замість `deny`: `layers domain < app` має `ok`, evidence містить `allow domain app`, код 0.
- [x] `- deny app domain` при імпорті `src/app/y.ts` → `src/domain/x.ts` (ребро вниз) дає K102, а `layers domain < app` лишається `ok` з evidence «points down».
- [x] Регресія: без `allow`/`deny` K101 `` divergence: `domain.x` depends on `app.y` (layers say `domain < app`, …) `` і рядок без вердикту, як раніше.
- [x] format.md §7, пункт `layers`, описує обидва випадки. Якщо еталон `spec-forms` (17) уже злито, його очікувані файли змінились лише тут, diff переглянуто.
- [ ] `npm run typecheck`, `npm test`; `node bin/keylang.js map` (diff переглянуто, разом із картою з поясненнями: `explain.map` увімкнено), `node bin/keylang.js map --check` = 0, `node bin/keylang.js check` на репозиторії — 0 fail.

Ключові файли: `src/rules.ts`, `tests/core.test.ts`, `docs/format.md`

## Comments

- 2026-10-01 — аудит під shiftwork: уже реалізовано; докази: 6dcdc78; тест `tests/rules-area.test.ts` «an upward edge denied by deny is not also K101; an allow is named on the layers line» (deny, allow, ребро вниз); format.md §7, пункт `layers`. Прогін `npm test` у межах аудиту не виконувався.
