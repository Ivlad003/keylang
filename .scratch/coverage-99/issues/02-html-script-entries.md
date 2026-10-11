# 02: HTML `<script>`, Electron `main`, маніфест розширення — точки входу

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md)

**What to build:** Нова мовна точка входу `main` (Р1): `<script src>` / `<script type=module src>` у `*.html` джерел (SPA `index.html` → `main.tsx`; `renderer.html`), поле `main` кореневого `package.json` для Electron (є залежність `electron`), `manifest.json` розширення (`background.service_worker`/`scripts`, `content_scripts[].js`, `action.default_popup` → його `<script>`). Інлайн-скрипт — модуль HTML з note. `docs/snapshot.md` «Точки входу без адаптера».

- [ ] circlecam: `desktop.js` і скрипти `renderer.html` — entries
- [ ] meet-unmirror: `content.js`, `popup.js` — entries
- [ ] health-tracker: `web/src/main.tsx` — entry; M3 зростає
- [ ] `src=` поза джерелами — дірка з причиною

## Comments
