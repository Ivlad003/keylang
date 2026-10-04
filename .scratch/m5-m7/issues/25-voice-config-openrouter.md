# 25: Голос: конфіг, `doctor`, OpenRouter-рушій

**Етап:** M7 · **Джерело:** design §7.3 «Голосовий ввід»; батьківський 39

**What to build:** `voice.engine = local|openrouter|auto` у `keylang.json`; `Ctrl+R` без налаштувань пояснює, що налаштувати; OpenRouter-рушій шле WAV 16 кГц base64 як `input_audio`, вікна ~25 с з перекриттям, глосарій до ~30 ID з околу курсора; командна граматика «крок …», «коли … тоді …». `doctor` показує стан голосу.

**Blocked by:** 13

**Status:** resolved

- [x] без опційних модулів `npx keylang` працює, `Ctrl+R` пояснює налаштування
- [x] тест із мок-PCM і мок-сервером: текст вставлено, «крок …» → `- step`
- [x] `doctor` звітує стан моделі й мікрофона

## Answer

`src/voice.ts` (WAV, вікна 25/1 с і зшивання, глосарій ≤30, `matchId`, `speechToSpec`, `voiceEngine`, `transcribeOpenRouter`), `src/keys.ts`, `src/voice-local.ts` (опційні модулі; сам local/decibri — тікет 26), конфіг `voice`, TUI `Ctrl+R` (джерело PCM підміняється через `AppOptions.microphone`), `keylang doctor`. Тести: мок-PCM + мок-OpenRouter: WAV/base64/глосарій, «крок store save» → `- step infrastructure.store.save`; 30 с → 2 вікна, перекриття зшито; без рушія — пояснення; doctor.
