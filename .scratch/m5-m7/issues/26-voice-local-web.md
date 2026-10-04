# 26: Голос: local whisper.cpp і мікрофон у `keylang web`

**Етап:** M7 · **Джерело:** design §7.3, §7.4; батьківський 39

**What to build:** `@fugood/whisper.node` і `decibri` як `optionalDependencies`; модель на вимогу в `~/.cache/keylang/models`; `auto` обирає local, якщо модель є. У `keylang web` мікрофон браузера шле PCM тим самим WebSocket до того самого рушія.

**Blocked by:** 25

**Status:** resolved

- [x] без опційних залежностей встановлення й тести проходять
- [x] тест WebSocket з мок-PCM доходить до рушія

## Answer

`src/voice-local.ts`: `decibri` (мікрофон) і `@fugood/whisper.node` (whisper.cpp) за API з їхніх README, форма перевіряється під час виконання; обидва в `optionalDependencies` (^1.1.3 стабільна, ^5.7.0). `keylang web`: NUL-префіксне керуюче повідомлення `mic on/off`, сторінка шле PCM `audio`/`audio-end`, сесія читає через `AudioQueue` (ліміт 10 хв). Тести: web — мок сторінки шле PCM, сервер відправляє WAV у мок-OpenRouter, пункт з’являється в редакторі; tarball з `--omit=optional` — CLI і `doctor` працюють. Ручна перевірка 2026-09-28 (`bench/results.md` «M7: голос на реальному залізі»): `ggml-tiny.en` розпізнає `jfk.wav`, два вікна склеюються без дубля, `decibri` дає 16 кГц із системного мікрофона. Вона знайшла помилку: `initWhisper` приймає `filePath`, не `model`, — виправлено. Тест whisper у `tests/explain.test.ts` запускається з `KEYLANG_TEST_WHISPER_MODEL`/`KEYLANG_TEST_WHISPER_WAV`; у CI моделі немає.
