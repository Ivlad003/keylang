# 05: Rust: бібліотечний API, trait-диспетчеризація, тести, async main

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js map --check` · `node bin/keylang.js check`

**Джерело:** [spec](../spec.md)

**What to build:** `pub` елементи `lib.rs` крейта (та re-export) — entry `lib` (новий вид у `ENTRY_KINDS`, документувати); `#[tokio::main]`/`#[actix_web::main]` — `main`; `#[test]`/`#[tokio::test]` — `test`-корені для окремої метрики; виклик методу trait через `dyn Trait`/generic — ребра до всіх `impl` репо (як `may be called by the base class`). Дослідити решту orphans voice-transcriber і записати категорії в Comments.

- [ ] voice-transcriber: M3 ≥ 99 % живого коду або кожна непокрита fn у звіті з причиною
- [ ] фікстура крейта з lib+bin+trait

## Comments
