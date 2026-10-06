# 09: Правило `exports` порівнюється з таблицею публічних експортів

**Етап:** M1.1 · **Джерело:** design §3.3 `exports`, review RV06

**What to build:** Знімок містить таблицю публічних експортів модуля: локальне ім'я → символ і вид (fn, value, class, type, alias, default, re-export із резолвінгом `export * from`). Правило `exports` порівнює перелік із цією таблицею, а не з fn без коментаря `internal`. Зайвий експорт — K104 із видом символу; відсутність у таблиці заявленого імені — окрема діагностика (absence). Re-export із `opaque`-модуля — `unverified`.

**Blocked by:** 06 (правила на знімку)

**Status:** resolved

- [x] відтворення RV06 (`export { extra }`, `export const secretFlag`, `export class`, `export type`) із правилом `exports allowed` → K104 для кожного з чотирьох, із видом
- [x] `export { a as b }` порівнюється за `b`; `export default` — за `default`; `export * from "./x"` розкривається до імен `x`
- [x] `exports` із іменем, якого модуль не експортує, дає діагностику absence
- [x] у карті fn без експорту й далі позначена `<!-- internal -->`, але правило від цього не залежить
- [x] `docs/semantics.md` §7 уточнення для `exports` оновлене

## Answer

Таблиця експортів схеми 4: `form` alias/default/reexport, розкриття `export * from` без `default`, рядок `*` для невідомого джерела. Імена `exports` — не ID карти (без K001). `export default function main` — `default`. Локально експортована fn без `internal`.
