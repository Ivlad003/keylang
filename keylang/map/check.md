<!-- keylang:generated — не редагувати, `keylang map` -->

# map

- check
  - module [resolve](../../src/resolve.ts#L1)
    - diag base.diag
    - ir lang.ir
    - span base.span
    - type [Decl](../../src/resolve.ts#L8)
    - type [Lookup](../../src/resolve.ts#L21)
    - module [Index](../../src/resolve.ts#L27)
      - fn [lookup](../../src/resolve.ts#L31) (id: string) → Lookup
        - calls check.resolve.Index.longestPrefix
      - fn [longestPrefix](../../src/resolve.ts#L39) (id: string) → Decl | undefined <!-- internal -->
      - fn [suggest](../../src/resolve.ts#L51) (id: string) → string | undefined
        - calls check.resolve.Index.longestPrefix, check.resolve.levenshtein
      - fn [toJSON](../../src/resolve.ts#L69) () → { decls: Record<string, Decl>; flows: Record<string, Decl> }
    - fn [check](../../src/resolve.ts#L75) (docs: readonly Document[]) → { index: Index; diagnostics: Diagnostic[] }
      - calls check.resolve.Index, check.resolve.insert, lang.ir.sectionNodes, lang.ir.walk, lang.ir.isDecl, check.resolve.checkRefs
    - fn [insert](../../src/resolve.ts#L116) (map: Map<string, Decl>, decl: Decl, what: string, diags: Diagnostic[]) → void <!-- internal -->
      - calls base.diag.diagnostic
    - fn [checkRefs](../../src/resolve.ts#L134) (index: Index, doc: Document, node: Node, diags: Diagnostic[]) → void <!-- internal -->
      - calls base.diag.diagnostic
    - fn [levenshtein](../../src/resolve.ts#L151) (a: string, b: string) → number <!-- internal -->
  - module [rules](../../src/rules.ts#L1)
    - diag base.diag
    - ir lang.ir
    - resolve check.resolve
    - span base.span
    - type [Edge](../../src/rules.ts#L12) <!-- internal -->
    - type [Rule](../../src/rules.ts#L20) <!-- internal -->
    - fn [checkRules](../../src/rules.ts#L29) (docs: readonly Document[], index: Index) → Diagnostic[]
      - calls lang.ir.sectionNodes, lang.ir.walk, base.diag.diagnostic, check.rules.findCycles
    - fn [findCycles](../../src/rules.ts#L232) (adj: Map<string, Set<string>>) → string[][] <!-- internal -->
    - fn [isRuleNode](../../src/rules.ts#L260) (n: Node) → boolean
