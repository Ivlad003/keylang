# 12: `entry` обходить лише реальні ребра знімка

**Етап:** M1.1 · **Джерело:** design §3.3 `entry`, review RV12

**What to build:** Досяжність від `entry` іде ребрами знімка (import, call, re-export); ієрархія ID не робить батьків, дітей і сусідів досяжними. Недосягнутий модуль звітується як «не досягнуто в моделі» (absence, K103) із зазначенням покриття області: якщо у графі є нерозв'язані ребра, що могли б вести до модуля, результат `unverified`, а не absence. Тека-модуль без власного коду не «досягається» сама по собі.

**Blocked by:** 06, 07

**Status:** resolved

- [x] відтворення RV12 (`main.pkg.live`, `main.pkg.dead` без ребер, `entry main.pkg.live`) → K103 для `dead`
- [x] `index.ts`, що re-export-ить сусідів, робить їх досяжними через ребро re-export, а не через ієрархію
- [x] за наявності unresolved-ребра з досяжного модуля недосягнутий модуль отримує `unverified` з причиною
- [x] очікування для слайдової фікстури й карти keylang (`keylang/rules.md` entry) оновлені після перевірки нового контракту
- [x] `docs/format.md` §7 «entry» оновлено

## Answer

Досяжність ребрами import/call/type/re-export; теко-модуль без коду не звітується; K103 вказує на файл модуля; `unverified` називає прогалину. Тест `entry follows re-exports, skips directory modules, and names the hole`.
