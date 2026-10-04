# 09: `new module` пише `# flow <name>` у `features/`

**Status:** needs-triage

**Type:** design

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test` · `node bin/keylang.js check`

**Джерело:** AI-пілот 2026-10-04: кандидат 5 (3 з 4 сесій здивовані), виправлення протоколу 7.

**What to build:** `keylang new module <name> --layer <layer>` створює `keylang/features/<name>.md` із заголовком `# flow <name>` і рядком `- planned module <layer>.<name>`. Це узгоджено з format.md §5 (`planned` дозволено лише на верху секції flow), але учасник, що просив модуль, отримує «потік» без тригера й кроків. Сам файл у `check` нічого не дає (`0 fail, 0 unverified, 0 ok`); прогалину показує лише `feature <name>`.

Відтворення (master `c408f53`, тимчасовий TS-репо після `init`, шар `users`):

```
$ keylang new module billing --layer users
keylang/features/billing.md: created
$ cat keylang/features/billing.md
# flow billing

- planned module users.billing
$ keylang check keylang/features/billing.md
0 fail, 0 unverified, 0 ok
$ keylang feature billing
keylang/features/billing.md:3:1: planned users.billing: planned `users.billing` is not implemented
1 gap(s)
```

## Що має вирішити людина

1. **Пояснення в шаблоні, без зміни граматики.** Той самий `# flow billing`, але з прозою під заголовком: «A feature file: the planned declarations below are what to build; `keylang feature billing` says what is still missing. Add `- trigger` and `- step` lines to describe the flow.» Сумісно, дешево.
2. **Новий вид секції `# feature <name>`**, де дозволено `planned` і посилання на потоки. Зміна граматики (format.md §2, §5), нова версія формату (pl-theory/35); `features/*.md` харнесів (harness-integration/06) теж треба переписати.
3. **Інша назва команди**: `new feature <name> --module <layer>.<name>` замість `new module`, той самий шаблон. Змінює CLI-API.

**Рекомендація:** 1 зараз (до проби з людьми), 2 — лише якщо проба покаже, що `# flow` у файлі фічі плутає людей так само, як AI.

- [ ] рішення записане тут; для 2 або 3 — у format.md / `docs/tools.md` і `--help`
- [ ] тест CLI: вміст файла `new module` за рішенням; `check` і `feature` на ньому не змінились (для 1)

Ключові файли: `src/cli.ts` (`new`), `docs/tools.md`, `tests/cli.test.ts`

## Comments
