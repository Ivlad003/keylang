# 3. An integration

[Adding to a codebase](README.md) · **English** · [Українською](uk/03-an-integration.md)

A feature calls code the agent generated, while an integration also calls somebody else's package. Here the shop is about to take cards through the `stripe` package, and the order rules must not import it.

`keylang/features/pay.md`:

```markdown
# flow pay

- planned module external.stripe
- planned fn infrastructure.payments.charge (order: Order) → Receipt
- trigger application.purchase.buy
  - step infrastructure.payments.charge
```

A package named in `package.json` (in `dependencies` and the other dependency fields) is already known as `external.<name>`. The name is a single segment: `stripe` becomes `external.stripe`, and a name with a hyphen (`node-fetch`) also stays one segment. Naming a package, however, is not the same as importing it. `planned module` turns into K202 only when some file actually imports the package and the snapshot has that node.

Python requirement files are not read. So a pip package stays unknown until keylang sees an import of it, and an import it misses stays a hole.

In `keylang/rules.md`, keep the core away from the package:

```markdown
- deny domain external.stripe
- deny domain infrastructure.payments
- deny presentation external.stripe
```

With these rules, `application.purchase` may call `charge`, but domain may not, and the screen may not import `stripe` on its own.

```sh
npx keylang feature pay
```

Done means three things: the import exists, `charge` exists with that signature, and the body of `buy` reaches `charge` through a call keylang can see. The agent writes `charge` from the planned line; you do not. If `charge` is a `planned fn` in TypeScript, `spec-to-code` can stub it, but it will not add the `stripe` dependency to `package.json`, so you install the package yourself.

A call written as `obj[k]()`, or a step on a function under a Python decorator or a Rust attribute keylang does not know, stays `unverified`, and the feature stays open until the agent puts the real call in a plain function.

To see where the code talks to the outside, run:

```sh
npx keylang integrations
```

It lists the calls into known clients (HTTP, SOAP, SDKs such as Stripe, queues) by integration: `file:line`, the function, the host of a literal URL, and the entry points and flows that reach it; then the incoming webhooks and the queue publishers and consumers. It is a view: nothing is contacted, and `check` does not read it. Once the agent writes `charge`, the Stripe call shows up there in `infrastructure.payments`, and a call in any other module is the one to question.

The same shape fits any library, whether it is mail, a queue, or storage: one `planned module external.<pkg>`, one function in `infrastructure` that wraps it, and a `deny` on the package for every layer that must not import it.

Back to the [course](../README.md).
