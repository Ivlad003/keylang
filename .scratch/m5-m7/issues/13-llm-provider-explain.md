# 13: LLM-провайдер і пояснення вузла з кешем

**Етап:** M7 · **Джерело:** design §5.4, §7.3; батьківський 35

**What to build:** Адаптер `agent = "anthropic:<model>" | "openrouter:<model>"` у `keylang.json` через `fetch` + SSE, ключ з env чи файлу з правами 0600; базова URL перевизначається для локального мок-сервера. `explain <id> --llm` (short/full, `explain.lang`) зберігає пояснення в `.keylang/explain/<id>.md` з рядком `модель · дата · stale?`; stale за fingerprint з 11; кеш читається офлайн; `explain --stale` перелічує застарілі. Без ключа — зрозуміле повідомлення й algo-зведення.

**Blocked by:** 11, 12

**Status:** resolved

- [x] тест із локальним мок-сервером (без зовнішньої мережі) зберігає пояснення і читає його повторно без запиту
- [x] зміна тіла → пояснення позначене stale
- [x] без ключа: зрозуміле повідомлення, код 0 з algo-зведенням; пояснення не впливає на `check`

## Answer

`src/llm.ts`: `anthropic:<model>` через офіційний `@anthropic-ai/sdk` (для Claude Opus 5 / Fable — серверний `fallbacks: "default"`, beta `server-side-fallback-2026-07-01`; `stop_reason: refusal` — помилка з категорією), `openrouter:<model>` — `fetch` + SSE (`eventsource-parser`). Ключі — env або `~/.config/keylang/<provider>.key` (0600, `src/keys.ts`); `ANTHROPIC_BASE_URL`/`OPENROUTER_BASE_URL` для мок-серверів. `src/explain-llm.ts`: промпт (зведення, код, сигнатури сусідів, шар), кеш `.keylang/explain/<id>.md` з baseline `closure`, `fresh|stale`, `unknown ids`, `explain --stale`. Конфіг `agent`, `explain.lang|detail`. Тести `tests/explain.test.ts`: один запит і офлайн-читання, stale після зміни тіла, `check` незмінний, без ключа — повідомлення й код 0, OpenRouter SSE.
