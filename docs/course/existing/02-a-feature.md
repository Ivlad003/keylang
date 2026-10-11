# 2. A new feature

[Adding to a codebase](README.md) · **English** · [Українською](uk/02-a-feature.md)

The shop already has checkout, but no refund. You write the refund's spec before any of its code exists, and an agent later generates the function from that file.

Create `keylang/features/refund.md`. The file name is the feature's slug, so the slug here is `refund`.

```markdown
# flow refund

The buyer sends an order back. The order rules build a refund. The screen does not talk to the database.

- planned fn application.purchase.refund (order: Order) → Refund
- trigger presentation.terminal.refund
  - step application.purchase.refund
    - test tests/refund.test.ts "refunds a paid order"
    - step domain.orderAggregate.refund
```

Use the ids from your own map. The shop's map already has `application.purchase`, `presentation.terminal`, and `domain.orderAggregate`, which link to `src/app/purchase.ts`, `src/ui/terminal.ts`, and `src/domain/order.ts`. The example has no source files. Notice also that `order.ts` is not named `orderAggregate`: you cannot always guess an id from a file name. On a real repository, copy the id exactly as the map prints it.

`planned fn` records a wish: the function is expected but not written yet, so a reference to it is not an error. The step that uses it stays `unverified` until the function exists. The `test` line names the test that will prove the step, by file and test name.

```sh
npx keylang feature refund
```

The command exits 0 and prints `done` on stderr when three things are true:

1. Every `planned` line in this file matches code. keylang reports that with warning K202.
2. Every step has a static call path (`ok`).
3. No rule fail of this change remains, meaning a fail on a file changed on this branch or on an id the feature names. Without git, any fail counts, the baseline included.

A fail that was there before the branch shows up on a `hint:` line instead. Tests and traces are printed as well, but they do not decide whether the feature is done.

Until then, the exit code is 1 and stdout lists the gaps. A missing function shows up as `planned`. A function that exists but has another kind or signature is reported as K201. Spaces in the signature do not matter, and `->` counts the same as `→`.

You can give the agent a head start. The first command below makes a stub for the planned function, plus a failing test for each `test` line whose file does not exist yet, and leaves them as proposals under `.keylang/proposals/` for you to merge. The second, with `--apply`, writes the files directly. `--print` writes nothing.

```sh
npx keylang spec-to-code application.purchase.refund
npx keylang spec-to-code application.purchase.refund --apply
```

`spec-to-code` only builds from a `planned fn`. A planned module is a file the agent creates; this command will not create it. The stub can be TypeScript, JavaScript, Python, Rust or PHP. The test is a `node:test` file for TypeScript and JavaScript and a PHPUnit class for PHP. For Python and Rust it writes no test, and the agent writes one from the same spec. The command also refuses an id that already exists.

Once K202 appears, `feature` can already say done. Delete the `planned` line then, and the warning goes away.

The spec file is what you hand to the agent. The agent generates the functions; keylang does not start it. While the agent works, `check --changed` blocks a turn only on a new fail, or on a spec weakened since the last commit (K108: a removed `deny` or step, a new `allow`, a wider `exclude` in `keylang.json`). Only a person can let a weakening through, with `--accept-weakening`. An `unverified` line does not block, so read those lines yourself. If `rules.md` needs to change, the change should arrive as a proposal under `.keylang/proposals/`, and you decide whether to merge it.

Sometimes the feature already exists in an older stack: another repository, maybe another language. Then you carry its flows over instead of retyping them.

1. In the old repository, `npx keylang flow export checkout --out checkout.bundle.md` writes one Markdown file. It holds the flows, every id with its kind, signature, doc and `file:line`, the tests, the events and integrations, and where it all came from (repo, commit, snapshot).
2. In this repository, `npx keylang flow import checkout.bundle.md --layer-map app=application` proposes two things. One is `keylang/features/checkout.md`, with the same steps on `planned` ids in your layers and the original signatures and tests. The other is the rows of `keylang/migration.md` that map each old id to its new one.
3. Accept both with `keylang proposals accept`. From then on `feature checkout` and `spec-to-code` treat the file like one you wrote.
4. `npx keylang migration status --from ../old-repo` shows the parity: each old flow against its counterpart here as `ok`, `fail` or `unverified`, and what is not migrated yet.

You can make the same move from the diagrams. Open the old repository's `keylang web`, find the flow on the map, and press «Копіювати як пакет» (or `Ctrl+C` on a selection in the editor). The clipboard now holds that bundle as plain text, with the shapes and their places in its `keylang-layout` block. Then open this repository's `keylang web` in another tab, on another port, and paste with `Ctrl+V` in the editor. A dialog maps the old layers onto yours. It prefills them by name, «запитати модель» asks the configured model, and the final choice is yours. «Імпортувати» writes the same two proposals as `flow import` and draws the flow on the canvas as `planned` shapes in your lanes. Merge the proposals, and the agents have a feature to build. The pasted text is only data: nothing in it runs, and the model sees it marked as untrusted.

Next: [an integration](03-an-integration.md).
