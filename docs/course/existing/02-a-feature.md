# 2. A new feature

[Adding to a codebase](README.md) · **English** · [Українською](uk/02-a-feature.md)

The shop already has checkout. A refund does not exist yet. Write that down before you write the function.

Create `keylang/features/refund.md`. The file name is the slug. `refund` is the slug.

```markdown
# flow refund

The buyer sends an order back. The order rules build a refund. The screen does not talk to the database.

- planned fn application.purchase.refund (order: Order) → Refund
- trigger presentation.terminal.refund
  - step application.purchase.refund
    - step domain.orderAggregate.refund
```

Use the ids from your map. The shop's map already uses `application.purchase`, `presentation.terminal`, and `domain.orderAggregate`. The links there are `src/app/purchase.ts`, `src/ui/terminal.ts`, and `src/domain/order.ts`. The example has no source files, and `order.ts` is not named `orderAggregate`. On a real repository, copy the id the map prints.

`planned fn` is a wish. A reference to it is not an error. The step stays `unverified` until the function exists.

```sh
npx keylang feature refund
```

Exit 0 and `done` on stderr means three things. Every `planned` line in this file matches code (warning K202). Every step has a static call path (`ok`). No rule in the repo fails, including the baseline. Tests and traces are printed. They do not decide.

Until then, stdout lists the gaps and the exit code is 1. A missing function is `planned`. A function with another kind or another signature is K201. Spaces do not matter, and `->` is the same as `→`.

For TypeScript or JavaScript, this prints a stub and a failing test, and writes nothing:

```sh
npx keylang spec-to-code application.purchase.refund
npx keylang spec-to-code application.purchase.refund --apply
```

It only builds a `planned fn`. A planned module is yours to create. It writes `node:test` files. For Python and Rust it tells you to write the test yourself. It refuses an id that already exists.

When K202 appears, `feature` can already say done. Delete the `planned` line so the warning goes away.

An agent can write the code. keylang does not start it. `check --changed` blocks a turn only on a new fail. An `unverified` line does not block, so read those yourself. A change to `rules.md` should arrive as a proposal under `.keylang/proposals/`. You merge it, or you don't.

Next: [an integration](03-an-integration.md).
