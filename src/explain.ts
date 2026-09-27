// Short explanations for diagnostic codes. Every code in `diag.ts` has an entry.

import type { Code } from "./diag.ts";

export const EXPLANATIONS: Record<Code, { cause: string; example: string; fix: string }> = {
  K001: {
    cause: "A reference names an id that is not declared in a fully indexed module.",
    example: "`step domain.order.create` when the module only exports `createOrder`.",
    fix: "Fix the id, or declare `planned fn <id> <signature>` if it is an intention that is not implemented yet.",
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
    example: "`# flow` without a name, or a broken link.",
    fix: "Match the form in format.md for that keyword.",
  },
  K006: {
    cause: "The first-level heading is not map, rules, flow, or wiring.",
    example: "`# Shop`.",
    fix: "Rename the heading, or leave it as prose if it was intentional. The section is still read as a map.",
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
};

export function explainCode(code: string): string | null {
  const upper = code.toUpperCase();
  const text = Object.hasOwn(EXPLANATIONS, upper) ? EXPLANATIONS[upper as Code] : undefined;
  if (!text) return null;
  return [`${upper}: ${text.cause}`, `example: ${text.example}`, `fix: ${text.fix}`].join("\n");
}
