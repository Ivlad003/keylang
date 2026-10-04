# 01: Тег JSX компонента — ребро `call` у `.tsx` і `.jsx`

**Джерело:** research «Пропозиція» п. 1; «Що потрібно, щоб підтримати TSX» кроки 1, 2, 3, 5; таблиця «Зіткнення».

**What to build:** У файлі `.tsx` (граматика `tsx`) і `.jsx` / `.js` (граматика `javascript`) тег, що називає компонент, дає ребро `call` від функції, у чиєму тілі він стоїть, до цього компонента. `keylang map` показує, що `Page` викликає `Cart` і `Cart.Item`; `check` підтверджує крок потоку `Page -> Cart` як `static ok`. Знімок будь-якого репозиторію без JSX-тегів не змінюється: той самий список декларацій і викликів, той самий `snapshotId`.

Правила тега:
- `<Cart />` і `<Cart></Cart>` — один виклик `Cart`; закриваючий тег другим ребром не стає. `<Cart<Props> />` цілить у `Cart`, аргументи типу відкидаються.
- `<Cart.Item />`, `<motion.div />`, `<React.Fragment />` — member, як виклик `Cart.Item()`. `Fragment` за текстом окремо не відсікати.
- `<>…</>` (без імені), `<svg:path />` (namespace), identifier з малої першої літери (`<div />`, `<my-button />`) — ребра немає, навіть якщо fn `div` існує.
- Ім'я тега резолвиться тим самим шляхом, що callee виклику (`bound` для параметра чи локального значення — дірка, не `ok`).
- Тег у вкладеній стрілці (`items.map(() => <Cart />)`) має `closure`; тег на верхньому рівні модуля — виклик модуля.
- Запит JSX — окремий від запиту викликів і компілюється лише для граматик `tsx` і `javascript`. Спроба компілювати його на `typescript` падає з `Bad node name`, тож спільний запит зламає `check` на першому `.ts`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Фікстура `.tsx`: `Page` викликає `Cart` і `Cart.Item`; не викликає `div`, фрагмент, `svg:path`, `my-button`; `<Cart<Props> />` цілить у `Cart`; тег у `.map` має `closure`; `<Comp />` для параметра — hole, не `ok`
- [x] Та сама фікстура як `.jsx`: ті самі ребра (граматика `javascript`), окремої граматики `jsx` не додано
- [x] Регресійна фікстура `.ts` у стилі Nest/Express (`@Get`, `@Injectable`, `<Foo>value`, `<T>(x: T) => x`, `forwardRef(() => Token)` з `@nestjs/common`, `a < b && c > d`): декларації, виклики й `snapshotId` байт у байт ті самі, що й до зміни
- [x] `.ts` з літеральним `<Cart />` і далі opaque з parse error, без ребра
- [x] `check` на репозиторії з `.ts` і `.tsx` разом проходить: запит JSX не компілюється для `typescript` і не ламає прогін
- [x] Канонічна карта `tests/fixtures/repo` та інші expected-фікстури не змінилися
- [x] `docs/format.md` («Мови»): один абзац про JSX-тег як виклик і правило малої літери
- [x] `npm run typecheck`, `npm test`, `node bin/keylang.js map --check`, `node bin/keylang.js check` зелені

## Comments

- 2026-09-29 (агент): зроблено, не закомічено. `src/extract/ts.ts`: окремий `JSX_QUERY` (тільки для граматик `tsx` і `javascript`), `componentOfTag` через той самий `calleeFact`; факти двох запитів зливаються в порядку джерела. Тести: три `jsx:` у `tests/analyzer.test.ts` (`.tsx`, `.jsx`, регресія Nest на `.ts`). Ручна перевірка: `snapshotId`, вузли й ребра Nest-фікстури до і після зміни збігаються. Спостереження для графа: два теги одного компонента в одній fn дають одне ребро (граф дедуплікує однакові цілі), `<Comp />` через параметр — unresolved-ребро, як виклик параметра. `docs/format.md` абзац у «Мови». Карта перегенерована (`keylang/map/extract.md`, `map-explained/extract.md`). `npm run typecheck`, `npm test` (444), `map --check`, `check` зелені.
