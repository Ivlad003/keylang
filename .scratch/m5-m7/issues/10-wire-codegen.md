# 10: `keylang wire`: типізований `keylang.gen.ts`

**Етап:** M6 · **Джерело:** design §6; батьківський 34

**What to build:** `keylang wire` генерує `keylang.gen.ts` за контрактом ADR: фабрики з типами з вихідного коду, `when` як звичайний умовний код, `compose` як обгортка, async init/dispose. `wire --check` порівнює без запису. Відповідність залежностей перевіряє той самий `check` незалежно від контейнера.

**Blocked by:** 09

**Status:** resolved

- [x] згенерований контейнер фікстури проходить `tsc --noEmit`
- [x] `wire --check` дає 1 на застарілий файл і нічого не пише
- [x] однакові джерела → байт-в-байт однаковий `keylang.gen.ts`

## Answer

`keylang wire [--check] [--out f]` (`src/wire-gen.ts`): мемоізований builder на фабрику, `when` будує лише обрану гілку, `compose` обгортає, dispose у зворотному порядку, відкат на помилці. `env` з `globalThis.process` (без типів Node), розширення імпортів — за `tsconfig`. Тести `tests/wiring.test.ts`: `tsc` приймає згенерований файл і відкидає несумісну фабрику (TS2322); runtime-порядок для обох гілок `when`; відкат; `--check` без запису; ручний файл не перезаписується; байт-в-байт повтор; `check` застосовує `deny` до `keylang.gen.ts` як до звичайного модуля.
