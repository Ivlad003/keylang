# 2. A new feature

[Adding to a codebase](README.md) · **English** · [Українською](uk/02-a-feature.md)

The shop already has checkout, but a refund does not exist yet. Write its spec before any function exists. You still do not write the function itself: an agent generates it from this file.

Create `keylang/features/refund.md`. The file name is the feature's slug, so here the slug is `refund`.

```markdown
# flow refund

The buyer sends an order back. The order rules build a refund. The screen does not talk to the database.

- planned fn application.purchase.refund (order: Order) → Refund
- trigger presentation.terminal.refund
  - step application.purchase.refund
    - step domain.orderAggregate.refund
```

Use the ids from your own map. The shop's map already has `application.purchase`, `presentation.terminal`, and `domain.orderAggregate`, which link to `src/app/purchase.ts`, `src/ui/terminal.ts`, and `src/domain/order.ts`. The example has no source files, and notice that `order.ts` is not named `orderAggregate`, so you cannot always guess an id from a file name. On a real repository, copy the id exactly as the map prints it.

`planned fn` records a wish: the function is expected but not written yet. That is why a reference to it is not an error. The step that uses it stays `unverified` until the function exists.

```sh
npx keylang feature refund
```

When this exits 0 and prints `done` on stderr, three things are true. First, every `planned` line in this file matches code (keylang reports that with warning K202). Second, every step has a static call path (`ok`). Third, no rule in the repo fails, including the baseline. Tests and traces are printed as well, but they do not decide whether the feature is done.

Until then, stdout lists the gaps and the exit code is 1. A function that is missing shows up as `planned`. A function that exists but has another kind or another signature is reported as K201. Spaces in the signature do not matter, and `->` counts the same as `→`.

For TypeScript or JavaScript, the first command below prints a stub and a failing test without writing anything; the second one, with `--apply`, writes them:

```sh
npx keylang spec-to-code application.purchase.refund
npx keylang spec-to-code application.purchase.refund --apply
```

It only builds from a `planned fn`. A planned module is a file the agent creates, and this command will not create it. The tests it writes are `node:test` files. For Python and Rust it does not write the test at all: the agent does, from the same spec. It also refuses an id that already exists.

Once K202 appears, `feature` can already say done. At that point delete the `planned` line, so the warning goes away.

The spec file is what you hand to the agent. The agent generates the functions, and keylang does not start it. While it works, `check --changed` blocks a turn only on a new fail. An `unverified` line does not block, so read those lines yourself. If a change to `rules.md` is needed, it should arrive as a proposal under `.keylang/proposals/`, and you decide whether to merge it.

When the feature already exists in an older stack (another repository, maybe another language), carry its flows over instead of retyping them. In the old repository `npx keylang flow export checkout --out checkout.bundle.md` writes one Markdown file: the flows, every id with its kind, signature, doc and `file:line`, the tests, the events and integrations, and where it came from (repo, commit, snapshot). In this repository `npx keylang flow import checkout.bundle.md --layer-map app=application` proposes `keylang/features/checkout.md` — the same steps on `planned` ids in your layers, with the original signatures and tests — and the rows of `keylang/migration.md` that map each old id to its new one. Accept both with `keylang proposals accept`, and `feature checkout` and `spec-to-code` work on it as on a file you wrote.

Next: [an integration](03-an-integration.md).
