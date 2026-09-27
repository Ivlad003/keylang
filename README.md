# keylang

Мова опису застосунку, прив'язана до репозиторію: карта шарів і модулів, правила залежностей і потоки логіки у звичайному Markdown. Повний дизайн — [`docs/design.md`](docs/design.md), точна граматика — [`docs/format.md`](docs/format.md), огляд наукових статей і порівняння стеків — [`docs/research.md`](docs/research.md).

Стек: Node.js ≥ 22.18 + TypeScript, без кроку збірки (Node виконує `.ts` напряму). Дистрибуція через npm/npx.

## M0: що зроблено

Перший етап дорожньої карти (design.md §9): специфікація формату, парсер Markdown → IR і `keylang fmt`.

- `src/` — ядро без залежностей: IR (`ir.ts`), парсер з позиціями для кожного вузла й посилання (`parser.ts`), резолвінг ID між файлами (`resolve.ts`), діагностики K001–K006 (`diag.ts`), форматер (`fmt.ts`); `index.ts` — публічний API.
- `src/cli.ts`, `bin/keylang.js` — CLI `keylang`.
- `docs/format.md` — специфікація формату з рішеннями Р1–Р14.
- `examples/shop` — приклад зі слайдів з навмисною помилкою `domain.aggregate`; `examples/shop-fixed` — виправлений.

## Запуск

```sh
npm install                      # лише devDependencies: typescript, @types/node

node bin/keylang.js parse examples/shop
node bin/keylang.js parse --json examples/shop/map.md

node bin/keylang.js check examples/shop
# examples/shop/map.md:27:13: K001 dangling reference `domain.aggregate` (did you mean `domain.orderAggregate`?)
node bin/keylang.js check examples/shop-fixed     # код виходу 0

node bin/keylang.js fmt --check examples
node bin/keylang.js fmt path/to/file.md
```

Або `npm link` і далі просто `keylang …`.

## Тести й перевірка типів

```sh
npm test            # node --test, наскрізні тести CLI
npm run typecheck   # tsc --noEmit
```

Тести наскрізні (`tests/cli.test.ts`): запускають `keylang` на прикладах і фікстурах у `tests/fixtures/` (дослівний Markdown зі слайдів, по одній помилці кожного коду, «брудний» файл для `fmt`).
