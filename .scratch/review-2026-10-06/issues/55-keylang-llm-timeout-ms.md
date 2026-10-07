# 55: KEYLANG_LLM_TIMEOUT_MS понад 2^31-1 дає миттєвий таймаут

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P3**, зона `servers`, верифікація: confirmed.

**Місце:** `src/llm.ts:141` (рецензент указав `src/llm.ts:144`)

## Що не так

`timeoutMs` приймає будь-яке ціле `^[1-9]\d*$`, але значення йде в `setTimeout` (`callSignal`, llm.ts:174, і `deadline`, agent-cli.ts:605). Node обрізає все понад 2147483647 до 1 мс, тож будь-який запит одразу завершується «no answer within … ms».

## Сценарій збою

Користувач ставить `KEYLANG_LLM_TIMEOUT_MS=3000000000`, щоб довгі запити не обривалися. Кожен `explain --llm`, `draft`, `spec-to-code` чи ghost-запит падає за ~20 мс з повідомленням `no answer within 3000000000 ms (KEYLANG_LLM_TIMEOUT_MS)` і з TimeoutOverflowWarning у stderr.

## Як відтворити

`node overflow.ts` (scratchpad/review/servers) з env `KEYLANG_LLM_TIMEOUT_MS=3000000000`. Результат: `TimeoutOverflowWarning ... Timeout duration was set to 1.`, далі `cli:bigcli ERROR after 21 ms: cli:bigcli: no answer within 3000000000 ms (KEYLANG_LLM_TIMEOUT_MS)` і так само `openrouter:x/y ERROR after 129 ms`.

Доказ верифікатора:

> I reproduced it through the real CLI with Node v24.20.0. The fixture is a copy of tests/fixtures/repo in scratchpad/verify/servers-2-0/repo. The cli:claude case uses a fake `claude` wrapper around tests/fixtures/fake-agent.mjs, set to FAKE_AGENT_MODES=slow so it answers after 400 ms. HOME, XDG_CACHE_HOME and XDG_CONFIG_HOME all pointed at the scratch dir. keylang/explain was deleted before each run so every run made a fresh call. The command was:
> `PATH=$S/bin:/usr/bin:/bin KEYLANG_AGENT=cli:claude KEYLANG_LLM_TIMEOUT_MS=$T node /home/kosmodev/pet_project/keylang/bin/keylang.js explain app.checkout.checkout --llm`
> 
> - T=2147483647: printed "fake answer / cli:claude · 2026-10-06 · fresh", exit=0, and the fake was called once.
> - T=2147483648: "(node) TimeoutOverflowWarning: 2147483648 does not fit into a 32-bit signed integer. Timeout duration was set to 1." then "keylang: cli:claude: no answer within 2147483648 ms (KEYLANG_LLM_TIMEOUT_MS)", exit=2. The fake was never called (log dir empty), so the run aborted before the child got to answer.
> - T=3000000000: same result, "no answer within 3000000000 ms (KEYLANG_LLM_TIMEOUT_MS)", exit=2.
> 
> OpenRouter path: a local SSE stub on port 0 answered after 200 ms, with KEYLANG_AGENT=openrouter:x/y and OPENROUTER_BASE_URL set to 127.0.0.1. T=5000 gave "Stub answer.", exit 0. T=3000000000 gave the TimeoutOverflowWarning plus "keylang: openrouter: no answer within 3000000000 ms (KEYLANG_LLM_TIMEOUT_MS)", exit 2. The server was killed afterwards.
> 
> Cause: timeoutMs at src/llm.ts:141-145 accepts any `^[1-9]\d*$` with no upper bound. The value goes straight into setTimeout in callSignal (src/llm.ts:174) and in runInvocation (src/agent-cli.ts:605), and Node turns anything above 2^31-1 into 1 ms.
> 
> Docs: docs/cli.md:46 and :217 and docs/tui.md say only "milliseconds, default 600000" and give no maximum, so this is not documented behaviour. It is not listed in docs/review-2026-10-05.md.
> 
> Severity: P3 is right. It only happens with a deliberately huge value (more than about 24.8 days), and the error message names the variable, so the user can tell what went wrong.

## Що зробити

- У timeoutMs відхиляти (або обрізати до) значення понад 2147483647 з явним повідомленням, щоб у setTimeout ніколи не потрапляло число, яке Node перетворює на 1 мс.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/llm.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
