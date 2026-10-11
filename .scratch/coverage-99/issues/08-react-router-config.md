# 08: React Router: `route()`/`index()`/`layout()`/`prefix()` у `routes.ts`

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md)

**What to build:** Зараз `routes.ts` без `flatRoutes()` — дірка (`src/frameworks/react-router.ts`). Читати літеральні виклики `route(path, file, [children])`, `index(file)`, `layout(file, [...])`, `prefix(p, [...])`, змішані з `...await flatRoutes()`; нелітеральне — дірка з причиною. Префікс мультисайту Storefront Next (`app.url.prefix` у `config.server.ts`) — `note` на entry.

- [ ] фікстура з вкладеними `layout`/`prefix`: URL і `(layout)`
- [ ] дірка лишається лише для нелітерального

## Comments
