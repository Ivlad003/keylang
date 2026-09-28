# keylang

Мова опису застосунку, прив'язана до репозиторію: карта шарів і модулів, правила залежностей і потоки логіки у звичайному Markdown. Повний дизайн — [`docs/design.md`](docs/design.md), точна граматика — [`docs/format.md`](docs/format.md), огляд наукових статей і порівняння стеків — [`docs/research.md`](docs/research.md).

Стек: Node.js ≥ 22.18 + TypeScript. У репозиторії Node виконує `.ts` напряму (`node bin/keylang.js`). Перед публікацією `prepack` компілює `src/` у `dist/` і переписує відносні імпорти `.ts` → `.js`; встановлений пакет завантажує цей JavaScript і не компілює нічого в користувача. Дистрибуція через npm/npx.

## M0: що зроблено

Перший етап дорожньої карти (design.md §9): специфікація формату, парсер Markdown → IR і `keylang fmt`.

- `src/` — ядро без залежностей: IR (`ir.ts`), парсер з позиціями для кожного вузла й посилання (`parser.ts`), резолвінг ID між файлами (`resolve.ts`), діагностики K001–K006 (`diag.ts`), форматер (`fmt.ts`); `index.ts` — публічний API.
- `src/cli.ts`, `bin/keylang.js` — CLI `keylang`. У чекауті точка входу вантажить TypeScript; з `node_modules` — зібраний `dist/cli.js`.
- `docs/format.md` — специфікація формату з рішеннями Р1–Р14.
- `examples/shop` — приклад зі слайдів з навмисною помилкою `domain.aggregate`; `examples/shop-fixed` — виправлений.

## M1: що зроблено

Карта з коду й перевірка правил для TypeScript і JavaScript (ESM і CommonJS).

- `src/extract/` — факти з коду через `web-tree-sitter` (wasm-граматики з `@vscode/tree-sitter-wasm`): імпорти (`import`, `require`, `const { a } = mod`), оголошення (fn, класи з методами, типи), експорти, виклики.
- `src/imports.ts` — резолвінг імпортів: відносні шляхи, `tsconfig` `paths`/`baseUrl` з `extends`, `package.json` `imports`, пакети й вбудовані модулі.
- `src/graph.ts`, `src/emit.ts`, `src/map.ts` — граф модулів → `keylang/map/<шар>.md` (згенеровані, один файл на шар) і `.keylang/index.json` (не комітиться).
- `src/config.ts` — `keylang.json`; без нього шари вгадуються з дерева каталогів.
- `src/rules.ts` — `layers`, `allow`/`deny`, `entry`, `exports`, `no-cycles` → K101–K105 (divergence / absence).
- `keylang.json` + `keylang/` — keylang описує сам себе; `keylang check` у корені проходить чисто.
- `bench/` — бенчмарк на 8 репозиторіях, результати в [`bench/results.md`](bench/results.md).

## M4: що зроблено

TUI і браузерний варіант над тим самим `analyze()`, що CLI і LSP (`docs/format.md` §12, [ADR 0001](docs/adr/0001-tui-without-ink.md), [ADR 0002](docs/adr/0002-dependencies-by-value-ws.md)).

- `keylang` у терміналі — сирий Markdown із підсвіткою, жолоб `✓ ✗ ◌ ! ◇` з окремими `ID`/`static`/`tests`/`trace`, hover мишею й `K`, перехід у код (`$EDITOR` або вбудований переглядач), навігація шарів, потоків і правил, читання (`v`), редагування з доповненням і K001 під час набору, `Ctrl+G` text → spec, MERGE пропозицій з `.keylang/proposals/` по шматках (лише для рукописних специфікацій під `keylang/`), `keylang.json` у тому ж редакторі. Знімок будує worker, UI не блокується.
- `keylang web` — той самий TUI у вкладці браузера через вшитий xterm.js і WebSocket (`ws`), з токеном доступу (далі — cookie), перепідключенням до сесії й передачею її іншій вкладці.

## Запуск

```sh
npm install                      # web-tree-sitter, @vscode/tree-sitter-wasm, ws (+ dev: typescript, @types/node, xterm.js)

node bin/keylang.js init path/to/repo    # вгадати шари, записати keylang.json, згенерувати карту
node bin/keylang.js map                  # оновити keylang/map/*.md і .keylang/index.json
node bin/keylang.js map --check          # CI: код виходу 1, якщо карта застаріла
node bin/keylang.js check                # ID + правила по keylang/
node bin/keylang.js check --static=shape # static-докази лише за записаними викликами (типово behavior: ще й хуки)

node bin/keylang.js parse examples/shop
node bin/keylang.js parse --json examples/shop/map.md

node bin/keylang.js check examples/shop
# examples/shop/map.md:27:13: K001 dangling reference `domain.aggregate` (did you mean `domain.orderAggregate`?)
node bin/keylang.js check examples/shop-fixed     # код виходу 0

node bin/keylang.js fmt --check examples
node bin/keylang.js fmt path/to/file.md

node bin/keylang.js                      # TUI у терміналі (? — клавіші, q — вихід)
node bin/keylang.js web                  # те саме в браузері: відкрийте надрукований URL з токеном
```

Або `npm link` і далі просто `keylang …`.

## Тести й перевірка типів

```sh
npm test            # node --test, наскрізні тести CLI
npm run typecheck   # tsc --noEmit
```

TUI перевіряється без TTY (`tests/tui.test.ts`: сесія з віртуальним терміналом `tests/vt.ts`), `keylang web` — через справжній CLI і WebSocket (`tests/web.test.ts`). Решта тестів наскрізні (`tests/cli.test.ts`): запускають `keylang` на прикладах і фікстурах у `tests/fixtures/` (дослівний Markdown зі слайдів, по одній помилці кожного коду, «брудний» файл для `fmt`, маленький TS-репозиторій `repo/` з очікуваною картою в `repo.expected/` і пробою забороненого імпорту).

Бенчмарк: `bench/clone.sh && bench/run.sh`.
