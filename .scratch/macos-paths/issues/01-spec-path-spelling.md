# 01: Шлях специфікації через лінк над репозиторієм знаходить знімок (macOS)

**Status:** ready-for-human

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**What to build:** див. [spec](../spec.md). Відтворити на macOS і довести фікс з гілки `origin/wip/macos-path-spelling` (`git rebase master`). `ready-for-human`, бо потрібна macOS-машина: на Linux `/var` не лінк, і збій не відтворюється.

- [ ] на macOS відтворено «check finds the snapshot for any spelling of the spec path» (`tests/cli.test.ts`) і два tui-тести, де TUI пише `/var/…`, а CLI `/private/var/…` («fmt над текою», «chosen file narrows the report»)
- [ ] корінь підтверджено: розбіжність написання лінку над репозиторієм, а не інше
- [ ] фікс (`spelledUnder` або інший) — тести зелені на macOS і Linux
- [ ] «packed tarball runs the CLI from node_modules» із `ENOTCACHED` — середовище (мережа/кеш npm), не баг; за потреби лише задокументувати

## Comments

- 2026-10-04 (Linux): гілку не зливали — на Linux корінь не перевірити. Тікет заведено за HANDOFF-2026-10-04 («Завести тікет, якщо фікс лишається»).
