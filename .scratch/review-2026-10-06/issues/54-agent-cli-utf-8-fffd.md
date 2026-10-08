# 54: Вивід agent CLI декодується по чанках: UTF-8 символ на межі 64 КіБ стає U+FFFD

**Status:** resolved

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `servers`, верифікація: confirmed.

**Місце:** `src/agent-cli.ts:628` (рецензент указав `src/agent-cli.ts:628`)

## Що не так

`runInvocation` робить `chunk.toString()` для кожного чанка stdout окремо, без `StringDecoder`/`setEncoding`. Багатобайтовий символ на межі чанка (pipe читається по 64 КіБ) перетворюється на два `�`, і пошкоджений текст іде у відповідь (`stdout`, `result-json`, `opencode-events`).

## Сценарій збою

Власний CLI з agents.json або Claude Code (`result` у JSON-рядку, кирилиця не екранується) видає відповідь понад 64 КіБ з не-ASCII текстом (українські коментарі, `—`, `→`). Збережена відповідь чи пропозиція коду містить `��` замість символу.

## Як відтворити

scratchpad/review/servers/bin/bigcli пише `"a"+"я".repeat(40000)`, agents.json `{"clis":{"bigcli":{"command":["bigcli"]}}}`, HOME=scratch. `node utf8.ts` викликає `llmClient("cli:bigcli").complete(...)` і отримує: `length 40002 replacement chars 2` (очікувано 40001 і 0).

Доказ верифікатора:

> The code matches the claim. At src/agent-cli.ts:628, `runInvocation` does `const text = chunk.toString(); stdout += text;` and, for result-json, `pending += text`. It uses no StringDecoder or setEncoding (only src/trace-evidence.ts uses StringDecoder). `readAnswer` returns `run.stdout` for "stdout", `parseOpencodeEvents(run.stdout)` for opencode-events, and the result line parsed from the same text for result-json, so the damaged text reaches the answer in every mode. No doc covers this. docs/review-2026-10-05.md does not list it: line 114 only records agent-cli as "без зауважень" for process groups and the 16 MiB limit. So this is a new item, not a regression.
> 
> Repro, all in scratch: S=scratchpad/verify/servers-1-0, with HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME set to $S.
> 1) Fixture: $S/repo/src/main.ts with `export function hello`. `keylang init . --agents=none`, then set `"agent":"cli:bigcli"` in keylang.json.
> 2) $S/home/.config/keylang/agents.json is `{"clis":{"bigcli":{"command":["bigcli"]}}}`. $S/bin/bigcli runs `cat >/dev/null; exec node -e 'process.stdout.write("a"+"я".repeat(40000))'`.
> 3) `PATH=$S/bin:$PATH node /home/kosmodev/pet_project/keylang/bin/keylang.js explain main.main.hello --llm` gives exit 0. Both stdout and the saved keylang/explain/main.main.hello.md show `ya 39999 U+FFFD 2` (expected 40000 and 0). In stdout the first U+FFFD is at char idx 32768, right after the 65535th byte.
> 4) result-json path: $S/bin/claude wraps tests/fixtures/fake-agent.mjs (FAKE_AGENT_AS=claude), with FAKE_AGENT_REPLY="a"+"я"*40000 and agent cli:claude. Three of three runs saved `ya 39999 U+FFFD 2`. With reply "я"*40000, one run of three was damaged; whether it hits depends on how the reads line up with the bytes.
> Control: an awk CLI that writes 24 KB and flushes on character boundaries gave 0 U+FFFD over 5 runs. So the trigger is a single write or pipe read larger than 64 KiB that splits a multibyte character.
> Severity: the answer is accepted as ok and written with 2 replacement characters in place of one. It needs more than 64 KiB in one write or line, which is rare for real answers, so it is a minor edge case. P3 stands.

## Що зробити

- У runInvocation декодувати stdout через `new StringDecoder("utf8")` (`decoder.write(chunk)` у data, `decoder.end()` у close перед finish), ліміт рахувати в байтах як зараз; так само для stderr і cliVersion.

## Критерії готовності

- [x] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [x] виправлення в `src/agent-cli.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [x] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [x] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments

- 2026-10-08: Регресійний тест `agent CLI output over 64 KiB…` у tests/agent-cli.test.ts (справжній CLI, `explain --llm` через фейковий власний CLI і `cli:claude` з tests/agent-fixture.ts; відповідь `я`×40000 одним записом понад 64 КіБ, для result-json — два префікси з різною парністю) падав на старому коді: 2 U+FFFD у збереженому поясненні в обох режимах. Виправлення в src/agent-cli.ts: `runInvocation` декодує stdout і stderr через окремі `StringDecoder("utf8")` (`end()` у close перед finish; ліміт виводу, як і раніше, у байтах), `cliVersion` — так само. Допоміжна функція тесту теж читає вивід keylang через `setEncoding`. Задокументований контракт не змінився. `node --test tests/agent-cli.test.ts` — 24/24, `npm run typecheck` — чисто.
