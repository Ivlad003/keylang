# 03: представлення системи на сторінці діаграм

**Status:** resolved

**Type:** code

**Blocked by:** 02

**Verify:** `node --test tests/system-view.test.ts` · `npm run test:web` · `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** spec Р11

**What to build:** `view=system&name=` у `src/diagram.ts` (вузли видів компонентів, зони як групи, ребра зв'язків з дієсловом і підписом, вердикти), список систем у `/api/views`, фігури в `web/src/canvas.ts` (циліндр — БД, хмара — external/CDN, актор — клієнт, ромб/шестикутник — LB/gateway, черга — горизонтальна труба), стилі ребер за дієсловом (async — пунктир), група «Системи» в списку сторінки, панель «Вимоги» (requirement, nfr, estimate, tradeoff, ?) над полотном. Статичний експорт і `app.html` дають ті самі відповіді.

- [x] діаграма системи: компоненти в зонах, ребра з підписами й вердиктами
- [x] `/api/views` перелічує системи; невідома система — порожня діаграма з `reason`
- [x] e2e: сторінка показує систему, панель вимог і легенду фігур

## Comments

### Notes

- 2026-10-11: `src/diagram.ts`: `view=system|er|sequence`, `systemListing`, вузли `component`/`table`/`participant`/`anchor`, ребра `relation`/`message`/`lifeline`/`fk`, `Diagram.system` і `placed`. Компоненти поза зонами — над зонами. Read-API: `systems` у `/api/views`, вердикти зв'язків у панелі компонента. Статичний експорт питає системи окремо (без BPMN/draw.io).
- 2026-10-11: Сторінка: група «Система · <name>», перемикач «Схема · ER · ↧ seq» над полотном; нотатки інтерв'ю — у правій панелі, коли фігуру не вибрано (на полотні вони закривали схему). Фігури maxGraph: cylinder, cloud, hexagon; іконки у мітці.
- 2026-10-11: Тести: `tests/system-view.test.ts` (через статичний експорт), `tests/web-e2e/system.test.ts`.
