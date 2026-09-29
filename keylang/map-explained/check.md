<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [assess](#check.assess) · [flows](#check.flows) · [resolve](#check.resolve) · [rules](#check.rules) · [scc](#check.scc) · [test-report](#check.test-report) · [trace-evidence](#check.trace-evidence) · [verdict](#check.verdict) · [wiring](#check.wiring)

# map

- check
  <a id="check"></a>
  - module [assess](../../src/assess.ts#L1)
    <a id="check.assess"></a><br>One assessment for `keylang check` and `keylang lsp`: the same diagnostics and verdicts.
    - node [external.node](external.md#external.node)
    - diag [base.diag](base.md#base.diag)
    - config [base.config](base.md#base.config)
    - flows [check.flows](check.md#check.flows)
    - ir [lang.ir](lang.md#lang.ir)
    - resolve [check.resolve](check.md#check.resolve)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - test-report [check.test-report](check.md#check.test-report)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - verdict [check.verdict](check.md#check.verdict)
    - wiring [check.wiring](check.md#check.wiring)
    - type [SnapshotInput](../../src/assess.ts#L18)
      <a id="check.assess.SnapshotInput"></a><br>The slice of the analysis snapshot that checks read; `check` does not import `map`.
    - type [Assessment](../../src/assess.ts#L26)
      <a id="check.assess.Assessment"></a>
    - fn [assess](../../src/assess.ts#L34) ( docs: readonly Document[], snapshot: SnapshotInput | null, evidence: { tests: TestCase[] | null; traces: TraceRun[] | null; static?: StaticMode; staticSetBy?: StaticSource; knownExternal?: ReadonlySet<string> } = { tests: null, traces: null }, format: RuleFormat = 1, ) → Assessment
      <a id="check.assess.assess"></a>
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.resolve.check](check.md#check.resolve.check), [check.rules.evaluateRules](check.md#check.rules.evaluateRules), [check.flows.evaluateFlows](check.md#check.flows.evaluateFlows), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.wiring.checkWiring](check.md#check.wiring.checkWiring), [check.assess.nodeKinds](check.md#check.assess.nodeKinds), [check.rules.canonicalRuleSpec](check.md#check.rules.canonicalRuleSpec)
    - fn [sameFinding](../../src/assess.ts#L92) (verdict: Verdict, diagnostics: readonly Diagnostic[]) → boolean
      <a id="check.assess.sameFinding"></a>
    - fn [nodeKinds](../../src/assess.ts#L101) (nodes: SnapshotInput["nodes"]) → Map<string, string> <!-- internal -->
      <a id="check.assess.nodeKinds"></a><br>Snapshot kinds, with a class told apart by its marker.
  - module [flows](../../src/flows.ts#L1)
    <a id="check.flows"></a><br>Evidence for flows: ID, static, tests, and trace are separate verdicts. A step is checked from its parent (the trigger for a top-level step), never from its siblings.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - languages [base.languages](base.md#base.languages)
    - resolve [check.resolve](check.md#check.resolve)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - test-report [check.test-report](check.md#check.test-report)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - verdict [check.verdict](check.md#check.verdict)
    - type [SnapshotEdge](../../src/flows.ts#L17) <!-- internal -->
      <a id="check.flows.SnapshotEdge"></a>
    - type [SnapshotNodeView](../../src/flows.ts#L34) <!-- internal -->
      <a id="check.flows.SnapshotNodeView"></a>
    - type [FlowInput](../../src/flows.ts#L47)
      <a id="check.flows.FlowInput"></a>
    - type [Planned](../../src/flows.ts#L66) <!-- internal -->
      <a id="check.flows.Planned"></a>
    - type [Channel](../../src/flows.ts#L75) = "ID" | "static" | "tests" | "trace" <!-- internal -->
      <a id="check.flows.Channel"></a>
    - type [FlowNode](../../src/flows.ts#L77) = Trigger | FlowItem <!-- internal -->
      <a id="check.flows.FlowNode"></a>
    - fn [evaluateFlows](../../src/flows.ts#L79) (compiled: SpecIR, index: Index, input: FlowInput) → { diagnostics: Diagnostic[]; verdicts: Verdict[] }
      <a id="check.flows.evaluateFlows"></a>
      - calls [check.flows.collectPlanned](check.md#check.flows.collectPlanned), [check.flows.callGraph](check.md#check.flows.callGraph), [check.flows.specHash](check.md#check.flows.specHash), [check.trace-evidence.traceFlow](check.md#check.trace-evidence.traceFlow), [check.flows.idVerdict](check.md#check.flows.idVerdict), [check.flows.reachability](check.md#check.flows.reachability), [check.flows.traceProvenance](check.md#check.flows.traceProvenance), [check.flows.claimArea](check.md#check.flows.claimArea), [check.flows.quantitative](check.md#check.flows.quantitative), [check.test-report.matchTest](check.md#check.test-report.matchTest)
    - fn [claimArea](../../src/flows.ts#L192) (node: ClaimItem | ThenItem | WhenItem) → string <!-- internal -->
      <a id="check.flows.claimArea"></a>
    - fn [traceProvenance](../../src/flows.ts#L198) (evidence: TraceEvidence) → Verdict["evidence"] <!-- internal -->
      <a id="check.flows.traceProvenance"></a>
    - fn [quantitative](../../src/flows.ts#L203) (text: string) → boolean <!-- internal -->
      <a id="check.flows.quantitative"></a><br>A count, a bound, or a negation: a subsequence of calls cannot prove it.
    - fn [idVerdict](../../src/flows.ts#L207) ( id: string, plan: Planned | undefined, span: Span, file: string, index: Index, input: FlowInput, verdict: (channel: Channel, area: string, value: Verdict["verdict"], file: string, span: Span, message: string) => void, ) → Verdict["verdict"] <!-- internal -->
      <a id="check.flows.idVerdict"></a>
      - calls [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [check.flows.moduleMembers](check.md#check.flows.moduleMembers)
    - type [Step](../../src/flows.ts#L226) <!-- internal -->
      <a id="check.flows.Step"></a>
    - type [CallGraph](../../src/flows.ts#L232) <!-- internal -->
      <a id="check.flows.CallGraph"></a>
    - fn [callGraph](../../src/flows.ts#L253) (input: FlowInput) → CallGraph <!-- internal -->
      <a id="check.flows.callGraph"></a>
      - calls [base.languages.constructorName](base.md#base.languages.constructorName), [check.flows.callName](check.md#check.flows.callName), [check.flows.doubtfulBodies](check.md#check.flows.doubtfulBodies)
    - fn [doubtfulBodies](../../src/flows.ts#L290) (input: FlowInput) → { replaced: Map<string, string>; unreadable: Map<string, string> } <!-- internal -->
      <a id="check.flows.doubtfulBodies"></a><br>Fns whose body a proof cannot pass through. A decorator in coverage (`@replace` before `def decorated`) belongs to the fn it names as its source or, when its source is the module, to the first fn declared at or after it.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [lastSegment](../../src/flows.ts#L310) (text: string) → string <!-- internal -->
      <a id="check.flows.lastSegment"></a>
    - fn [callName](../../src/flows.ts#L318) (id: string) → string <!-- internal -->
      <a id="check.flows.callName"></a><br>The name code calls a fn by: `m` for `X.m` and `X.m-static`, `#go` for `X.go-private` (§11: a member that shares its name with another gets a suffix).
      - calls [check.flows.lastSegment](check.md#check.flows.lastSegment)
    - fn [namedLike](../../src/flows.ts#L327) (graph: CallGraph, name: string) → string[] <!-- internal -->
      <a id="check.flows.namedLike"></a><br>Fns a call by `name` (`feed`, `#work`) may run. A `#work` call also matches a private member whose ID has no suffix.
    - fn [describeVia](../../src/flows.ts#L332) (edge: SnapshotEdge) → string <!-- internal -->
      <a id="check.flows.describeVia"></a>
    - fn [describeHole](../../src/flows.ts#L336) (edge: SnapshotEdge, target: string, input: FlowInput) → string <!-- internal -->
      <a id="check.flows.describeHole"></a>
      - calls [check.flows.describeVia](check.md#check.flows.describeVia), [check.flows.lastSegment](check.md#check.flows.lastSegment), [check.flows.callName](check.md#check.flows.callName)
    - fn [at](../../src/flows.ts#L348) (edge: SnapshotEdge) → string <!-- internal -->
      <a id="check.flows.at"></a>
    - fn [reachability](../../src/flows.ts#L375) (graph: CallGraph, input: FlowInput, parent: string | null, target: string) → { verdict: Verdict["verdict"]; message: string } <!-- internal -->
      <a id="check.flows.reachability"></a><br>Static reachability of `target` from `parent`.
      - calls [check.flows.externalImport](check.md#check.flows.externalImport), [check.flows.search](check.md#check.flows.search), [check.flows.routeMessage](check.md#check.flows.routeMessage), [check.flows.routeSteps](check.md#check.flows.routeSteps), [check.flows.possibleRoute](check.md#check.flows.possibleRoute), [check.flows.at](check.md#check.flows.at), [check.flows.describeHole](check.md#check.flows.describeHole), [check.flows.callersOf](check.md#check.flows.callersOf), [check.flows.escapeOf](check.md#check.flows.escapeOf), [check.flows.holeNear](check.md#check.flows.holeNear)
    - fn [search](../../src/flows.ts#L435) (graph: CallGraph, parent: string, target: string, follow: (step: Step) => boolean) → { route: Map<string, Step> | null; depth: Map<string, number> } <!-- internal -->
      <a id="check.flows.search"></a><br>Breadth-first from `parent` over the steps `follow` accepts: the route to `target` (null when there is none) and the depth of every fn reached. The search stops at the target, so `depth` is complete only without a route.
    - fn [routeSteps](../../src/flows.ts#L458) (parent: string, target: string, previous: Map<string, Step>) → Step[] <!-- internal -->
      <a id="check.flows.routeSteps"></a><br>The steps of a route from `parent` to `target`, in call order.
    - fn [fileModule](../../src/flows.ts#L471) (nodes: FlowInput["nodes"], id: string) → string | null <!-- internal -->
      <a id="check.flows.fileModule"></a><br>The file module of a fn: the nearest module that is not a class.
    - fn [externalImport](../../src/flows.ts#L483) (input: FlowInput, parent: string, target: string) → { verdict: Verdict["verdict"]; message: string } <!-- internal -->
      <a id="check.flows.externalImport"></a><br>Static proof for `external.<pkg>`: a resolved import from the parent fn's own module.
      - calls [check.flows.fileModule](check.md#check.flows.fileModule)
    - fn [routeMessage](../../src/flows.ts#L493) (parent: string, target: string, previous: Map<string, Step>) → string <!-- internal -->
      <a id="check.flows.routeMessage"></a>
      - calls [check.flows.routeSteps](check.md#check.flows.routeSteps), [check.flows.describeVia](check.md#check.flows.describeVia)
    - fn [possibleRoute](../../src/flows.ts#L506) (graph: CallGraph, input: FlowInput, parent: string, target: string, proves: (step: Step) => boolean) → { edge: SnapshotEdge | null; seen: Set<string> } <!-- internal -->
      <a id="check.flows.possibleRoute"></a><br>Breadth-first search that also follows calls with more than one possible target and calls in closures. Returns the first such call on the shortest route (null when there is none) and every fn the search reached.
      - calls [check.flows.namedLike](check.md#check.flows.namedLike), [check.flows.callName](check.md#check.flows.callName), [check.flows.lastSegment](check.md#check.flows.lastSegment)
    - fn [callersOf](../../src/flows.ts#L534) (graph: CallGraph, target: string) → Set<string> <!-- internal -->
      <a id="check.flows.callersOf"></a><br>Every fn with a resolved or candidate route to `target`, the target included.
    - fn [escapeOf](../../src/flows.ts#L552) (graph: CallGraph, input: FlowInput, routes: Set<string>, reachable: ReadonlySet<string>) → { reason: string; from: string | null } | null <!-- internal -->
      <a id="check.flows.escapeOf"></a><br>Why code keylang cannot follow may still run a fn of `routes`, and the fn whose code hands that fn on (null when it is not in a fn: module level, an unsupported construct); null when every route is by name.
      - calls [check.flows.fnAt](check.md#check.flows.fnAt), [check.flows.at](check.md#check.flows.at), [check.flows.callName](check.md#check.flows.callName), [base.span.compareText](base.md#base.span.compareText)
    - fn [identifierPattern](../../src/flows.ts#L578) (name: string) → RegExp <!-- internal -->
      <a id="check.flows.identifierPattern"></a><br>`name` as a whole identifier: `$save` and `зберегти` too, which `\b` does not delimit.
    - fn [fnAt](../../src/flows.ts#L583) (input: FlowInput, file: string, line: number) → string | null <!-- internal -->
      <a id="check.flows.fnAt"></a><br>The innermost fn whose declaration holds `file:line`.
    - fn [holeNear](../../src/flows.ts#L597) (graph: CallGraph, holes: { edge: SnapshotEdge }[], from: string) → SnapshotEdge | null <!-- internal -->
      <a id="check.flows.holeNear"></a><br>The unresolved call in reachable code nearest `from` among the fns `from` calls, itself included: where a value handed on by `from` may be called. Null when no hole is downstream of it.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [moduleMembers](../../src/flows.ts#L613) (nodes: FlowInput["nodes"], id: string) → "complete" | "opaque" | null <!-- internal -->
      <a id="check.flows.moduleMembers"></a>
    - fn [collectPlanned](../../src/flows.ts#L629) (spec: SpecIR, input: FlowInput, diagnostics: Diagnostic[]) → Map<string, Planned> <!-- internal -->
      <a id="check.flows.collectPlanned"></a><br>`planned` declarations. A duplicate is K002.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.flows.normalizeSignature](check.md#check.flows.normalizeSignature)
    - fn [normalizeSignature](../../src/flows.ts#L652) (text: string) → string <!-- internal -->
      <a id="check.flows.normalizeSignature"></a>
    - fn [specHash](../../src/flows.ts#L656) (text: string) → string <!-- internal -->
      <a id="check.flows.specHash"></a>
  - module [resolve](../../src/resolve.ts#L1)
    <a id="check.resolve"></a><br>Cross-file ID resolution: builds the declaration index and reports duplicate declarations (K002) and dangling references (K001).
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - type [Decl](../../src/resolve.ts#L10)
      <a id="check.resolve.Decl"></a>
    - type [Lookup](../../src/resolve.ts#L23)
      <a id="check.resolve.Lookup"></a>
    - type [Members](../../src/resolve.ts#L30) = (moduleId: string) => "complete" | "opaque" | undefined
      <a id="check.resolve.Members"></a><br>What the snapshot knows about a module's members; `undefined` when it has no such module.
    - type [ResolveContext](../../src/resolve.ts#L33)
      <a id="check.resolve.ResolveContext"></a><br>What resolution knows besides the documents.
    - type [Unverified](../../src/resolve.ts#L43)
      <a id="check.resolve.Unverified"></a><br>A reference into a module whose contents the snapshot does not know: neither confirmed nor dangling.
    - module [Index](../../src/resolve.ts#L54)
      <a id="check.resolve.Index"></a>
      - fn [constructor](../../src/resolve.ts#L61) (members?: Members)
        <a id="check.resolve.Index.constructor"></a>
      - fn [lookup](../../src/resolve.ts#L65) (id: string) → Lookup
        <a id="check.resolve.Index.lookup"></a>
        - calls [check.resolve.Index.longestPrefix](check.md#check.resolve.Index.longestPrefix)
      - fn [snapshotOpaque](../../src/resolve.ts#L78) (id: string) → boolean
        <a id="check.resolve.Index.snapshotOpaque"></a><br>The snapshot knows the module and says its contents are unknown.
      - fn [longestPrefix](../../src/resolve.ts#L82) (id: string) → Decl | undefined <!-- internal -->
        <a id="check.resolve.Index.longestPrefix"></a>
      - fn [suggest](../../src/resolve.ts#L94) (id: string) → string | undefined
        <a id="check.resolve.Index.suggest"></a><br>Best-effort "did you mean" among siblings of the missing segment.
        - calls [check.resolve.Index.longestPrefix](check.md#check.resolve.Index.longestPrefix), [check.resolve.similarity](check.md#check.resolve.similarity)
      - fn [toJSON](../../src/resolve.ts#L112) () → { decls: Record<string, Decl>; flows: Record<string, Decl> }
        <a id="check.resolve.Index.toJSON"></a>
    - fn [similarity](../../src/resolve.ts#L122) (a: string, b: string) → number | null <!-- internal -->
      <a id="check.resolve.similarity"></a><br>How close two names are for a suggestion (0 = one contains the other), or null when too far: a short name only matches a near-exact typo, so `zz` does not suggest `ab`, nor `banana` a layer `a`.
      - calls [check.resolve.codePoints](check.md#check.resolve.codePoints), [check.resolve.levenshtein](check.md#check.resolve.levenshtein)
    - fn [codePoints](../../src/resolve.ts#L131) (s: string) → number <!-- internal -->
      <a id="check.resolve.codePoints"></a>
    - fn [check](../../src/resolve.ts#L136) (docs: readonly Document[], context: ResolveContext = {}) → { index: Index; diagnostics: Diagnostic[]; unverified: Unverified[] }
      <a id="check.resolve.check"></a><br>Build the index over all documents and check every reference.
      - calls [check.resolve.Index](check.md#check.resolve.Index), [check.resolve.insert](check.md#check.resolve.insert), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [lang.ir.isDecl](lang.md#lang.ir.isDecl), [check.resolve.checkRefs](check.md#check.resolve.checkRefs)
    - fn [insert](../../src/resolve.ts#L185) (map: Map<string, Decl>, decl: Decl, what: string, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.insert"></a>
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [thenCandidates](../../src/resolve.ts#L209) (index: Index, word: string) → string[] <!-- internal -->
      <a id="check.resolve.thenCandidates"></a><br>Ids whose last segment is `word`: map declarations and `planned`, never a layer.
    - fn [warnBareThen](../../src/resolve.ts#L223) (index: Index, doc: Document, node: Node, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.warnBareThen"></a><br>`then save` is text (Р10). When `save` is the last segment of a real id, say so.
      - calls [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [check.resolve.thenCandidates](check.md#check.resolve.thenCandidates), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [checkRefs](../../src/resolve.ts#L243) (index: Index, doc: Document, node: Node, diags: Diagnostic[], unverified: Unverified[], knownExternal: ReadonlySet<string>) → void <!-- internal -->
      <a id="check.resolve.checkRefs"></a>
      - calls [check.resolve.warnBareThen](check.md#check.resolve.warnBareThen), [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [check.resolve.Index.suggest](check.md#check.resolve.Index.suggest), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.resolve.Index.snapshotOpaque](check.md#check.resolve.Index.snapshotOpaque), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [levenshtein](../../src/resolve.ts#L276) (a: string, b: string) → number <!-- internal -->
      <a id="check.resolve.levenshtein"></a>
  - module [rules](../../src/rules.ts#L1)
    <a id="check.rules"></a><br>Rules over a fresh analysis snapshot. Without a snapshot (a spec directory that has no code), rule results are unverified rather than a graph rebuilt from Markdown.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - resolve [check.resolve](check.md#check.resolve)
    - scc [check.scc](check.md#check.scc)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - verdict [check.verdict](check.md#check.verdict)
    - type [SnapshotView](../../src/rules.ts#L16) <!-- internal -->
      <a id="check.rules.SnapshotView"></a><br>The slice of the snapshot rules need. Kept here so `check` does not import `map`.
    - type [Rule](../../src/rules.ts#L24) <!-- internal -->
      <a id="check.rules.Rule"></a>
    - type [LayerOrder](../../src/rules.ts#L33) <!-- internal -->
      <a id="check.rules.LayerOrder"></a><br>One `layers a < b < c` line: `a` lowest.
    - type [UseEdge](../../src/rules.ts#L40) <!-- internal -->
      <a id="check.rules.UseEdge"></a>
    - type [RuleReport](../../src/rules.ts#L56)
      <a id="check.rules.RuleReport"></a>
    - fn [checkRules](../../src/rules.ts#L61) (docs: readonly Document[], index: Index, snapshot: SnapshotView | null = null) → Diagnostic[]
      <a id="check.rules.checkRules"></a>
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.rules.evaluateRules](check.md#check.rules.evaluateRules)
    - fn [dependencyKindOf](../../src/rules.ts#L67) ( source: readonly Document[] | SpecIR, index: Index, nodes: Readonly<Record<string, { kind: string }>> | undefined, ) → (id: string) => string | undefined
      <a id="check.rules.dependencyKindOf"></a><br>Kind of an id the way `evaluateRules` sees it: a fn, type, or event rule applies nowhere.
      - calls [check.rules.specOf](check.md#check.rules.specOf), [check.rules.plannedDecl](check.md#check.rules.plannedDecl)
    - fn [blocksDependency](../../src/rules.ts#L77) ( spec: SpecIR, from: string, to: string, kindOf: (id: string) => string | undefined = () => undefined, format: RuleFormat = 1, ) → boolean
      <a id="check.rules.blocksDependency"></a><br>Whether `from` depending on `to` is forbidden by the deny that wins under `format`.
      - calls [check.rules.denyingRule](check.md#check.rules.denyingRule)
    - fn [denyingRule](../../src/rules.ts#L91) ( spec: SpecIR, from: string, to: string, kindOf: (id: string) => string | undefined = () => undefined, format: RuleFormat = 1, ) → { text: string; file: string; line: number; aside: string } | null
      <a id="check.rules.denyingRule"></a><br>The deny that wins `from → to`, or null. `aside` is the incomparable allow a K102 should name: empty when the deny won because it was more specific.
      - calls [check.rules.collectRules](check.md#check.rules.collectRules), [check.rules.ruleHits](check.md#check.rules.ruleHits), [check.rules.specific](check.md#check.rules.specific), [check.rules.incomparableAside](check.md#check.rules.incomparableAside), [check.rules.decide](check.md#check.rules.decide)
    - fn [evaluateRules](../../src/rules.ts#L115) (spec: SpecIR, index: Index, snapshot: SnapshotView | null, docs: readonly Document[] = [], format: RuleFormat = 1) → RuleReport
      <a id="check.rules.evaluateRules"></a>
      - calls [check.rules.plannedDecl](check.md#check.rules.plannedDecl), [check.rules.collectRules](check.md#check.rules.collectRules), [check.rules.incomparableWarnings](check.md#check.rules.incomparableWarnings), [check.rules.hashText](check.md#check.rules.hashText), [check.rules.noSnapshotSpec](check.md#check.rules.noSnapshotSpec), [check.rules.evaluateOnSnapshot](check.md#check.rules.evaluateOnSnapshot)
    - fn [specOf](../../src/rules.ts#L140) (source: readonly Document[] | SpecIR) → SpecIR <!-- internal -->
      <a id="check.rules.specOf"></a>
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec)
    - fn [plannedDecl](../../src/rules.ts#L145) (spec: SpecIR, id: string) → string <!-- internal -->
      <a id="check.rules.plannedDecl"></a>
    - fn [evaluateOnSnapshot](../../src/rules.ts#L149) (rules: EvaluatedRules, index: Index, snapshot: SnapshotView, planned: readonly string[], format: RuleFormat) → RuleReport <!-- internal -->
      <a id="check.rules.evaluateOnSnapshot"></a>
      - calls [check.rules.base](check.md#check.rules.base), [check.rules.ruleHits](check.md#check.rules.ruleHits), [check.rules.decide](check.md#check.rules.decide), [check.rules.crossRules](check.md#check.rules.crossRules), [check.rules.layerViolation](check.md#check.rules.layerViolation), [check.rules.incomparableAside](check.md#check.rules.incomparableAside), [check.rules.componentSpec](check.md#check.rules.componentSpec), [check.rules.layerComponent](check.md#check.rules.layerComponent), [check.rules.overrideEvidence](check.md#check.rules.overrideEvidence), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.pointAt](check.md#check.rules.pointAt), [check.rules.hashText](check.md#check.rules.hashText), [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [check.scc.stronglyConnected](check.md#check.scc.stronglyConnected), [check.scc.cycleThrough](check.md#check.scc.cycleThrough)
    - fn [layerViolation](../../src/rules.ts#L511) (rules: EvaluatedRules, fromLayer: string, toLayer: string) → string | null <!-- internal -->
      <a id="check.rules.layerViolation"></a><br>Why a dependency between two layers breaks the layer orders, or null.
    - fn [layerComponent](../../src/rules.ts#L520) (rules: EvaluatedRules, layer: string) → Set<string> <!-- internal -->
      <a id="check.rules.layerComponent"></a><br>Layers joined to `layer` by the undirected partial order, including `layer` itself.
    - fn [componentSpec](../../src/rules.ts#L534) (rules: EvaluatedRules, layer: string) → string <!-- internal -->
      <a id="check.rules.componentSpec"></a><br>Canonical texts of the `layers` lines in `layer`'s connected order, one hash input.
      - calls [check.rules.layerComponent](check.md#check.rules.layerComponent)
    - type [RuleHit](../../src/rules.ts#L543) <!-- internal -->
      <a id="check.rules.RuleHit"></a>
    - type [OverrideNote](../../src/rules.ts#L551) <!-- internal -->
      <a id="check.rules.OverrideNote"></a>
    - fn [ruleHits](../../src/rules.ts#L561) (rules: EvaluatedRules, from: string, to: string, within: (id: string, scope: string) => boolean) → RuleHit[] <!-- internal -->
      <a id="check.rules.ruleHits"></a><br>Every allow or deny that matches the edge, scored by the deepest target it names.
      - calls [check.rules.scopeDepth](check.md#check.rules.scopeDepth)
    - fn [byHit](../../src/rules.ts#L584) (a: RuleHit, b: RuleHit) → number <!-- internal -->
      <a id="check.rules.byHit"></a>
    - fn [dominates](../../src/rules.ts#L590) (a: RuleHit, b: RuleHit) → boolean <!-- internal -->
      <a id="check.rules.dominates"></a><br>`a` is strictly more specific than `b`: neither of its areas is wider, and one is narrower.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin)
    - fn [crossRules](../../src/rules.ts#L597) (a: RuleHit, b: RuleHit) → boolean <!-- internal -->
      <a id="check.rules.crossRules"></a><br>One rule is narrower on the source and the other on the target.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin)
    - fn [areaWithin](../../src/rules.ts#L605) (id: string, scope: string) → boolean <!-- internal -->
      <a id="check.rules.areaWithin"></a>
    - fn [decide](../../src/rules.ts#L613) (hits: readonly RuleHit[], format: RuleFormat) → { winners: RuleHit[]; denyWins: boolean } <!-- internal -->
      <a id="check.rules.decide"></a><br>Format 1: the greatest depth sum, and every `deny` on that sum. Format 2: drop dominated hits; any undominated `deny` wins (deny-overrides).
      - calls [check.rules.dominates](check.md#check.rules.dominates)
    - fn [incomparableAside](../../src/rules.ts#L626) (deny: RuleHit, hits: readonly RuleHit[], format: RuleFormat) → string <!-- internal -->
      <a id="check.rules.incomparableAside"></a>
      - calls [check.rules.crossRules](check.md#check.rules.crossRules)
    - fn [overrideEvidence](../../src/rules.ts#L643) (deny: Rule, targets: string, notes: readonly OverrideNote[]) → string <!-- internal -->
      <a id="check.rules.overrideEvidence"></a>
    - fn [incomparableWarnings](../../src/rules.ts#L657) (rules: EvaluatedRules, format: RuleFormat) → Diagnostic[] <!-- internal -->
      <a id="check.rules.incomparableWarnings"></a><br>One K106 per incomparable allow/deny line pair, on the allow line. Static: no snapshot required.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin), [check.rules.scopeDepth](check.md#check.rules.scopeDepth), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.hashText](check.md#check.rules.hashText)
    - fn [canonicalRuleSpec](../../src/rules.ts#L701) (spec: SpecIR, file: string, line: number) → string | null
      <a id="check.rules.canonicalRuleSpec"></a><br>Canonical text of the rule line at `file:line`, or null when that line is not a rule. K101, K103, and an unreachable module's entry verdict hash several lines themselves.
      - calls [check.rules.collectRules](check.md#check.rules.collectRules)
    - fn [noSnapshotSpec](../../src/rules.ts#L718) (spec: SpecIR) → string
      <a id="check.rules.noSnapshotSpec"></a><br>Every rule line of the specs, valid or not, joined in file and line order. The hash of `no snapshot`.
    - fn [scopeDepth](../../src/rules.ts#L728) (id: string) → number
      <a id="check.rules.scopeDepth"></a><br>How specific a scope is: its depth in segments (`app.purchase` is 2), not its length in characters.
    - fn [specific](../../src/rules.ts#L739) (rules: EvaluatedRules, from: string, to: string, within: (id: string, scope: string) => boolean) → { kind: "allow" | "deny"; rule: Rule } | null <!-- internal -->
      <a id="check.rules.specific"></a><br>The rule that decides `from → to` in format 1: the one whose scopes are deepest in total (`deny app.purchase domain` and `allow app domain.store` both 3), a `deny` on a tie. Format 2 keeps every undominated rule and lets any undominated `deny` win (deny-overrides), so an…
      - calls [check.rules.decide](check.md#check.rules.decide), [check.rules.ruleHits](check.md#check.rules.ruleHits)
    - type [EvaluatedRules](../../src/rules.ts#L745) <!-- internal -->
      <a id="check.rules.EvaluatedRules"></a>
    - fn [collectRules](../../src/rules.ts#L766) (spec: SpecIR, kindOf: (id: string) => string | undefined) → EvaluatedRules <!-- internal -->
      <a id="check.rules.collectRules"></a>
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.combineOrders](check.md#check.rules.combineOrders)
    - fn [combineOrders](../../src/rules.ts#L824) (chains: readonly LayerOrder[], diagnostics: Diagnostic[]) → { orders: LayerOrder[]; above: Map<string, Set<string>> } <!-- internal -->
      <a id="check.rules.combineOrders"></a><br>All `layers` lines as one partial order: `a < b` and `b < c` put `c` above `a`, while `a < b` and `c < d` say nothing about `a` and `d`. A line that contradicts the lines before it is K005 and left out.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.transitive](check.md#check.rules.transitive)
    - fn [transitive](../../src/rules.ts#L854) (direct: ReadonlyMap<string, ReadonlySet<string>>) → Map<string, Set<string>> <!-- internal -->
      <a id="check.rules.transitive"></a>
    - fn [pointAt](../../src/rules.ts#L871) (line: number, col: number) → Span <!-- internal -->
      <a id="check.rules.pointAt"></a><br>A one-column span at a code position (a rule finding has no source offset).
    - fn [base](../../src/rules.ts#L876) (snapshot: SnapshotView, criterion: string, area: string, verdict: Verdict["verdict"], file: string, line: number, col: number, code: string | null, message: string, spec = criterion) → Verdict <!-- internal -->
      <a id="check.rules.base"></a><br>`spec` is the rule as written; its hash changes when the rule does.
      - calls [check.rules.hashText](check.md#check.rules.hashText)
    - fn [hashText](../../src/rules.ts#L880) (text: string) → string <!-- internal -->
      <a id="check.rules.hashText"></a>
  - module [scc](../../src/scc.ts#L1)
    <a id="check.scc"></a><br>Strongly connected components of a directed module graph. A component is cyclic when it has two or more modules, or a self-loop.
    - fn [stronglyConnected](../../src/scc.ts#L4) (adj: ReadonlyMap<string, ReadonlySet<string>>) → string[][]
      <a id="check.scc.stronglyConnected"></a>
      - calls [check.scc.components](check.md#check.scc.components)
    - fn [components](../../src/scc.ts#L9) (adj: ReadonlyMap<string, ReadonlySet<string>>) → string[][]
      <a id="check.scc.components"></a><br>Every strongly connected component, each after all components it reaches (Tarjan's order).
    - fn [cycleThrough](../../src/scc.ts#L63) (adj: ReadonlyMap<string, ReadonlySet<string>>, members: ReadonlySet<string>, start: string) → string[]
      <a id="check.scc.cycleThrough"></a><br>One cycle inside `members` that passes through `start`.
  - module [test-report](../../src/test-report.ts#L1)
    <a id="check.test-report"></a><br>Test-runner reports as evidence for `test <file> "<name>"` in a flow. A report proves the current code only when it names the snapshot it ran against; a third-party report without that link stays unverified.
    - node [external.node](external.md#external.node)
    - type [TestStatus](../../src/test-report.ts#L8) = "pass" | "fail" | "skip"
      <a id="check.test-report.TestStatus"></a>
    - type [TestCase](../../src/test-report.ts#L10)
      <a id="check.test-report.TestCase"></a>
    - type [JsonReport](../../src/test-report.ts#L23)
      <a id="check.test-report.JsonReport"></a><br>keylang JSON report, schema 1 (written by the `node:test` reporter).
    - fn [loadReports](../../src/test-report.ts#L33) (root: string, files: readonly string[]) → TestCase[]
      <a id="check.test-report.loadReports"></a><br>Read report files (JSON or JUnit XML). Malformed input is an error naming the file.
      - calls [check.test-report.parseJunit](check.md#check.test-report.parseJunit), [check.test-report.parseJsonReport](check.md#check.test-report.parseJsonReport)
    - fn [parseJsonReport](../../src/test-report.ts#L40) (file: string, text: string) → TestCase[]
      <a id="check.test-report.parseJsonReport"></a>
    - fn [parseJunit](../../src/test-report.ts#L72) (file: string, text: string) → TestCase[]
      <a id="check.test-report.parseJunit"></a><br>JUnit XML: `<testcase classname file name>` with `<failure>`, `<error>` or `<skipped>`, in `<testsuite>`s that may nest under `<testsuites>`. The snapshot comes from `<property name="keylang.snapshotId">` of the testcase or of the nearest suite around it: each suite of a merged…
      - calls [check.test-report.parseXml](check.md#check.test-report.parseXml)
    - type [XmlElement](../../src/test-report.ts#L99) <!-- internal -->
      <a id="check.test-report.XmlElement"></a>
    - fn [parseXml](../../src/test-report.ts#L113) (file: string, text: string) → XmlElement <!-- internal -->
      <a id="check.test-report.parseXml"></a><br>The element tree of an XML document: tags, attributes in either quote, the predefined and numeric entities, comments, CDATA, processing instructions and a DOCTYPE. Enough to read a report; not a validating parser.
      - calls [check.test-report.decodeEntities](check.md#check.test-report.decodeEntities)
    - fn [decodeEntities](../../src/test-report.ts#L196) (text: string) → string <!-- internal -->
      <a id="check.test-report.decodeEntities"></a>
    - type [TestEvidence](../../src/test-report.ts#L204)
      <a id="check.test-report.TestEvidence"></a>
    - fn [matchTest](../../src/test-report.ts#L215) (cases: readonly TestCase[], file: string, name: string, snapshotId: string | null) → TestEvidence
      <a id="check.test-report.matchTest"></a><br>Match `test <file> "<name>"`. The name may carry suites as `Suite > name`.
  - module [trace-evidence](../../src/trace-evidence.ts#L1)
    <a id="check.trace-evidence"></a><br>Trace evidence: JSONL spans from instrumented `@flow` tests (schema 1). Steps match as a nested subsequence inside one test: extra calls are fine, one span satisfies one step, order comes from start/end on one clock or from `links`, never from sorting timestamps.
    - node [external.node](external.md#external.node)
    - type [Mark](../../src/trace-evidence.ts#L12) <!-- internal -->
      <a id="check.trace-evidence.Mark"></a>
    - type [TraceSpan](../../src/trace-evidence.ts#L18)
      <a id="check.trace-evidence.TraceSpan"></a>
    - type [TraceRun](../../src/trace-evidence.ts#L27)
      <a id="check.trace-evidence.TraceRun"></a>
    - type [RunDraft](../../src/trace-evidence.ts#L46) extends TraceRun <!-- internal -->
      <a id="check.trace-evidence.RunDraft"></a><br>A run as it is read: `run` events accumulate until every file is read.
    - fn [loadTraces](../../src/trace-evidence.ts#L56) (root: string, files: readonly string[]) → TraceRun[]
      <a id="check.trace-evidence.loadTraces"></a><br>Read and validate trace files. A malformed line is an error naming file and line.
    - type [ShapeNode](../../src/trace-evidence.ts#L142)
      <a id="check.trace-evidence.ShapeNode"></a><br>A flow as trace matching sees it. `key` identifies the spec node across runs.
    - type [TraceEvidence](../../src/trace-evidence.ts#L144)
      <a id="check.trace-evidence.TraceEvidence"></a>
    - type [Outcome](../../src/trace-evidence.ts#L151) = TraceEvidence <!-- internal -->
      <a id="check.trace-evidence.Outcome"></a>
    - fn [traceFlow](../../src/trace-evidence.ts#L157) (runs: readonly TraceRun[], flow: string, trigger: { key: number; id: string } | null, shape: readonly ShapeNode[], snapshotId: string | null) → Map<number, TraceEvidence>
      <a id="check.trace-evidence.traceFlow"></a><br>Trace verdicts for every step and `when` of one flow, keyed by `ShapeNode.key`. The trigger (if any) must be observed; its steps are matched inside it.
      - calls [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.match](check.md#check.trace-evidence.Matcher.match), [check.trace-evidence.Matcher](check.md#check.trace-evidence.Matcher)
    - fn [keysOf](../../src/trace-evidence.ts#L193) (nodes: readonly ShapeNode[]) → number[] <!-- internal -->
      <a id="check.trace-evidence.keysOf"></a>
    - module [OverBudget](../../src/trace-evidence.ts#L200) <!-- internal -->
      <a id="check.trace-evidence.OverBudget"></a>
    - type [Assignment](../../src/trace-evidence.ts#L203) <!-- internal -->
      <a id="check.trace-evidence.Assignment"></a><br>Spans assigned to flow nodes: an outcome per node and the spans it took.
    - fn [assignment](../../src/trace-evidence.ts#L212) (outcomes: [number, Outcome][], spans: string[] = []) → Assignment <!-- internal -->
      <a id="check.trace-evidence.assignment"></a>
    - fn [combine](../../src/trace-evidence.ts#L216) (...parts: Assignment[]) → Assignment <!-- internal -->
      <a id="check.trace-evidence.combine"></a>
    - fn [better](../../src/trace-evidence.ts#L221) (a: Assignment, b: Assignment) → boolean <!-- internal -->
      <a id="check.trace-evidence.better"></a><br>More steps observed wins, then fewer failures; an earlier candidate keeps a tie.
    - module [Matcher](../../src/trace-evidence.ts#L231) <!-- internal -->
      <a id="check.trace-evidence.Matcher"></a><br>Matches one run against a flow. A test may call the trigger or a step more than once (an early `return` first, the real call later), so every span of a symbol is a candidate: the search keeps the assignment with the most observed steps, and a step fails only when no assignment…
      - fn [constructor](../../src/trace-evidence.ts#L244) (run: TraceRun)
        <a id="check.trace-evidence.Matcher.constructor"></a>
      - fn [match](../../src/trace-evidence.ts#L255) (nodes: readonly ShapeNode[], trigger: boolean) → [number, Outcome][]
        <a id="check.trace-evidence.Matcher.match"></a><br>Outcomes for `nodes` (the trigger with the steps inside it when `trigger`).
        - calls [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.Matcher.incompleteness](check.md#check.trace-evidence.Matcher.incompleteness)
      - fn [base](../../src/trace-evidence.ts#L269) () → { runId: string; testId: string } <!-- internal -->
        <a id="check.trace-evidence.Matcher.base"></a>
      - fn [descendants](../../src/trace-evidence.ts#L274) (parent: TraceSpan | null) → TraceSpan[] <!-- internal -->
        <a id="check.trace-evidence.Matcher.descendants"></a><br>Spans under `parent` (all spans for null), depth-first in start order.
      - fn [candidates](../../src/trace-evidence.ts#L293) (parent: TraceSpan | null, id: string) → TraceSpan[] <!-- internal -->
        <a id="check.trace-evidence.Matcher.candidates"></a>
        - calls [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants)
      - fn [incompleteness](../../src/trace-evidence.ts#L298) () → string | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.incompleteness"></a><br>Why the run cannot confirm or refute what it shows, or null for a finished run.
      - fn [absenceDoubt](../../src/trace-evidence.ts#L307) (id: string) → string | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.absenceDoubt"></a><br>Why an unobserved step is not a proven absence, or null when it is.
        - calls [check.trace-evidence.Matcher.incompleteness](check.md#check.trace-evidence.Matcher.incompleteness)
      - fn [bound](../../src/trace-evidence.ts#L316) (parent: TraceSpan | null, node: ShapeNode) → number <!-- internal -->
        <a id="check.trace-evidence.Matcher.bound"></a><br>The most steps of `node` and below that any assignment under `parent` could observe.
        - calls [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants)
      - fn [symbolsFrom](../../src/trace-evidence.ts#L328) (nodes: readonly ShapeNode[], i: number) → Set<string> <!-- internal -->
        <a id="check.trace-evidence.Matcher.symbolsFrom"></a><br>Symbols of `nodes[i..]` and everything under them.
      - fn [list](../../src/trace-evidence.ts#L352) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, previous: TraceSpan | null, trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.list"></a><br>The best assignment for `nodes[i..]` under `parent`, the sibling before them matched to `previous`. Memoized: the answer depends on the spans taken so far only through those it could take itself, so the search stays polynomial in the spans of a symbol.
        - calls [check.trace-evidence.Matcher.symbolsFrom](check.md#check.trace-evidence.Matcher.symbolsFrom), [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants), [check.trace-evidence.Matcher.solve](check.md#check.trace-evidence.Matcher.solve)
      - fn [solve](../../src/trace-evidence.ts#L376) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, previous: TraceSpan | null, trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.solve"></a>
        - calls [check.trace-evidence.Matcher.branch](check.md#check.trace-evidence.Matcher.branch), [check.trace-evidence.Matcher.candidates](check.md#check.trace-evidence.Matcher.candidates), [check.trace-evidence.startsBefore](check.md#check.trace-evidence.startsBefore), [check.trace-evidence.Matcher.bound](check.md#check.trace-evidence.Matcher.bound), [check.trace-evidence.Matcher.take](check.md#check.trace-evidence.Matcher.take), [check.trace-evidence.Matcher.orderOutcome](check.md#check.trace-evidence.Matcher.orderOutcome), [check.trace-evidence.better](check.md#check.trace-evidence.better), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.Matcher.absenceDoubt](check.md#check.trace-evidence.Matcher.absenceDoubt), [check.trace-evidence.Matcher.outsideRoot](check.md#check.trace-evidence.Matcher.outsideRoot), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list)
      - fn [take](../../src/trace-evidence.ts#L407) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, span: TraceSpan, outcome: Outcome, trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.take"></a><br>`span` as `node`: its children are matched inside it, the siblings after it.
        - calls [check.trace-evidence.OverBudget](check.md#check.trace-evidence.OverBudget), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment)
      - fn [branch](../../src/trace-evidence.ts#L419) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, previous: TraceSpan | null, trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.branch"></a><br>A `when` is exercised in this test when its first step is observed; its steps are not ordered after the siblings before it.
        - calls [check.trace-evidence.Matcher.candidates](check.md#check.trace-evidence.Matcher.candidates), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list)
      - fn [rootSpan](../../src/trace-evidence.ts#L433) (span: TraceSpan) → TraceSpan <!-- internal -->
        <a id="check.trace-evidence.Matcher.rootSpan"></a><br>Root of the `parentSpanId` chain. A span whose parent is missing is its own root.
      - fn [outsideRoot](../../src/trace-evidence.ts#L450) (parent: TraceSpan, id: string) → TraceSpan | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.outsideRoot"></a><br>A span of `id` whose call tree is not the parent's, and which did not start before the parent image on the same clock. Spans that did start earlier, and spans in the parent's own tree, stay a confirmed absence.
        - calls [check.trace-evidence.Matcher.rootSpan](check.md#check.trace-evidence.Matcher.rootSpan), [check.trace-evidence.startsBefore](check.md#check.trace-evidence.startsBefore)
      - fn [nestedIn](../../src/trace-evidence.ts#L462) (span: TraceSpan, ancestor: TraceSpan) → boolean <!-- internal -->
        <a id="check.trace-evidence.Matcher.nestedIn"></a><br>`span`'s parent chain passes through `ancestor` (the image of the previous sibling).
      - fn [orderOutcome](../../src/trace-evidence.ts#L473) (parent: TraceSpan | null, span: TraceSpan, after: TraceSpan | null) → Outcome <!-- internal -->
        <a id="check.trace-evidence.Matcher.orderOutcome"></a>
        - calls [check.trace-evidence.Matcher.nestedIn](check.md#check.trace-evidence.Matcher.nestedIn), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.sameClock](check.md#check.trace-evidence.sameClock)
    - fn [sameClock](../../src/trace-evidence.ts#L493) (a: Mark, b: Mark) → boolean <!-- internal -->
      <a id="check.trace-evidence.sameClock"></a>
    - fn [startsBefore](../../src/trace-evidence.ts#L497) (span: TraceSpan, other: TraceSpan) → boolean <!-- internal -->
      <a id="check.trace-evidence.startsBefore"></a>
      - calls [check.trace-evidence.sameClock](check.md#check.trace-evidence.sameClock)
  - module [verdict](../../src/verdict.ts#L1)
    <a id="check.verdict"></a><br>One rule outcome. `fail` is a known violation, `unverified` is missing evidence, `ok` is a covered pass.
    - type [VerdictKind](../../src/verdict.ts#L3) = "ok" | "fail" | "unverified"
      <a id="check.verdict.VerdictKind"></a>
    - type [Verdict](../../src/verdict.ts#L5)
      <a id="check.verdict.Verdict"></a>
    - fn [formatVerdict](../../src/verdict.ts#L23) (v: Verdict) → string
      <a id="check.verdict.formatVerdict"></a>
  - module [wiring](../../src/wiring.ts#L1)
    <a id="check.wiring"></a><br>`# wiring` (ADR 0003): each `wire <id>` is a factory, its children the named dependencies it is built from. The graph must be acyclic: its topological order is the order `keylang wire` initializes in.
    - diag [base.diag](base.md#base.diag)
    - languages [base.languages](base.md#base.languages)
    - config [base.config](base.md#base.config)
    - rules [check.rules](check.md#check.rules)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [WiringView](../../src/wiring.ts#L14)
      <a id="check.wiring.WiringView"></a><br>What the wiring checks read of the snapshot; `check` does not import `map`.
    - type [WireImport](../../src/wiring.ts#L27)
      <a id="check.wiring.WireImport"></a><br>How the generated file imports a factory: from its file, by its exported name (`default` for a default export). A static method is called on its imported class: `member` is its name as written.
    - type [WireOrder](../../src/wiring.ts#L33) = { order: string[] } | { cycle: string[] }
      <a id="check.wiring.WireOrder"></a>
    - fn [wireOrder](../../src/wiring.ts#L39) (wires: readonly Wire[]) → WireOrder
      <a id="check.wiring.wireOrder"></a><br>Dependencies before dependents, depth first in declaration order; an ID without its own `wire` is a leaf. The first cycle found otherwise.
    - fn [wireImport](../../src/wiring.ts#L73) (view: WiringView, id: string) → WireImport | { problem: string }
      <a id="check.wiring.wireImport"></a><br>The import the generated file needs for `id`, read from the exports table; a reason instead when no import can reach it: code of a language `wire` does not generate for, a method (static or not, the snapshot does not say), a name its module does not export.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [check.wiring.exportedAs](check.md#check.wiring.exportedAs)
    - fn [exportedAs](../../src/wiring.ts#L93) (view: WiringView, id: string) → string | null <!-- internal -->
      <a id="check.wiring.exportedAs"></a><br>The name a symbol is imported by from its own module (`default` for a default export), or null when it is not exported.
    - fn [checkWiring](../../src/wiring.ts#L106) (spec: SpecIR, view: WiringView | null, kindOf: (id: string) => string | undefined = () => undefined, format: RuleFormat = 1) → Diagnostic[]
      <a id="check.wiring.checkWiring"></a><br>K301 for a cycle; K302 for a factory that is not a fn or class, a decorator that is not a fn, or one the generated file cannot import; K002 for a dependency name given twice; K102 for a dependency `deny` forbids.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.wiring.wireOrder](check.md#check.wiring.wireOrder), [check.wiring.useProblem](check.md#check.wiring.useProblem), [check.rules.denyingRule](check.md#check.rules.denyingRule)
    - fn [useProblem](../../src/wiring.ts#L152) (view: WiringView, id: string, role: string) → string | null <!-- internal -->
      <a id="check.wiring.useProblem"></a><br>Why the generated file could not build or apply `id` in this role, or null; a missing ID is K001 from the resolver.
      - calls [check.wiring.wireImport](check.md#check.wiring.wireImport)
