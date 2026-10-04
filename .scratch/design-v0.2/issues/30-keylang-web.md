# 30: `keylang web`: той самий TUI у браузері через WebSocket + xterm.js

**Етап:** M4 · **Джерело:** design §7.2, §7.4 (без PTY, без CDN)

**What to build:** `keylang web` піднімає `node:http` + `ws` на localhost; Ink пише в потік, прив'язаний до WebSocket; вшитий xterm.js рендерить ANSI і повертає події клавіатури/мишки. Перевіряється еквівалентність основних дій: resize, мишка, вставлення, Unicode/IME, перепідключення. Переходи в код — OSC 8-посилання `vscode://`.

**Blocked by:** 29

**Status:** resolved

- [x] сценарій «відкрити flow → навести на крок → перейти в код» працює в терміналі та в браузері з тим самим результатом аналізу
- [x] xterm.js у пакеті, без завантаження з мережі; розмір tarball записаний

## Answer

`keylang web [--port] [--host]` — `src/tui/web.ts` (`node:http`, сторінка, `/assets/` з xterm.js, `xterm.css`, addon-fit) і `src/tui/websocket.ts` (власний RFC 6455 замість `ws`, ADR 0001). Той самий `App`, що в терміналі; сесія переживає розрив (перепідключення за ID з `sessionStorage`). Токен у URL, 403 без нього й для чужого `Origin`, 421 для чужого `Host` на loopback. `tests/web.test.ts` через справжній CLI: екрани hover і переглядача коду в браузері байт-у-байт збігаються з термінальною сесією; resize, SGR-мишка, bracketed paste, не-ASCII (текст IME), перепідключення, OSC 8 `vscode://file/…:line`. xterm.js — devDependency, копіюється в `dist/web/` на `prepack`; tarball 568 КБ (4.2 МБ розпаковано), runtime-залежностей 2; `keylang web` з установленого tarball перевіряє `tests/cli.test.ts` на Node 22.18 і 24.20.
