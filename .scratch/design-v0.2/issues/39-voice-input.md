# 39: Голосовий ввід (`Ctrl+R`): local whisper.cpp або OpenRouter, опційні залежності

**Етап:** M7 · **Джерело:** design §7.3 «Голосовий ввід», §7.4

**What to build:** `voice.engine = local|openrouter|auto`; `@fugood/whisper.node` і `decibri` як `optionalDependencies` (без них — лише openrouter або зрозуміле пояснення); модель у `~/.cache/keylang/models` на вимогу; вікна ~25 с із перекриттям; глосарій до ~30 ID з околу курсора як prompt; за замовчуванням — у вільний текст, крихітна командна граматика («крок …», «коли … тоді …») для структури. У `keylang web` мікрофон із браузера тим самим WebSocket.

**Blocked by:** 38

**Status:** resolved

- [x] без опційних модулів `npx keylang` працює, `Ctrl+R` пояснює, що налаштувати
- [x] `doctor` показує стан моделі й мікрофона
- [x] тести не потребують мікрофона (мок PCM-потоку)

## Comments

- 2026-10-04 — тріаж (рішення 3А з HANDOFF-2026-10-02): усі критерії виконано тікетами m5-m7/25–26: «tui: Ctrl+R without an engine or a microphone explains what to set up…», tarball з `--omit=optional` (`tests/cli.test.ts`); `doctor` показує модель голосу й мікрофон; тести без мікрофона (мок PCM, web). Справжній whisper.cpp/decibri у CI — у дорожній карті format.md.
