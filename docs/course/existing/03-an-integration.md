# 3. An integration

[Adding to a codebase](README.md) · **English** · [Українською](uk/03-an-integration.md)

A feature calls code the agent generated. An integration also calls somebody else's package. The shop is about to take cards. The package is `stripe`. The order rules must not import it.

`keylang/features/pay.md`:

```markdown
# flow pay

- planned module external.stripe
- planned fn infrastructure.payments.charge (order: Order) → Receipt
- trigger application.purchase.buy
  - step infrastructure.payments.charge
```

A package named in `package.json` (`dependencies` and the other dependency fields) is already known as `external.<name>`. One segment: `stripe` becomes `external.stripe`. A name with a hyphen stays one segment (`node-fetch`). Naming it is not the same as importing it. `planned module` turns into K202 only when some file imports the package and the snapshot has that node.

Python requirement files are not read. A pip package stays unknown until an import is seen, and a missed import stays a hole.

In `keylang/rules.md`, keep the core away from the package:

```markdown
- deny domain external.stripe
- deny domain infrastructure.payments
- deny presentation external.stripe
```

`application.purchase` may call `charge`. Domain may not. The screen may not import `stripe` itself.

```sh
npx keylang feature pay
```

Done means the import exists, `charge` exists with that signature, and the body of `buy` reaches `charge` by a call keylang can see. The agent writes `charge` from the planned line. You do not. `spec-to-code` can stub `charge` if it is a `planned fn` in TypeScript. It will not add the `stripe` dependency to `package.json`. You install the package yourself.

A call written as `obj[k]()` or hidden behind a decorator keylang does not know stays `unverified`. The feature stays open. The agent puts the real call in a plain function.

The same shape fits any library: mail, a queue, storage. One `planned module external.<pkg>`, one function that is allowed to import it, and a deny for everyone else.

Back to the [course](../README.md).
