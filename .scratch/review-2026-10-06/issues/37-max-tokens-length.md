# 37: Обрізана відповідь моделі (max_tokens / length) приймається як повна і записується

**Status:** ready-for-agent

**Type:** code

**Blocked by:** None (can start immediately)

**Verify:** `npm run typecheck` · `npm test`

**Джерело:** [рев'ю 2026-10-06](../../../docs/review-2026-10-06.md) §2, рівень **P2**, зона `servers`, верифікація: confirmed.

**Місце:** `src/llm.ts:215` (рецензент указав `src/llm.ts:215`)

## Що не так

`anthropicComplete` відхиляє лише `stop_reason === "refusal"` і порожній текст, а `openrouterComplete` взагалі не дивиться на `finish_reason`. Відповідь, яку обрізав ліміт токенів, повертається як повна. Через це `explain --llm` зберігає обрізаний текст як свіжий, а `spec-to-code --mode llm` (fallback `?? answer` у spec-to-code.ts:675, коли немає закривальної огорожі) вставляє в код рядок ```` ```typescript ```` і недописану функцію.

## Сценарій збою

Модель вичерпує `max_tokens`: `explain <id> --llm --full` (4096 токенів, `lang: uk`, п'ять розділів) або `spec-to-code --mode llm` (8192 токени). У першому випадку `keylang/explain/<id>.md` отримує речення, обірване посередині («…повертає загальну су»), має позначку `fresh` і повторно не запитується. У другому випадку `--apply` пише в `src/domain/order.ts` рядок ```` ```typescript ```` і обірване `return items.reduce((a, b) => a +`, а код виходу 0.

## Як відтворити

Фікстура scratchpad/review/servers/repo (keylang.json з `agent: anthropic:claude-opus-5`, src/domain/order.ts). Фейковий сервер fake-anthropic*.mjs відповідає `stop_reason:"max_tokens"`. 1) `ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:<port> keylang explain domain.order.total --llm --full`: exit 0, файл `keylang/explain/domain.order.total.md` має обрізаний текст, повторний запуск друкує `· fresh` без запиту. 2) Додано `planned fn domain.order.refund (id: string) → number` і крок; `keylang spec-to-code domain.order.refund --mode llm --apply` друкує «src/domain/order.ts written», exit 0. Після цього у файлі стоять ```` ```typescript ```` і незакрита функція.

Доказ верифікатора:

> I reproduced both cases myself on a fresh fixture. Everything is under scratchpad/verify/servers-0-0/. The fixture is a git repo with keylang.json `{layers:{domain:"src/domain/**"}, agent:"anthropic:claude-opus-5"}` and `src/domain/order.ts` containing `total`. The model is a local fake server, `fake.mjs`, bound to 127.0.0.1 on port 0. It always answers `stop_reason:"max_tokens"` and logs the max_tokens it receives. HOME and XDG_* point at the scratch dir.
> 
> 1) explain:
> `ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:$PORT node .../bin/keylang.js explain domain.order.total --llm --full`
> Output: "## Для чого / Функція підсумовує ціни позицій замовлення і повертає загальну су / anthropic:claude-opus-5 · 2026-10-06 · fresh", exit=0.
> The file keylang/explain/domain.order.total.md gets the header `<!-- keylang:explain ... closure=898d3e85... detail=full -->` and the cut-off text. A second run prints the same text with "· fresh" and exit 0. The server log has only one `POST /v1/messages?beta=true max_tokens=4096`, so the truncated answer is cached as fresh and never requested again.
> 
> 2) spec-to-code:
> I added keylang/features/refund.md with `planned fn domain.order.refund (id: string) → number` and a step. The fake server replied with ``` ```typescript\nexport function refund(id: string): number {\n  const items = [1, 2];\n  return items.reduce((a, b) => a + ``` and `stop_reason:max_tokens`. I ran `... spec-to-code domain.order.refund --mode llm --apply`.
> Output: a diff "+```typescript / +export function refund... / +  return items.reduce((a, b) => a +", then "keylang: src/domain/order.ts written; run `keylang map`...", exit=0. src/domain/order.ts now holds the ```typescript line and the unfinished function. The log shows max_tokens=8192.
> 
> Code path:
> - src/llm.ts:215 rejects only `stop_reason==="refusal"`, and :220 rejects only empty text. `max_tokens` is not checked.
> - openrouterComplete (src/llm.ts:226-286) does not read `finish_reason` in either the JSON branch or the SSE branch.
> - spec-to-code.ts:675 `/```[a-zA-Z]*\n([\s\S]*?)```/.exec(answer)?.[1] ?? answer`: with no closing fence it falls back to the whole answer, opening fence included. The only check after that is the name regex, which passes.
> 
> Contract: docs/tui.md:181 says a bad answer means exit 2 with nothing written. That is only spelled out for a missing function or an empty answer. docs/tui.md:95 does show the project knows answers get cut "на межі токенів" and discards them, but only in …

## Що зробити

- У anthropicComplete кидати помилку при stop_reason "max_tokens", а в openrouterComplete — при finish_reason "length" (і в JSON-, і в SSE-гілці). У spec-to-code вимагати закриту огорожу замість `?? answer`, щоб обрізана відповідь давала код 2 без жодного запису.

## Критерії готовності

- [ ] спершу регресійний тест, що відтворює сценарій вище і падає на поточному коді (мінімальна фікстура на тимчасовій копії, через справжній CLI, якщо можливо)
- [ ] виправлення в `src/llm.ts` (і пов'язаних місцях з розділу «Що зробити»); тест зелений
- [ ] якщо змінюється задокументований контракт — оновити `docs/` (semantics.md, cli.md, tui.md, snapshot.md чи відповідний ADR) і `llm.txt`
- [ ] у `docs/review-2026-10-06.md` позначити пункт ✔

**Межі:** лише цей дефект; суміжні знахідки — окремими тікетами з цієї ж теки.

## Comments
