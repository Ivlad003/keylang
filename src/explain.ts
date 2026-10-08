// Short explanations for diagnostic codes. Every code in `diag.ts` has an entry.

import type { Code } from "./diag.ts";

export const EXPLANATIONS: Record<Code, { cause: string; example: string; fix: string }> = {
  K001: {
    cause: "A reference names an id that is not declared in a fully indexed module.",
    example: "`step domain.order.create` when the module only exports `createOrder`.",
    fix: "Fix the id, or declare `planned fn <id> <signature>` if it is an intention that is not implemented yet. In a generated file (first line `keylang:generated`) do neither: run the command the hint names, such as `keylang baseline`, to write it again.",
  },
  K002: {
    cause: "The same id is declared twice.",
    example: "Two modules both named `order` in one layer.",
    fix: "Rename one declaration. Layers may be repeated; other ids may not.",
  },
  K003: {
    cause: "The list structure is not the two-space outline keylang reads.",
    example: "A tab indent, or a jump of more than one level.",
    fix: "Use two spaces per level and keep each child exactly one level deeper.",
  },
  K004: {
    cause: "A keyword is not allowed at this position.",
    example: "`fn` written directly under a layer.",
    fix: "Move the item under the parent that accepts that keyword.",
  },
  K005: {
    cause: "A known keyword has the wrong arguments.",
    example: "`# flow` without a name, a broken link, `deny` over a fn instead of its module, or one layer twice in `layers`.",
    fix: "Write the keyword in one of its forms: each reason below pairs the mistake with the right form. A planned step is not `step planned <id>`: declare it as `- planned fn <id> <signature>` at the top of the flow and keep `- step <id>`.",
  },
  K006: {
    cause: "The first-level heading is not map, rules, flow, or wiring.",
    example: "`# Shop`.",
    fix: "Rename the heading, or leave it as prose if it was intentional. The section is still read as a map.",
  },
  K008: {
    cause: "A `then` of one token without a dot matches the last segment of a declared id, so it was probably meant as a reference. It is still read as text.",
    example: "`then save` when the map has `infra.db.save`.",
    fix: "Write the full id, bare (`then infra.db.save`) or as a link (`then [infra.db.save](map.md)`). Or rewrite the text as several words (`then save the order`).",
  },
  K009: {
    cause: "A `parallel` group has no nested `step`: there is nothing that runs in parallel (ADR 0023).",
    example: "`- parallel` with no items under it, or only a `?` under it.",
    fix: "Nest the steps that run in any order under `- parallel`, or remove the line.",
  },
  K101: {
    cause: "A dependency points against the layer order.",
    example: "`domain` importing `app` when the rules say `domain < app`.",
    fix: "Reverse the dependency, or add an `allow` for that pair.",
  },
  K102: {
    cause: "A dependency is forbidden by `deny`.",
    example: "`deny domain infra` while `domain` imports `infra`.",
    fix: "Remove the import, including a literal `import()` inside a function, or narrow the rule.",
  },
  K103: {
    cause: "A module is not reachable from `entry` along real edges.",
    example: "`entry main.pkg.live` does not reach sibling `main.pkg.dead`.",
    fix: "Import or call the module from a reachable one, or add it as an entry. An unresolved edge makes this unverified instead.",
  },
  K104: {
    cause: "The public export table does not match `exports`.",
    example: "`export { extra }` while `exports` only lists `allowed`.",
    fix: "List every public name, or stop exporting it. A name in `exports` that the module does not export is an absence.",
  },
  K105: {
    cause: "The module belongs to a strongly connected component of imports.",
    example: "`a → b → c → a` and `d → c` makes `d` part of the same component.",
    fix: "Break the cycle. `no-cycles` under a module reports a route through that module.",
  },
  K106: {
    cause: "An `allow` and a `deny` are incomparable: one is narrower on the source and the other on the target, and the allow's depth sum is greater. Format 1 lets that allow win. Format 2 (deny-overrides) lets the deny win. The warning is the same pair either way.",
    example: "`allow app.x.y domain` and `deny app domain.storefront` both match `app.x.y → domain.storefront`, and neither area contains the other.",
    fix: "Add the intersection, `allow app.x.y domain.storefront` or `deny app.x.y domain.storefront`, so one rule is strictly more specific. That removes K106 in both formats. Format 2 keeps the deny unless the intersection is an allow.",
  },
  K107: {
    cause: "A module of the architecture (a layer or `unassigned`) depends on a file that `outside` in keylang.json puts outside the architecture.",
    example: "`src/cli.ts` imports `scripts/release.ts` while keylang.json has `\"outside\": [\"scripts/**\"]`.",
    fix: "Move the shared code into a layer and import it from both sides, or take the file out of `outside`. Code outside the architecture may import the architecture, not the other way round.",
  },
  K201: {
    cause: "A `planned` declaration names a symbol that now exists with another kind or signature.",
    example: "`planned fn app.refund (order: Order) → Refund` while the code declares `type Refund` under that id.",
    fix: "Change the code or the declaration so kind and signature agree, then remove the `planned` line.",
  },
  K202: {
    cause: "A `planned` declaration is implemented: the code has the symbol with the same kind and signature.",
    example: "`planned fn app.refund (order: Order) → Refund` after `export function refund(order: Order): Refund` was added.",
    fix: "Remove the `planned` line; the step is already checked as implemented code.",
  },
  K203: {
    cause: "A `test` line in a flow names a file that does not exist in the repository, so no test report can ever prove it. Checked with or without `check.tests` in keylang.json.",
    example: "`test tests/nope.test.ts \"creates order\"` while the repository has no `tests/nope.test.ts`.",
    fix: "Fix the path (relative to the directory of keylang.json), create the test, or remove the line.",
  },
  K205: {
    cause: "`trigger <kind> <id>` names a fn the snapshot records as an entry point of another kind (`keylang entries`), so the flow starts from something else than it says.",
    example: "`trigger route shop.cli.main` while `keylang entries` lists `shop.cli.main` as a `cli` entry.",
    fix: "Write the kind `keylang entries` shows for the fn (route, cron, consumer or webhook), or a plain `trigger <id>` when it is none of these.",
  },
  K206: {
    cause: "`continues <flow>` names a flow that no `# flow` section declares, so there is nothing this flow continues.",
    example: "`- continues place-order` while the specs have only `# flow checkout`.",
    fix: "Write the name of an existing flow, or add that flow.",
  },
  K301: {
    cause: "`wire` factories depend on each other in a cycle, so one of them would get a dependency that is not built yet (ADR 0003).",
    example: "`wire app.a` with `- b app.b` and `wire app.b` with `- a app.a`.",
    fix: "Break the cycle in code: pass a callback or an event, or move what both need into a third factory.",
  },
  K302: {
    cause:
      "A `wire` target, dependency or `compose` names something the generated file cannot import or call: a module, a layer or a type (a decorator must be a fn), a method of a class, a name its module does not export, or code in a language other than TS/JS.",
    example: "`wire application.purchase` where `purchase` is a file module, not its factory; `compose infra.db.Db` where `Db` is a type.",
    fix: "Name an exported factory function or class: `wire application.purchase.createPurchase`; export it if it is not.",
  },
};

// Self-contained: the npm package ships no docs/, so each reason shows the right form here.
const K005_REASON_LINES = [
  "reasons (mistake → right form):",
  "- arguments: `# flow` without a name, or `deny app` with no second id → `# flow checkout`, `deny domain infra`",
  "- id: a token that is not an id, such as `module 1bad` (an id starts with a letter) → `module order`",
  "- link: a broken link, such as `calls [a.b](x` → `calls [a.b](src/a.ts)`",
  "- quote: an unclosed quote, such as `test f.ts \"x` → `test f.ts \"x\"`",
  "- layer: `layers a < a`, a dotted name, or two orders that disagree → `layers domain < app`, one order of plain names",
  "- scope: `deny app app.checkout.buy` names a fn instead of its module → `deny app app.checkout`",
];

export function explainCode(code: string): string | null {
  const upper = code.toUpperCase();
  const text = Object.hasOwn(EXPLANATIONS, upper) ? EXPLANATIONS[upper as Code] : undefined;
  if (!text) return null;
  const lines = [`${upper}: ${text.cause}`, `example: ${text.example}`, `fix: ${text.fix}`];
  if (upper === "K005") lines.push(...K005_REASON_LINES);
  return lines.join("\n");
}
