<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [assess](#check.assess) · [flows](#check.flows) · [resolve](#check.resolve) · [rules](#check.rules) · [scc](#check.scc) · [test-report](#check.test-report) · [trace-evidence](#check.trace-evidence) · [verdict](#check.verdict) · [wiring](#check.wiring)

# map

- check
  <a id="check"></a><br>Turns specs and analysis snapshots into diagnostics and ok/fail/unverified verdicts for IDs, rules, flows and wiring. It may not depend on `extract` or [`external.web-tree-sitter`](external.md#external.web-tree-sitter). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
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
    - type [Assessment](../../src/assess.ts#L28)
      <a id="check.assess.Assessment"></a><br>Bundles the result of running the checker over a repository: the `Index` it worked from, the `Diagnostic` list it produced, the per-rule `Verdict`s, and the `SpecIR` of assertions compiled once from the text IR so later consumers reuse it rather than re-parsing. The input shows… _(llm · claude · 2026-10-04)_
    - fn [assess](../../src/assess.ts#L36) ( docs: readonly Document[], snapshot: SnapshotInput | null, evidence: { tests: TestCase[] | null; traces: TraceRun[] | null; static?: StaticMode; staticSetBy?: StaticSource; knownExternal?: ReadonlySet<string>; testFileExists?: FlowInput["testFileExists"]; } = { tests: null, traces: null }, format: RuleFormat = 1, ) → Assessment
      <a id="check.assess.assess"></a><br>Compiles the spec and resolves IDs against the snapshot, then runs rule, flow and wiring checks via [`check.rules.evaluateRules`](check.md#check.rules.evaluateRules), [`check.flows.evaluateFlows`](check.md#check.flows.evaluateFlows) and [`check.wiring.checkWiring`](check.md#check.wiring.checkWiring). Returns sorted diagnostics and merged verdicts. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.resolve.check](check.md#check.resolve.check), [check.rules.evaluateRules](check.md#check.rules.evaluateRules), [check.flows.evaluateFlows](check.md#check.flows.evaluateFlows), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.wiring.checkWiring](check.md#check.wiring.checkWiring), [check.assess.nodeKinds](check.md#check.assess.nodeKinds), [base.diag.compareDiagnostics](base.md#base.diag.compareDiagnostics), [check.rules.canonicalRuleSpec](check.md#check.rules.canonicalRuleSpec), [check.assess.afterRecovery](check.md#check.assess.afterRecovery), [check.assess.recoveredLines](check.md#check.assess.recoveredLines)
    - fn [recoveredLines](../../src/assess.ts#L109) (docs: readonly Document[]) → Map<string, string> <!-- internal -->
      <a id="check.assess.recoveredLines"></a><br>Item lines whose place in the tree the parser recovered after a K003 (an odd indent, a jump, a tab): the line itself and its subtree, keyed `file:line`, with the position of the nearest such K003.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [afterRecovery](../../src/assess.ts#L129) (verdicts: Verdict[], recovered: ReadonlyMap<string, string>) → Verdict[] <!-- internal -->
      <a id="check.assess.afterRecovery"></a><br>An `ok` on a recovered line is about a tree the file does not have: `unverified`. `fail` stays.
    - fn [sameFinding](../../src/assess.ts#L142) (verdict: Verdict, diagnostics: readonly Diagnostic[]) → boolean
      <a id="check.assess.sameFinding"></a><br>Returns true when any diagnostic in the list points at the same file and starting line as the verdict and either carries the same (or a contained) message, or is a K001 diagnostic whose target matches the verdict's area while the verdict is a failed "ID" criterion — so callers… _(llm · claude · 2026-10-04)_
    - fn [nodeKinds](../../src/assess.ts#L151) (nodes: SnapshotInput["nodes"]) → Map<string, string> <!-- internal -->
      <a id="check.assess.nodeKinds"></a><br>Snapshot kinds, with a class told apart by its marker.
  - module [flows](../../src/flows.ts#L1)
    <a id="check.flows"></a><br>Evidence for flows: ID, static, tests, and trace are separate verdicts. A step is checked from its parent (the trigger for a top-level step), never from its siblings.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - languages [base.languages](base.md#base.languages)
    - resolve [check.resolve](check.md#check.resolve)
    - span [base.span](base.md#base.span)
    - parser [lang.parser](lang.md#lang.parser)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - test-report [check.test-report](check.md#check.test-report)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - verdict [check.verdict](check.md#check.verdict)
    - type [Via](../../src/flows.ts#L19) <!-- internal -->
      <a id="check.flows.Via"></a><br>How a call edge came about when it is not a plain call of the code (`Via` of the graph): a hook, an argument, a framework's config.
    - type [SnapshotEdge](../../src/flows.ts#L21) <!-- internal -->
      <a id="check.flows.SnapshotEdge"></a><br>Shape of one edge in a snapshot: kind, source, resolved target or candidate list, resolution status, and file/line/col position, plus optional reason, text, injection mode, hook, site, closure and type-only flags. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - type [SnapshotNodeView](../../src/flows.ts#L47) <!-- internal -->
      <a id="check.flows.SnapshotNodeView"></a><br>Describes the shape of one node as read from a snapshot: its kind, optional class flag, layer, members and signature, source file and line span, plus an optional record of where and why the node escapes. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [FlowInput](../../src/flows.ts#L60)
      <a id="check.flows.FlowInput"></a><br>Shape of the data handed to the flow checker: a snapshot's nodes and edges plus uncovered constructs, the resolved static mode and who set it, test cases, trace runs, and an optional probe for whether a test path exists in the repository. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [EntryView](../../src/flows.ts#L90)
      <a id="check.flows.EntryView"></a><br>An entry point as flows read it.
    - type [Planned](../../src/flows.ts#L97) <!-- internal -->
      <a id="check.flows.Planned"></a><br>A `planned` declaration from the specs as the flow check tracks it: the declared kind and optional signature, where it is declared, and whether the code already has a symbol with that ID (`implemented`), which then yields K201 on a kind or signature mismatch, else K202. _(llm · claude · 2026-10-04)_
    - type [Channel](../../src/flows.ts#L106) = "ID" | "static" | "tests" | "trace" <!-- internal -->
      <a id="check.flows.Channel"></a><br>The four evidence channels of a flow verdict — `ID`, `static`, `tests` and `trace` — written into each verdict as its `criterion` and `code`. _(llm · claude · 2026-10-04)_
    - type [FlowNode](../../src/flows.ts#L108) = Trigger | FlowItem <!-- internal -->
      <a id="check.flows.FlowNode"></a><br>A union type alias that lets a single value in [`check.flows`](check.md#check.flows) stand for either a `Trigger` or a `FlowItem`, so flow-walking code can handle both the starting event and the subsequent steps through one type. The input shows no further definition for the two constituent types… _(llm · claude · 2026-10-04)_
    - fn [evaluateFlows](../../src/flows.ts#L110) (compiled: SpecIR, index: Index, input: FlowInput) → { diagnostics: Diagnostic[]; verdicts: Verdict[] }
      <a id="check.flows.evaluateFlows"></a><br>Walks each spec flow's steps, calls and claims to emit static reachability ([`check.flows.reachability`](check.md#check.flows.reachability)), trace ([`check.trace-evidence.traceFlow`](check.md#check.trace-evidence.traceFlow)) and test verdicts, plus K203 diagnostics for missing test files. _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [check.flows.collectPlanned](check.md#check.flows.collectPlanned), [check.flows.callGraph](check.md#check.flows.callGraph), [check.flows.specHash](check.md#check.flows.specHash), [check.trace-evidence.traceFlow](check.md#check.trace-evidence.traceFlow), [check.flows.idVerdict](check.md#check.flows.idVerdict), [check.flows.entryVerdict](check.md#check.flows.entryVerdict), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.flows.reachability](check.md#check.flows.reachability), [check.flows.traceProvenance](check.md#check.flows.traceProvenance), [check.flows.directCall](check.md#check.flows.directCall), [check.flows.claimArea](check.md#check.flows.claimArea), [check.flows.scheduleVerdict](check.md#check.flows.scheduleVerdict), [check.flows.quantitative](check.md#check.flows.quantitative), [check.test-report.matchTest](check.md#check.test-report.matchTest)
    - fn [claimArea](../../src/flows.ts#L281) (node: ClaimItem | ThenItem | WhenItem | TimerItem) → string <!-- internal -->
      <a id="check.flows.claimArea"></a><br>Builds a short human-readable label for a flow item by prefixing its kind to its condition, prose, or reference target, choosing the field based on the item's shape. Used by [`check.flows.evaluateFlows`](check.md#check.flows.evaluateFlows) to name the area a diagnostic or verdict refers to. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [entryVerdict](../../src/flows.ts#L294) (kind: string, id: string, entries: readonly EntryView[] | undefined) → { verdict: Verdict["verdict"]; message: string; mismatch: boolean } <!-- internal -->
      <a id="check.flows.entryVerdict"></a><br>`trigger <kind> <id>` against the entry points of the snapshot: `ok` with the entry's label when the fn is an entry of that kind; `mismatch` (K205) when it is an entry of other kinds only; `unverified` when no entry names it, since an adapter keylang lacks may know it.
    - fn [scheduleForm](../../src/flows.ts#L318) (text: string) → { form: "cron" | "duration"; value: string } <!-- internal -->
      <a id="check.flows.scheduleForm"></a><br>A schedule in a comparable form: cron fields (a macro expanded) or a duration.
    - fn [labelSchedule](../../src/flows.ts#L329) (label: string) → string | null <!-- internal -->
      <a id="check.flows.labelSchedule"></a><br>The schedule a cron entry's label carries: the whole label when it is one, else its last six or five words (`clean_quotes 0 0 * * *`); null when the adapter did not write it.
      - calls [lang.parser.scheduleText](lang.md#lang.parser.scheduleText)
    - fn [scheduleVerdict](../../src/flows.ts#L341) (parent: string | null, written: string, entries: readonly EntryView[] | undefined) → { verdict: Verdict["verdict"]; message: string } <!-- internal -->
      <a id="check.flows.scheduleVerdict"></a><br>Static evidence of `every <schedule>`: the cron entry point of the parent (the trigger for a top-level line) runs on the written schedule. `ok` when one does, `fail` when every cron entry of the fn says another schedule of the same form, else `unverified` (no cron entry, no…
      - calls [check.flows.scheduleForm](check.md#check.flows.scheduleForm), [check.flows.labelSchedule](check.md#check.flows.labelSchedule)
    - fn [traceProvenance](../../src/flows.ts#L360) (evidence: TraceEvidence) → Verdict["evidence"] <!-- internal -->
      <a id="check.flows.traceProvenance"></a><br>Builds the evidence record attached to a trace-backed verdict: a fixed `provenance: "trace"` marker plus `runId` and `testId` copied over only when present on the input. Used by [`check.flows.evaluateFlows`](check.md#check.flows.evaluateFlows) to stamp verdicts derived from runtime traces. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [quantitative](../../src/flows.ts#L365) (text: string) → boolean <!-- internal -->
      <a id="check.flows.quantitative"></a><br>A count, a bound, or a negation: a subsequence of calls cannot prove it.
    - fn [idVerdict](../../src/flows.ts#L369) ( id: string, plan: Planned | undefined, span: Span, file: string, index: Index, input: FlowInput, verdict: (channel: Channel, area: string, value: Verdict["verdict"], file: string, span: Span, message: string) => void, ) → Verdict["verdict"] <!-- internal -->
      <a id="check.flows.idVerdict"></a><br>Classifies a single referenced ID: "unverified" if it has a plan entry or [`check.flows.moduleMembers`](check.md#check.flows.moduleMembers) deems its module opaque, "ok" if present in the input nodes or [`check.resolve.Index.lookup`](check.md#check.resolve.Index.lookup) finds an exact match, otherwise "fail" with K001. It emits the result through the… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [check.flows.moduleMembers](check.md#check.flows.moduleMembers)
    - type [Step](../../src/flows.ts#L388) <!-- internal -->
      <a id="check.flows.Step"></a><br>Represents one hop in a traced path through the dependency graph: the source node ID, the target node ID, and the snapshot edge connecting them. Used to assemble flow chains during the check phase. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [CallGraph](../../src/flows.ts#L394) <!-- internal -->
      <a id="check.flows.CallGraph"></a><br>Call-graph index for flow checks: resolved and open call edges by source, callers per function, name and case-insensitive lookups, and per-function flags for unread, replaced or unparsable code. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - fn [callGraph](../../src/flows.ts#L422) (input: FlowInput) → CallGraph <!-- internal -->
      <a id="check.flows.callGraph"></a><br>Indexes call edges into resolved, unresolved and caller maps (mapping class targets to their constructors), plus function lookups by name and caseless name, unsupported coverage, and doubtful bodies via [`check.flows.doubtfulBodies`](check.md#check.flows.doubtfulBodies). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
      - calls [base.languages.constructorName](base.md#base.languages.constructorName), [check.flows.callName](check.md#check.flows.callName), [base.languages.caselessNames](base.md#base.languages.caselessNames), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [check.flows.doubtfulBodies](check.md#check.flows.doubtfulBodies)
    - fn [doubtfulBodies](../../src/flows.ts#L466) (input: FlowInput) → { replaced: Map<string, string>; unreadable: Map<string, string> } <!-- internal -->
      <a id="check.flows.doubtfulBodies"></a><br>Fns whose body a proof cannot pass through. A decorator in coverage (`@replace` before `def decorated`) belongs to the fn it names as its source or, when its source is the module, to the first fn declared at or after it.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [lastSegment](../../src/flows.ts#L486) (text: string) → string <!-- internal -->
      <a id="check.flows.lastSegment"></a><br>Returns the substring after the final dot in the input, or the whole string when no dot is present; used by [`check.flows.callName`](check.md#check.flows.callName), [`check.flows.describeHole`](check.md#check.flows.describeHole), [`check.flows.directCall`](check.md#check.flows.directCall) and [`check.flows.possibleRoute`](check.md#check.flows.possibleRoute) to strip dotted prefixes from node identifiers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [callName](../../src/flows.ts#L494) (id: string) → string <!-- internal -->
      <a id="check.flows.callName"></a><br>The name code calls a fn by: `m` for `X.m` and `X.m-static`, `#go` for `X.go-private` (§11: a member that shares its name with another gets a suffix).
      - calls [check.flows.lastSegment](check.md#check.flows.lastSegment)
    - fn [namedLike](../../src/flows.ts#L506) (graph: CallGraph, name: string) → string[] <!-- internal -->
      <a id="check.flows.namedLike"></a><br>Fns a call by `name` (`feed`, `#work`) may run. A `#work` call also matches a private member whose ID has no suffix; a fn of PHP matches the name in any ASCII case (`x.RUN` may run `run`).
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [describeVia](../../src/flows.ts#L512) (edge: SnapshotEdge, where = true) → string <!-- internal -->
      <a id="check.flows.describeVia"></a><br>A `via` edge in words. `where`: with the position of a passed callable (a hole's message adds the edge's position itself).
      - calls [check.flows.describeConfig](check.md#check.flows.describeConfig), [check.flows.at](check.md#check.flows.at)
    - fn [describeConfig](../../src/flows.ts#L526) (edge: Pick<SnapshotEdge, "via" | "binding" | "site" | "scope">) → string
      <a id="check.flows.describeConfig"></a><br>A call the framework makes by its config, as the verdict names it: `the preference `I → C` in `etc/di.xml:12``, `the plugin `p` (`P`) on `X` (plugin:around) in `etc/di.xml:30``, with the area when it is not global.
    - fn [provesIn](../../src/flows.ts#L540) (behavior: boolean) → (step: Step) => boolean <!-- internal -->
      <a id="check.flows.provesIn"></a><br>The edges a static mode follows as a proof: plain calls outside closures; in `behavior` also hook edges, callables passed as arguments and calls in a closure passed as an argument (the callee of the call holds it).
    - fn [closureOnly](../../src/flows.ts#L549) (edge: SnapshotEdge, behavior: boolean) → boolean <!-- internal -->
      <a id="check.flows.closureOnly"></a><br>The edge is a route only when some holder calls the closure it sits in: a call in a stored closure, or (in `behavior`) a callable passed from inside one. In `shape`, a closure passed as an argument is named as its `via`.
    - fn [describeHole](../../src/flows.ts#L553) (edge: SnapshotEdge, target: string, input: FlowInput) → string <!-- internal -->
      <a id="check.flows.describeHole"></a><br>Builds the human-readable reason a call edge couldn't be followed: ambiguous candidates, a resolved-but-`via` edge skipped in static mode, a possible dynamic dispatch via [`check.flows.lastSegment`](check.md#check.flows.lastSegment)/[`check.flows.callName`](check.md#check.flows.callName), or the edge's own unresolved reason. Used by… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [check.flows.describeVia](check.md#check.flows.describeVia), [check.flows.lastSegment](check.md#check.flows.lastSegment), [check.flows.callName](check.md#check.flows.callName)
    - fn [at](../../src/flows.ts#L565) (edge: SnapshotEdge) → string <!-- internal -->
      <a id="check.flows.at"></a><br>Formats a snapshot edge's file, line and column into a single `file:line:col` location string. Used by [`check.flows.directCall`](check.md#check.flows.directCall), [`check.flows.escapeOf`](check.md#check.flows.escapeOf) and [`check.flows.reachability`](check.md#check.flows.reachability) to cite where a flow was observed in their verdict messages. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [reachability](../../src/flows.ts#L592) (graph: CallGraph, input: FlowInput, parent: string | null, target: string) → { verdict: Verdict["verdict"]; message: string } <!-- internal -->
      <a id="check.flows.reachability"></a><br>Static reachability of `target` from `parent`.
      - calls [check.flows.externalImport](check.md#check.flows.externalImport), [check.flows.provesIn](check.md#check.flows.provesIn), [check.flows.search](check.md#check.flows.search), [check.flows.routeMessage](check.md#check.flows.routeMessage), [check.flows.routeSteps](check.md#check.flows.routeSteps), [check.flows.possibleRoute](check.md#check.flows.possibleRoute), [check.flows.closureOnly](check.md#check.flows.closureOnly), [check.flows.at](check.md#check.flows.at), [check.flows.describeHole](check.md#check.flows.describeHole), [check.flows.callersOf](check.md#check.flows.callersOf), [check.flows.escapeOf](check.md#check.flows.escapeOf), [check.flows.holeNear](check.md#check.flows.holeNear)
    - fn [directCall](../../src/flows.ts#L660) (graph: CallGraph, input: FlowInput, parent: string | null, target: string) → { verdict: Verdict["verdict"]; message: string } <!-- internal -->
      <a id="check.flows.directCall"></a><br>Static evidence for `calls`: whether `parent` calls `target` itself, without order. `ok` is a resolved call in the parent's own body that this mode follows. `fail` is a confirmed absence under the rules of a step's absence: no call of the parent can be the target (no unresolved…
      - calls [check.flows.externalImport](check.md#check.flows.externalImport), [check.flows.provesIn](check.md#check.flows.provesIn), [check.flows.routeMessage](check.md#check.flows.routeMessage), [check.flows.closureOnly](check.md#check.flows.closureOnly), [check.flows.at](check.md#check.flows.at), [check.flows.describeHole](check.md#check.flows.describeHole), [check.flows.namedLike](check.md#check.flows.namedLike), [check.flows.lastSegment](check.md#check.flows.lastSegment), [base.languages.caselessNames](base.md#base.languages.caselessNames), [check.flows.callName](check.md#check.flows.callName), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [check.flows.escapeOf](check.md#check.flows.escapeOf), [check.flows.search](check.md#check.flows.search), [check.flows.routeSteps](check.md#check.flows.routeSteps)
    - fn [search](../../src/flows.ts#L708) (graph: CallGraph, parent: string, target: string, follow: (step: Step) => boolean) → { route: Map<string, Step> | null; depth: Map<string, number> } <!-- internal -->
      <a id="check.flows.search"></a><br>Breadth-first from `parent` over the steps `follow` accepts: the route to `target` (null when there is none) and the depth of every fn reached. The search stops at the target, so `depth` is complete only without a route.
    - fn [routeSteps](../../src/flows.ts#L731) (parent: string, target: string, previous: Map<string, Step>) → Step[] <!-- internal -->
      <a id="check.flows.routeSteps"></a><br>The steps of a route from `parent` to `target`, in call order.
    - fn [fileModule](../../src/flows.ts#L744) (nodes: FlowInput["nodes"], id: string) → string | null <!-- internal -->
      <a id="check.flows.fileModule"></a><br>The file module of a fn: the nearest module that is not a class.
    - fn [externalImport](../../src/flows.ts#L760) (input: FlowInput, parent: string, target: string) → { verdict: Verdict["verdict"]; message: string } <!-- internal -->
      <a id="check.flows.externalImport"></a><br>Static proof for `external.<pkg>`: a resolved import from the parent fn's own module that loads the package. A type-only one (`import type`, `export type … from`) is erased from the code that runs, so it proves nothing.
      - calls [check.flows.fileModule](check.md#check.flows.fileModule), [check.flows.at](check.md#check.flows.at)
    - fn [describeDocblock](../../src/flows.ts#L772) (edge: SnapshotEdge) → string <!-- internal -->
      <a id="check.flows.describeDocblock"></a><br>An edge that rests on a docblock: where PHP's `@var` or `@param` types the receiver.
      - calls [check.flows.at](check.md#check.flows.at)
    - fn [routeMessage](../../src/flows.ts#L781) (parent: string, target: string, previous: Map<string, Step>) → string <!-- internal -->
      <a id="check.flows.routeMessage"></a><br>The route as the verdict prints it, with a note on every step that is not a plain call of the code: a hook (its default, or the value injected at a site) or a call whose receiver only a docblock types.
      - calls [check.flows.routeSteps](check.md#check.flows.routeSteps), [check.flows.describeVia](check.md#check.flows.describeVia), [check.flows.describeDocblock](check.md#check.flows.describeDocblock)
    - fn [possibleRoute](../../src/flows.ts#L797) (graph: CallGraph, input: FlowInput, parent: string, target: string, proves: (step: Step) => boolean) → { edge: SnapshotEdge | null; seen: Set<string> } <!-- internal -->
      <a id="check.flows.possibleRoute"></a><br>Breadth-first search that also follows calls with more than one possible target and calls in closures. Returns the first such call on the shortest route (null when there is none) and every fn the search reached.
      - calls [check.flows.namedLike](check.md#check.flows.namedLike), [check.flows.callName](check.md#check.flows.callName), [check.flows.lastSegment](check.md#check.flows.lastSegment)
    - fn [callersOf](../../src/flows.ts#L825) (graph: CallGraph, target: string) → Set<string> <!-- internal -->
      <a id="check.flows.callersOf"></a><br>Every fn with a resolved or candidate route to `target`, the target included.
    - fn [escapeOf](../../src/flows.ts#L843) (graph: CallGraph, input: FlowInput, routes: Set<string>, reachable: ReadonlySet<string>) → { reason: string; from: string | null } | null <!-- internal -->
      <a id="check.flows.escapeOf"></a><br>Why code keylang cannot follow may still run a fn of `routes`, and the fn whose code hands that fn on (null when it is not in a fn: module level, an unsupported construct); null when every route is by name.
      - calls [check.flows.fnAt](check.md#check.flows.fnAt), [check.flows.at](check.md#check.flows.at), [check.flows.callName](check.md#check.flows.callName), [base.languages.caselessNames](base.md#base.languages.caselessNames), [check.flows.identifierPattern](check.md#check.flows.identifierPattern), [base.span.compareText](base.md#base.span.compareText)
    - fn [identifierPattern](../../src/flows.ts#L883) (name: string, caseless = false) → RegExp <!-- internal -->
      <a id="check.flows.identifierPattern"></a><br>`name` as a whole identifier: `$save` and `зберегти` too, which `\b` does not delimit; `caseless`: in any ASCII case, as PHP compares names (`HELPER` is `helper`, `ÄNDERN` is no `ändern`), which the flag `i` would not keep apart.
    - fn [fnAt](../../src/flows.ts#L890) (input: FlowInput, file: string, line: number) → string | null <!-- internal -->
      <a id="check.flows.fnAt"></a><br>The innermost fn whose declaration holds `file:line`.
    - fn [holeNear](../../src/flows.ts#L904) (graph: CallGraph, holes: { edge: SnapshotEdge }[], from: string) → SnapshotEdge | null <!-- internal -->
      <a id="check.flows.holeNear"></a><br>The unresolved call in reachable code nearest `from` among the fns `from` calls, itself included: where a value handed on by `from` may be called. Null when no hole is downstream of it.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [moduleMembers](../../src/flows.ts#L920) (nodes: FlowInput["nodes"], id: string) → "complete" | "opaque" | null <!-- internal -->
      <a id="check.flows.moduleMembers"></a><br>Walks up the dotted ancestors of an ID until it finds an enclosing module node whose membership is declared "complete" or "opaque", returning that value. Yields null if no such module appears before the ID runs out of segments; used by [`check.flows.idVerdict`](check.md#check.flows.idVerdict). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [collectPlanned](../../src/flows.ts#L936) (spec: SpecIR, input: FlowInput, diagnostics: Diagnostic[]) → Map<string, Planned> <!-- internal -->
      <a id="check.flows.collectPlanned"></a><br>`planned` declarations. A duplicate is K002.
      - calls [check.flows.codeLocation](check.md#check.flows.codeLocation), [check.flows.plannedMismatch](check.md#check.flows.plannedMismatch), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [codeLocation](../../src/flows.ts#L965) (id: string, code: SnapshotNodeView, edges: readonly SnapshotEdge[]) → string <!-- internal -->
      <a id="check.flows.codeLocation"></a><br>Where the code of a planned id is: its file and line, or for a node without a file (a package) its first importer. Neither: `in the code`.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [plannedMismatch](../../src/flows.ts#L976) (item: { decl: string; signature: string | null }, code: { kind: string; signature?: string | null; file?: string | null }) → "kind" | "signature" | null
      <a id="check.flows.plannedMismatch"></a><br>How the code differs from a `planned` declaration of the same id: K201 for a kind or a signature, null (K202) when it matches.
      - calls [check.flows.sameSignature](check.md#check.flows.sameSignature)
    - fn [sameSignature](../../src/flows.ts#L989) (planned: string, code: string, file: string | null) → boolean <!-- internal -->
      <a id="check.flows.sameSignature"></a><br>Signatures match without spaces, `->` as `→`. A Python method shows its receiver (`(self, to: str)`), a plan may name only what the caller passes (`(to: str)`): both match.
      - calls [check.flows.normalizeSignature](check.md#check.flows.normalizeSignature), [check.flows.parameterList](check.md#check.flows.parameterList)
    - fn [parameterList](../../src/flows.ts#L1000) (signature: string) → string | null <!-- internal -->
      <a id="check.flows.parameterList"></a><br>The leading `(…)` of a normalized signature, up to the parenthesis that closes the first; null when there is none.
    - fn [normalizeSignature](../../src/flows.ts#L1010) (text: string) → string <!-- internal -->
      <a id="check.flows.normalizeSignature"></a><br>Canonicalizes a signature string by replacing every `->` with `→`, stripping all whitespace, and dropping a trailing semicolon. Used by [`check.flows.plannedMismatch`](check.md#check.flows.plannedMismatch) so planned and actual signatures can be compared without formatting noise. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [specHash](../../src/flows.ts#L1014) (text: string) → string <!-- internal -->
      <a id="check.flows.specHash"></a><br>Computes a SHA-256 digest of the given text and returns it as a hex string. [`check.flows.evaluateFlows`](check.md#check.flows.evaluateFlows) uses it to fingerprint spec content so results can be tied to a specific spec version. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [resolve](../../src/resolve.ts#L1)
    <a id="check.resolve"></a><br>Cross-file ID resolution: builds the declaration index and reports duplicate declarations (K002) and dangling references (K001).
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - type [Decl](../../src/resolve.ts#L10)
      <a id="check.resolve.Decl"></a><br>Record describing a resolved declaration: its ID, node kind, source file, and the span of the declared name used as a definition target. The `hasMembers` flag marks whether a module exposes children; when false, any dotted member access resolves to the module itself. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Lookup](../../src/resolve.ts#L23)
      <a id="check.resolve.Lookup"></a><br>Discriminated union describing the outcome of resolving a reference: an exact match to a declaration, a hit on an opaque module whose inner path is not tracked, or no declaration found. Each resolved variant carries the matched `Decl`. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Members](../../src/resolve.ts#L30) = (moduleId: string) => "complete" | "opaque" | undefined
      <a id="check.resolve.Members"></a><br>What the snapshot knows about a module's members; `undefined` when it has no such module.
    - type [ResolveContext](../../src/resolve.ts#L33)
      <a id="check.resolve.ResolveContext"></a><br>What resolution knows besides the documents.
    - type [Unverified](../../src/resolve.ts#L43)
      <a id="check.resolve.Unverified"></a><br>A reference into a module whose contents the snapshot does not know: neither confirmed nor dangling.
    - module [Index](../../src/resolve.ts#L54)
      <a id="check.resolve.Index"></a><br>Holds declarations, flows, and planned entries by dotted ID, resolving a lookup to exact, missing, or opaque by walking to the longest known module prefix and consulting the snapshot's member status. [`check.resolve.Index.suggest`](check.md#check.resolve.Index.suggest) finds the closest sibling name for a missing… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [constructor](../../src/resolve.ts#L61) (members?: Members)
        <a id="check.resolve.Index.constructor"></a><br>Stores the optional `Members` map on the new [`check.resolve.Index`](check.md#check.resolve.Index) instance without validating or copying it, leaving the field undefined when no argument is passed. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [lookup](../../src/resolve.ts#L65) (id: string) → Lookup
        <a id="check.resolve.Index.lookup"></a><br>Resolves an identifier to an exact declaration, or falls back via [`check.resolve.Index.longestPrefix`](check.md#check.resolve.Index.longestPrefix) to its enclosing module, reporting it as opaque when that module's members are unknown or partly parsed and missing otherwise. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [check.resolve.Index.longestPrefix](check.md#check.resolve.Index.longestPrefix)
      - fn [snapshotOpaque](../../src/resolve.ts#L78) (id: string) → boolean
        <a id="check.resolve.Index.snapshotOpaque"></a><br>The snapshot knows the module and says its contents are unknown.
      - fn [longestPrefix](../../src/resolve.ts#L82) (id: string) → Decl | undefined <!-- internal -->
        <a id="check.resolve.Index.longestPrefix"></a><br>Strips trailing dot-separated segments from a dotted id one at a time, returning the first declaration found in `this.decls` for a shorter prefix, or undefined if no prefix matches. Used by [`check.resolve.Index.lookup`](check.md#check.resolve.Index.lookup) and [`check.resolve.Index.suggest`](check.md#check.resolve.Index.suggest) to find the nearest… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [suggest](../../src/resolve.ts#L94) (id: string) → string | undefined
        <a id="check.resolve.Index.suggest"></a><br>Best-effort "did you mean" among siblings of the missing segment.
        - calls [check.resolve.Index.longestPrefix](check.md#check.resolve.Index.longestPrefix), [check.resolve.similarity](check.md#check.resolve.similarity)
      - fn [toJSON](../../src/resolve.ts#L112) () → { decls: Record<string, Decl>; flows: Record<string, Decl> }
        <a id="check.resolve.Index.toJSON"></a><br>Converts the index's two internal `Map`s of declarations and flows into plain objects keyed by their string IDs, producing a JSON-serializable snapshot of the resolved symbol table. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - fn [similarity](../../src/resolve.ts#L122) (a: string, b: string) → number | null <!-- internal -->
      <a id="check.resolve.similarity"></a><br>How close two names are for a suggestion (0 = one contains the other), or null when too far: a short name only matches a near-exact typo, so `zz` does not suggest `ab`, nor `banana` a layer `a`.
      - calls [check.resolve.codePoints](check.md#check.resolve.codePoints), [check.resolve.levenshtein](check.md#check.resolve.levenshtein)
    - fn [codePoints](../../src/resolve.ts#L131) (s: string) → number <!-- internal -->
      <a id="check.resolve.codePoints"></a><br>Counts the Unicode code points in a string by spreading it into an array, so surrogate pairs count once rather than twice as with `.length`. Used by [`check.resolve.similarity`](check.md#check.resolve.similarity) to size strings for comparison. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [check](../../src/resolve.ts#L136) (docs: readonly Document[], context: ResolveContext = {}) → { index: Index; diagnostics: Diagnostic[]; unverified: Unverified[] }
      <a id="check.resolve.check"></a><br>Build the index over all documents and check every reference.
      - calls [check.resolve.Index](check.md#check.resolve.Index), [check.resolve.insert](check.md#check.resolve.insert), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [lang.ir.isDecl](lang.md#lang.ir.isDecl), [check.resolve.checkRefs](check.md#check.resolve.checkRefs)
    - fn [insert](../../src/resolve.ts#L186) (map: Map<string, Decl>, decl: Decl, what: string, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.insert"></a><br>Adds a declaration to the map keyed by its id, silently allowing two `layer` declarations with the same id. For any other collision it emits a K002 diagnostic via [`base.diag.diagnostic`](base.md#base.diag.diagnostic) pointing at the first declaration's location. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [thenCandidates](../../src/resolve.ts#L210) (index: Index, word: string) → string[] <!-- internal -->
      <a id="check.resolve.thenCandidates"></a><br>Ids whose last segment is `word`: map declarations and `planned`, never a layer.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [warnBareThen](../../src/resolve.ts#L224) (index: Index, doc: Document, node: Node, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.warnBareThen"></a><br>`then save` is text (Р10). When `save` is the last segment of a real id, say so.
      - calls [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [check.resolve.thenCandidates](check.md#check.resolve.thenCandidates), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [danglingMessage](../../src/resolve.ts#L249) (index: Index, doc: Document, target: string) → string <!-- internal -->
      <a id="check.resolve.danglingMessage"></a><br>K001 text. A generated file is regenerated, not edited, so `did you mean` and `planned` would mislead there: the hint names the command from its marker.
      - calls [check.resolve.Index.suggest](check.md#check.resolve.Index.suggest)
    - fn [checkContinues](../../src/resolve.ts#L260) (index: Index, doc: Document, node: Node, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.checkContinues"></a><br>K206: `continues <flow>` names a flow no `# flow` declares.
      - calls [check.resolve.similarity](check.md#check.resolve.similarity), [base.span.compareText](base.md#base.span.compareText), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [checkRefs](../../src/resolve.ts#L271) (index: Index, doc: Document, node: Node, diags: Diagnostic[], unverified: Unverified[], knownExternal: ReadonlySet<string>) → void <!-- internal -->
      <a id="check.resolve.checkRefs"></a><br>Recursively walks a node tree, reporting dangling reference targets as K001 errors via [`base.diag.diagnostic`](base.md#base.diag.diagnostic) and logging refs to opaque snapshot modules as unverified; children of a failing rule-module are skipped. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [check.resolve.warnBareThen](check.md#check.resolve.warnBareThen), [check.resolve.checkContinues](check.md#check.resolve.checkContinues), [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.resolve.danglingMessage](check.md#check.resolve.danglingMessage), [check.resolve.Index.snapshotOpaque](check.md#check.resolve.Index.snapshotOpaque), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [levenshtein](../../src/resolve.ts#L301) (a: string, b: string) → number <!-- internal -->
      <a id="check.resolve.levenshtein"></a><br>Computes the edit distance between two strings using a two-row dynamic-programming table, iterating over Unicode code points rather than UTF-16 units. [`check.resolve.similarity`](check.md#check.resolve.similarity) uses the result to score how close two names are. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
      <a id="check.rules.Rule"></a><br>Holds one parsed dependency rule: a source area `a`, the list of target areas `b` it may or may not touch, plus the file, `Span`, and original text it came from. The `generated` flag marks baseline rules that a hand-written rule over the same areas overrides. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [LayerOrder](../../src/rules.ts#L35) <!-- internal -->
      <a id="check.rules.LayerOrder"></a><br>One `layers a < b < c` line: `a` lowest.
    - type [UseEdge](../../src/rules.ts#L42) <!-- internal -->
      <a id="check.rules.UseEdge"></a><br>Describes one dependency between two code locations for rule checking: the nearest module and file unit of each end, edge kind (import, call, type, reexport), whether it is type-only, and its source position. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
    - fn [docblockNote](../../src/rules.ts#L63) (edge: Pick<UseEdge, "docblock" | "config">) → string <!-- internal -->
      <a id="check.rules.docblockNote"></a><br>The note a verdict adds to a dependency that exists only thanks to a docblock, or only in a framework's config.
    - fn [configNote](../../src/rules.ts#L71) (edge: { via?: string; binding?: string; site?: string; scope?: string }) → string <!-- internal -->
      <a id="check.rules.configNote"></a><br>A config edge in words for a K102: `the preference `I → C` (app/etc/di.xml:12)`.
    - fn [siteAt](../../src/rules.ts#L79) (site: string | undefined) → { file: string; line: number; col: number } | null <!-- internal -->
      <a id="check.rules.siteAt"></a><br>`file:line:col` → its parts; null for another shape.
    - type [RuleReport](../../src/rules.ts#L86)
      <a id="check.rules.RuleReport"></a><br>Bundles the output of a rule check: a list of `Diagnostic` entries describing violations and a list of `Verdict` entries recording the outcome for each evaluated rule. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [checkRules](../../src/rules.ts#L91) (docs: readonly Document[], index: Index, snapshot: SnapshotView | null = null) → Diagnostic[]
      <a id="check.rules.checkRules"></a><br>Compiles the spec documents with [`lang.spec-ir.compileSpec`](lang.md#lang.spec-ir.compileSpec), then evaluates the resulting rules against the index and optional snapshot via [`check.rules.evaluateRules`](check.md#check.rules.evaluateRules), returning compile and rule diagnostics together. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.rules.evaluateRules](check.md#check.rules.evaluateRules)
    - fn [dependencyKindOf](../../src/rules.ts#L97) ( source: readonly Document[] | SpecIR, index: Index, nodes: Readonly<Record<string, { kind: string }>> | undefined, ) → (id: string) => string | undefined
      <a id="check.rules.dependencyKindOf"></a><br>Kind of an id the way `evaluateRules` sees it: a fn, type, or event rule applies nowhere.
      - calls [check.rules.specOf](check.md#check.rules.specOf), [check.rules.plannedDecl](check.md#check.rules.plannedDecl)
    - fn [blocksDependency](../../src/rules.ts#L107) ( spec: SpecIR, from: string, to: string, kindOf: (id: string) => string | undefined = () => undefined, format: RuleFormat = 1, ) → boolean
      <a id="check.rules.blocksDependency"></a><br>Whether `from` depending on `to` is forbidden by the deny that wins under `format`.
      - calls [check.rules.denyingRule](check.md#check.rules.denyingRule)
    - fn [denyingRule](../../src/rules.ts#L121) ( spec: SpecIR, from: string, to: string, kindOf: (id: string) => string | undefined = () => undefined, format: RuleFormat = 1, ) → { text: string; file: string; line: number; aside: string } | null
      <a id="check.rules.denyingRule"></a><br>The deny that wins `from → to`, or null. `aside` is the incomparable allow a K102 should name: empty when the deny won because it was more specific.
      - calls [check.rules.collectRules](check.md#check.rules.collectRules), [check.rules.ruleHits](check.md#check.rules.ruleHits), [check.rules.specific](check.md#check.rules.specific), [check.rules.incomparableAside](check.md#check.rules.incomparableAside), [check.rules.decide](check.md#check.rules.decide), [check.rules.byHit](check.md#check.rules.byHit)
    - fn [evaluateRules](../../src/rules.ts#L145) (spec: SpecIR, index: Index, snapshot: SnapshotView | null, docs: readonly Document[] = [], format: RuleFormat = 1) → RuleReport
      <a id="check.rules.evaluateRules"></a><br>Collects spec rules with node kinds resolved from snapshot, index, or [`check.rules.plannedDecl`](check.md#check.rules.plannedDecl), then evaluates them via [`check.rules.evaluateOnSnapshot`](check.md#check.rules.evaluateOnSnapshot), or without a snapshot emits one "unverified" verdict at the first rule line. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [check.rules.plannedDecl](check.md#check.rules.plannedDecl), [check.rules.collectRules](check.md#check.rules.collectRules), [check.rules.incomparableWarnings](check.md#check.rules.incomparableWarnings), [check.rules.firstRuleLine](check.md#check.rules.firstRuleLine), [check.rules.hashText](check.md#check.rules.hashText), [check.rules.noSnapshotSpec](check.md#check.rules.noSnapshotSpec), [check.rules.evaluateOnSnapshot](check.md#check.rules.evaluateOnSnapshot)
    - fn [specOf](../../src/rules.ts#L172) (source: readonly Document[] | SpecIR) → SpecIR <!-- internal -->
      <a id="check.rules.specOf"></a><br>Normalizes input to a compiled spec: returns it unchanged if it already has `rules`, otherwise compiles the documents via [`lang.spec-ir.compileSpec`](lang.md#lang.spec-ir.compileSpec) and discards the diagnostics. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec)
    - fn [plannedDecl](../../src/rules.ts#L177) (spec: SpecIR, id: string) → string <!-- internal -->
      <a id="check.rules.plannedDecl"></a><br>Looks up the planned entry in the spec whose `id` matches and returns its `decl` field, defaulting to `"fn"` when no match exists; used by [`check.rules.dependencyKindOf`](check.md#check.rules.dependencyKindOf) and [`check.rules.evaluateRules`](check.md#check.rules.evaluateRules) to classify declarations. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [evaluateOnSnapshot](../../src/rules.ts#L181) (rules: EvaluatedRules, index: Index, snapshot: SnapshotView, planned: readonly string[], format: RuleFormat) → RuleReport <!-- internal -->
      <a id="check.rules.evaluateOnSnapshot"></a><br>Checks a snapshot's module dependency edges against deny/allow/layer rules, emitting K101/K102/K107 failures and ok or unverified verdicts that account for coverage holes, using [`check.scc.stronglyConnected`](check.md#check.scc.stronglyConnected) for cycles. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [check.rules.siteAt](check.md#check.rules.siteAt), [check.rules.configNote](check.md#check.rules.configNote), [check.rules.base](check.md#check.rules.base), [check.rules.holeAt](check.md#check.rules.holeAt), [check.rules.docblockNote](check.md#check.rules.docblockNote), [check.rules.ruleHits](check.md#check.rules.ruleHits), [check.rules.decide](check.md#check.rules.decide), [check.rules.crossRules](check.md#check.rules.crossRules), [check.rules.sameAreas](check.md#check.rules.sameAreas), [check.rules.layerViolation](check.md#check.rules.layerViolation), [check.rules.incomparableAside](check.md#check.rules.incomparableAside), [check.rules.componentSpec](check.md#check.rules.componentSpec), [check.rules.layerComponent](check.md#check.rules.layerComponent), [check.rules.holeText](check.md#check.rules.holeText), [check.rules.listAt](check.md#check.rules.listAt), [check.rules.overrideEvidence](check.md#check.rules.overrideEvidence), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.pointAt](check.md#check.rules.pointAt), [check.rules.hashText](check.md#check.rules.hashText), [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [check.scc.stronglyConnected](check.md#check.scc.stronglyConnected), [check.scc.cycleThrough](check.md#check.scc.cycleThrough)
    - type [Hole](../../src/rules.ts#L612) = SnapshotView["coverage"][number] <!-- internal -->
      <a id="check.rules.Hole"></a><br>A coverage entry of the snapshot: a hole when its kind is one of `DEPENDENCY_HOLES`.
    - type [IndexedHole](../../src/rules.ts#L615) <!-- internal -->
      <a id="check.rules.IndexedHole"></a><br>A hole and its place in the coverage list, which decides between two holes of one module.
    - fn [listAt](../../src/rules.ts#L620) (map: Map<string, T[]>, key: string) → T[] <!-- internal -->
      <a id="check.rules.listAt"></a>
    - fn [holeText](../../src/rules.ts#L629) (hole: Hole) → string <!-- internal -->
      <a id="check.rules.holeText"></a><br>`unresolved import (src/a.ts:1:19)`: the hole in a verdict's reason.
      - calls [check.rules.holeAt](check.md#check.rules.holeAt)
    - fn [holeAt](../../src/rules.ts#L634) (hole: Hole) → string <!-- internal -->
      <a id="check.rules.holeAt"></a><br>`src/a.ts:1:19`: where the hole is, the `hole` field of a verdict.
    - fn [layerViolation](../../src/rules.ts#L641) (rules: EvaluatedRules, fromLayer: string, toLayer: string) → string | null <!-- internal -->
      <a id="check.rules.layerViolation"></a><br>Why a dependency between two layers breaks the layer orders, or null.
    - fn [layerComponent](../../src/rules.ts#L650) (rules: EvaluatedRules, layer: string) → Set<string> <!-- internal -->
      <a id="check.rules.layerComponent"></a><br>Layers joined to `layer` by the undirected partial order, including `layer` itself.
    - fn [componentSpec](../../src/rules.ts#L664) (rules: EvaluatedRules, layer: string) → string <!-- internal -->
      <a id="check.rules.componentSpec"></a><br>Canonical texts of the `layers` lines in `layer`'s connected order, one hash input.
      - calls [check.rules.layerComponent](check.md#check.rules.layerComponent)
    - type [RuleHit](../../src/rules.ts#L673) <!-- internal -->
      <a id="check.rules.RuleHit"></a><br>Records a single rule match against a dependency edge: whether the matched `Rule` allows or denies it, a specificity score used to rank competing hits, and the deepest target path of that rule covering the edge. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [OverrideNote](../../src/rules.ts#L681) <!-- internal -->
      <a id="check.rules.OverrideNote"></a><br>Record describing why one deny rule was overridden: the overriding rule's text and source location, whether the two rules' areas could not be compared, whether the deny was a baseline rule, and the specificity scores of winner and loser. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [ruleHits](../../src/rules.ts#L693) (rules: EvaluatedRules, from: string, to: string, within: (id: string, scope: string) => boolean) → RuleHit[] <!-- internal -->
      <a id="check.rules.ruleHits"></a><br>Every allow or deny that matches the edge, scored by the deepest target it names.
      - calls [check.rules.scopeDepth](check.md#check.rules.scopeDepth)
    - fn [byHit](../../src/rules.ts#L716) (a: RuleHit, b: RuleHit) → number <!-- internal -->
      <a id="check.rules.byHit"></a><br>Comparator that orders two rule hits by the file path of the rule that produced them, falling back to the rule's starting line number when the files match. Used to give rule hits a stable, source-ordered sort. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [dominates](../../src/rules.ts#L722) (a: RuleHit, b: RuleHit) → boolean <!-- internal -->
      <a id="check.rules.dominates"></a><br>`a` is strictly more specific than `b`: neither of its areas is wider, and one is narrower.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin)
    - fn [crossRules](../../src/rules.ts#L729) (a: RuleHit, b: RuleHit) → boolean <!-- internal -->
      <a id="check.rules.crossRules"></a><br>One rule is narrower on the source and the other on the target.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin)
    - fn [sameAreas](../../src/rules.ts#L737) (a: RuleHit, b: RuleHit) → boolean <!-- internal -->
      <a id="check.rules.sameAreas"></a><br>Compares two rule hits by their rule's source area and their target, returning true when both match. Used by [`check.rules.overManualRules`](check.md#check.rules.overManualRules) and [`check.rules.evaluateOnSnapshot`](check.md#check.rules.evaluateOnSnapshot) to group or deduplicate hits covering the same area pair. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [overManualRules](../../src/rules.ts#L742) (hits: readonly RuleHit[]) → RuleHit[] <!-- internal -->
      <a id="check.rules.overManualRules"></a><br>The baseline is a lower rule layer: a manual hit over the same areas drops a generated one.
      - calls [check.rules.sameAreas](check.md#check.rules.sameAreas)
    - fn [areaWithin](../../src/rules.ts#L746) (id: string, scope: string) → boolean <!-- internal -->
      <a id="check.rules.areaWithin"></a><br>Tests whether a dotted node ID equals a scope or sits beneath it as a dot-separated descendant, so [`check.rules.dominates`](check.md#check.rules.dominates), [`check.rules.crossRules`](check.md#check.rules.crossRules) and [`check.rules.incomparableWarnings`](check.md#check.rules.incomparableWarnings) can compare rule reach by area. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [decide](../../src/rules.ts#L755) (all: readonly RuleHit[], format: RuleFormat) → { winners: RuleHit[]; denyWins: boolean } <!-- internal -->
      <a id="check.rules.decide"></a><br>First a manual hit drops a baseline hit over the same areas (both formats). Format 1: the greatest depth sum, and every `deny` on that sum.
      - calls [check.rules.overManualRules](check.md#check.rules.overManualRules), [check.rules.dominates](check.md#check.rules.dominates)
    - fn [incomparableAside](../../src/rules.ts#L769) (deny: RuleHit, hits: readonly RuleHit[], format: RuleFormat) → string <!-- internal -->
      <a id="check.rules.incomparableAside"></a><br>Builds the explanatory suffix listing allow rules that [`check.rules.crossRules`](check.md#check.rules.crossRules) deems incomparable with the winning deny, deduplicated per rule and sorted, saying why each lost (deny-overrides mode, depth-sum tie, or lower depth sum). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - calls [check.rules.crossRules](check.md#check.rules.crossRules), [check.rules.byHit](check.md#check.rules.byHit)
    - fn [overrideEvidence](../../src/rules.ts#L786) (deny: Rule, targets: string, notes: readonly OverrideNote[]) → string <!-- internal -->
      <a id="check.rules.overrideEvidence"></a><br>Builds the explanatory sentence a rule report shows when a deny rule is overridden, sorting override notes into incomparable, more-specific, and manual-over-baseline groups and listing them with their winning scores or quoted rule texts; used by [`check.rules.evaluateOnSnapshot`](check.md#check.rules.evaluateOnSnapshot). _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [incomparableWarnings](../../src/rules.ts#L802) (rules: EvaluatedRules, format: RuleFormat) → Diagnostic[] <!-- internal -->
      <a id="check.rules.incomparableWarnings"></a><br>One K106 per incomparable allow/deny line pair, on the allow line. Static: no snapshot required.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin), [check.rules.scopeDepth](check.md#check.rules.scopeDepth), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.hashText](check.md#check.rules.hashText)
    - fn [canonicalRuleSpec](../../src/rules.ts#L846) (spec: SpecIR, file: string, line: number) → string | null
      <a id="check.rules.canonicalRuleSpec"></a><br>Canonical text of the rule line at `file:line`, or null when that line is not a rule. K101, K103, and an unreachable module's entry verdict hash several lines themselves.
      - calls [check.rules.collectRules](check.md#check.rules.collectRules)
    - fn [noSnapshotSpec](../../src/rules.ts#L863) (spec: SpecIR) → string
      <a id="check.rules.noSnapshotSpec"></a><br>Every rule line of the specs, valid or not, joined in file and line order. The hash of `no snapshot`.
    - fn [firstRuleLine](../../src/rules.ts#L873) (spec: SpecIR) → { file: string; span: Span } | null <!-- internal -->
      <a id="check.rules.firstRuleLine"></a><br>The first rule line in file, line and column order, a rejected `layers` line included; null without one.
    - fn [scopeDepth](../../src/rules.ts#L882) (id: string) → number
      <a id="check.rules.scopeDepth"></a><br>How specific a scope is: its depth in segments (`app.purchase` is 2), not its length in characters.
    - fn [specific](../../src/rules.ts#L893) (rules: EvaluatedRules, from: string, to: string, within: (id: string, scope: string) => boolean) → { kind: "allow" | "deny"; rule: Rule } | null <!-- internal -->
      <a id="check.rules.specific"></a><br>The rule that decides `from → to` in format 1: the one whose scopes are deepest in total (`deny app.purchase domain` and `allow app domain.store` both 3), a `deny` on a tie. Format 2 keeps every undominated rule and lets any undominated `deny` win (deny-overrides), so an…
      - calls [check.rules.decide](check.md#check.rules.decide), [check.rules.ruleHits](check.md#check.rules.ruleHits), [check.rules.byHit](check.md#check.rules.byHit)
    - type [EvaluatedRules](../../src/rules.ts#L899) <!-- internal -->
      <a id="check.rules.EvaluatedRules"></a><br>Holds the parsed, validated result of the rules file: layer orders merged into one "above" partial order, allow/deny rules, entry points, no-cycle and exports constraints, plus diagnostics for rules dropped as unevaluable. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [collectRules](../../src/rules.ts#L920) (spec: SpecIR, kindOf: (id: string) => string | undefined) → EvaluatedRules <!-- internal -->
      <a id="check.rules.collectRules"></a><br>Sorts spec rules into allow/deny, entry, no-cycles and exports lists, flagging K005 via [`base.diag.diagnostic`](base.md#base.diag.diagnostic) when a dependency rule names a function or member, and merges layer chains through [`check.rules.combineOrders`](check.md#check.rules.combineOrders). _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.combineOrders](check.md#check.rules.combineOrders)
    - fn [combineOrders](../../src/rules.ts#L978) (chains: readonly LayerOrder[], diagnostics: Diagnostic[]) → { orders: LayerOrder[]; above: Map<string, Set<string>> } <!-- internal -->
      <a id="check.rules.combineOrders"></a><br>All `layers` lines as one partial order: `a < b` and `b < c` put `c` above `a`, while `a < b` and `c < d` say nothing about `a` and `d`. A line that contradicts the lines before it is K005 and left out.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.transitive](check.md#check.rules.transitive)
    - fn [transitive](../../src/rules.ts#L1008) (direct: ReadonlyMap<string, ReadonlySet<string>>) → Map<string, Set<string>> <!-- internal -->
      <a id="check.rules.transitive"></a><br>Computes the transitive closure of a directed graph given as adjacency sets, using an iterative depth-first walk from every key. [`check.rules.combineOrders`](check.md#check.rules.combineOrders) uses it to derive which layers sit above which others. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [pointAt](../../src/rules.ts#L1025) (line: number, col: number) → Span <!-- internal -->
      <a id="check.rules.pointAt"></a><br>A one-column span at a code position (a rule finding has no source offset).
    - fn [base](../../src/rules.ts#L1030) (snapshot: SnapshotView, criterion: string, area: string, verdict: Verdict["verdict"], file: string, line: number, col: number, code: string | null, message: string, spec = criterion) → Verdict <!-- internal -->
      <a id="check.rules.base"></a><br>`spec` is the rule as written; its hash changes when the rule does.
      - calls [check.rules.hashText](check.md#check.rules.hashText)
    - fn [hashText](../../src/rules.ts#L1034) (text: string) → string <!-- internal -->
      <a id="check.rules.hashText"></a><br>Computes the SHA-256 digest of a string and returns it as a hex string. Used by [`check.rules.base`](check.md#check.rules.base) and the other callers to fingerprint message or code text for stable verdict identity. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
  - module [scc](../../src/scc.ts#L1)
    <a id="check.scc"></a><br>Strongly connected components of a directed module graph. A component is cyclic when it has two or more modules, or a self-loop.
    - fn [stronglyConnected](../../src/scc.ts#L4) (adj: ReadonlyMap<string, ReadonlySet<string>>) → string[][]
      <a id="check.scc.stronglyConnected"></a><br>Returns the cyclic strongly connected components of a directed graph, keeping multi-node groups plus single nodes that point to themselves. Builds on the full SCC partition from [`check.scc.components`](check.md#check.scc.components), and feeds [`check.rules.evaluateOnSnapshot`](check.md#check.rules.evaluateOnSnapshot) and… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [check.scc.components](check.md#check.scc.components)
    - fn [components](../../src/scc.ts#L9) (adj: ReadonlyMap<string, ReadonlySet<string>>) → string[][]
      <a id="check.scc.components"></a><br>Every strongly connected component, each after all components it reaches (Tarjan's order).
    - fn [cycleThrough](../../src/scc.ts#L63) (adj: ReadonlyMap<string, ReadonlySet<string>>, members: ReadonlySet<string>, start: string) → string[]
      <a id="check.scc.cycleThrough"></a><br>One cycle inside `members` that passes through `start`.
  - module [test-report](../../src/test-report.ts#L1)
    <a id="check.test-report"></a><br>Test-runner reports as evidence for `test <file> "<name>"` in a flow. A report proves the current code only when it names the snapshot it ran against; a third-party report without that link stays unverified.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - type [TestStatus](../../src/test-report.ts#L9) = "pass" | "fail" | "skip"
      <a id="check.test-report.TestStatus"></a><br>Three-way string union that classifies the outcome of a single test case as passed, failed, or skipped, used to tag entries in the report built by the check layer. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TestCase](../../src/test-report.ts#L11)
      <a id="check.test-report.TestCase"></a><br>Describes one test result parsed from a report: file, `>`-joined suite path, name, status, optional snapshot and run IDs, and source report, plus a flag for JUnit cases whose file is only a classname. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - type [JsonReport](../../src/test-report.ts#L26)
      <a id="check.test-report.JsonReport"></a><br>keylang JSON report, schema 1 (written by the `node:test` reporter).
    - fn [loadReports](../../src/test-report.ts#L36) (root: string, files: readonly string[]) → TestCase[]
      <a id="check.test-report.loadReports"></a><br>Read report files (JSON or JUnit XML). Malformed input is an error naming the file.
      - calls [check.test-report.parseJunit](check.md#check.test-report.parseJunit), [check.test-report.parseJsonReport](check.md#check.test-report.parseJsonReport)
    - fn [parseJsonReport](../../src/test-report.ts#L44) (file: string, text: string) → TestCase[]
      <a id="check.test-report.parseJsonReport"></a><br>Parses and validates a JSON test report against the expected schema version, turning each `tests` entry into a test case with its status, suite and snapshot. Malformed input throws an error naming the file and field. _(llm · claude:claude-opus-5-5 · 2026-10-05 · stale)_
      - calls [check.test-report.optionalString](check.md#check.test-report.optionalString)
    - fn [optionalString](../../src/test-report.ts#L73) (value: unknown, field: string) → string | null <!-- internal -->
      <a id="check.test-report.optionalString"></a><br>A field that may be missing or null (no value) or a string; any other type is an error naming it.
    - fn [repositoryPath](../../src/test-report.ts#L84) (path: string, root: string) → string <!-- internal -->
      <a id="check.test-report.repositoryPath"></a><br>`path` of a JUnit `file` attribute as a flow's `test` writes it: relative to the repository root, with `/`. An absolute path under the root (PHPUnit, jest-junit) loses the root; any other path stays as it is.
      - calls [check.test-report.realRoot](check.md#check.test-report.realRoot), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [realRoot](../../src/test-report.ts#L93) (root: string) → string <!-- internal -->
      <a id="check.test-report.realRoot"></a>
    - fn [parseJunit](../../src/test-report.ts#L108) (file: string, text: string, repository: string) → TestCase[]
      <a id="check.test-report.parseJunit"></a><br>JUnit XML: `<testcase classname file name>` with `<failure>`, `<error>` or `<skipped>`, in `<testsuite>`s that may nest under `<testsuites>`. The snapshot comes from `<property name="keylang.snapshotId">` of the testcase or of the nearest suite around it: each suite of a merged…
      - calls [check.test-report.parseXml](check.md#check.test-report.parseXml), [check.test-report.repositoryPath](check.md#check.test-report.repositoryPath)
    - type [XmlElement](../../src/test-report.ts#L137) <!-- internal -->
      <a id="check.test-report.XmlElement"></a><br>In-memory shape of a parsed XML node used by the test-report reader: tag name, attribute map, nested children, the element's direct character data, and the source line where it appeared. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [parseXml](../../src/test-report.ts#L151) (file: string, text: string) → XmlElement <!-- internal -->
      <a id="check.test-report.parseXml"></a><br>The element tree of an XML document: tags, attributes in either quote, the predefined and numeric entities, comments, CDATA, processing instructions and a DOCTYPE. Enough to read a report; not a validating parser.
      - calls [check.test-report.decodeEntities](check.md#check.test-report.decodeEntities)
    - fn [decodeEntities](../../src/test-report.ts#L234) (text: string) → string <!-- internal -->
      <a id="check.test-report.decodeEntities"></a><br>Replaces XML character references in a string: the five named entities via a lookup table, and decimal or hex numeric references via code point, leaving unknown or out-of-range ones untouched. Used by [`check.test-report.parseXml`](check.md#check.test-report.parseXml) to decode text content. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [TestEvidence](../../src/test-report.ts#L242)
      <a id="check.test-report.TestEvidence"></a><br>Describes the outcome recorded for a test in a report: a three-way verdict (`ok`, `fail`, or `unverified`), a human-readable message, and the identifier of the run that produced it, or null if none applies. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [matchTest](../../src/test-report.ts#L253) (cases: readonly TestCase[], file: string, name: string, snapshotId: string | null) → TestEvidence
      <a id="check.test-report.matchTest"></a><br>Match `test <file> "<name>"`. The name may carry suites as `Suite > name`.
  - module [trace-evidence](../../src/trace-evidence.ts#L1)
    <a id="check.trace-evidence"></a><br>Trace evidence: JSONL spans from instrumented `@flow` tests (schema 1). Steps match as a nested subsequence inside one test: extra calls are fine, one span satisfies one step, order comes from start/end on one clock or from `links`, never from sorting timestamps.
    - node [external.node](external.md#external.node)
    - type [Mark](../../src/trace-evidence.ts#L13) <!-- internal -->
      <a id="check.trace-evidence.Mark"></a><br>Describes a single timestamped marker tying a logical clock identifier to a monotonically increasing sequence number and a wall-clock time. It is the record shape that trace evidence collection in [`check.trace-evidence`](check.md#check.trace-evidence) emits and orders events by. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TraceSpan](../../src/trace-evidence.ts#L19)
      <a id="check.trace-evidence.TraceSpan"></a><br>Shape of one recorded execution span in a trace: its own id, optional parent id, the symbol it covers, linked span ids, a start `Mark`, and an end `Mark` carrying an `outcome` string, or null while the span is still open. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [TraceRun](../../src/trace-evidence.ts#L28)
      <a id="check.trace-evidence.TraceRun"></a><br>Describes one test run reconstructed from trace files: its identifiers, snapshot, spans, and whether the run finished. Also records dropped events, spans left open, and the set of instrumented symbols when known. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
    - type [RunDraft](../../src/trace-evidence.ts#L58) <!-- internal -->
      <a id="check.trace-evidence.RunDraft"></a><br>A run as it is read. Spans are keyed by id, so a start and the end that closes it are found without a scan; an end whose start is in a file not read yet waits for the last file. `run` events accumulate until every file is read.
    - fn [loadTraces](../../src/trace-evidence.ts#L85) (root: string, files: readonly string[]) → TraceRun[]
      <a id="check.trace-evidence.loadTraces"></a><br>Read and validate trace files. A malformed line is an error naming file and line.
      - calls [check.trace-evidence.eachLine](check.md#check.trace-evidence.eachLine), [check.trace-evidence.readEvent](check.md#check.trace-evidence.readEvent), [check.trace-evidence.finishRun](check.md#check.trace-evidence.finishRun)
    - fn [eachLine](../../src/trace-evidence.ts#L98) (path: string, visit: (text: string, line: number) => void) → void <!-- internal -->
      <a id="check.trace-evidence.eachLine"></a><br>Each line of a file (1-based), read in chunks: a trace of millions of events may not fit in one string.
    - fn [readEvent](../../src/trace-evidence.ts#L116) (runs: Map<string, RunDraft>, file: string, line: number, text: string) → void <!-- internal -->
      <a id="check.trace-evidence.readEvent"></a>
    - fn [finishRun](../../src/trace-evidence.ts#L203) (draft: RunDraft) → TraceRun <!-- internal -->
      <a id="check.trace-evidence.finishRun"></a><br>The run once every file is read: each end closes its start, wherever the two were.
    - type [ShapeNode](../../src/trace-evidence.ts#L238)
      <a id="check.trace-evidence.ShapeNode"></a><br>A flow as trace matching sees it. `key` identifies the spec node across runs. A `parallel` group's steps are matched under the group's parent in any order, each after the sibling before the group; the sibling after the group starts after every step of it.
    - type [TraceEvidence](../../src/trace-evidence.ts#L243)
      <a id="check.trace-evidence.TraceEvidence"></a><br>Describes the outcome of verifying a trace: a three-state verdict (`ok`, `fail`, or `unverified`) with a human-readable message, plus optional run and test identifiers that are null when no linked run or test was found. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Outcome](../../src/trace-evidence.ts#L250) = TraceEvidence <!-- internal -->
      <a id="check.trace-evidence.Outcome"></a><br>A local type alias that names the result of a trace-evidence check as the same shape as `TraceEvidence`, so the check's output type reads as an outcome without adding any new fields or behavior. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [traceFlow](../../src/trace-evidence.ts#L258) (runs: readonly TraceRun[], flow: string, trigger: { key: number; id: string } | null, shape: readonly ShapeNode[], snapshotId: string | null) → Map<number, TraceEvidence>
      <a id="check.trace-evidence.traceFlow"></a><br>Trace verdicts for every step and `when` of one flow, keyed by `ShapeNode.key`. The trigger (if any) must be observed; its steps are matched inside it.
      - calls [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.match](check.md#check.trace-evidence.Matcher.match), [check.trace-evidence.Matcher](check.md#check.trace-evidence.Matcher)
    - fn [keysOf](../../src/trace-evidence.ts#L301) (nodes: readonly ShapeNode[]) → number[] <!-- internal -->
      <a id="check.trace-evidence.keysOf"></a><br>Flattens a tree of shape nodes into a pre-order list of their numeric keys, recursing into each node's `children`. Used by [`check.trace-evidence.traceFlow`](check.md#check.trace-evidence.traceFlow) and the `Matcher` methods to enumerate every key a shape covers. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - module [OverBudget](../../src/trace-evidence.ts#L308) <!-- internal -->
      <a id="check.trace-evidence.OverBudget"></a><br>An empty `Error` subclass with no extra fields or behavior, used as a distinct throwable type that callers can catch to recognize this specific failure when a limit is exceeded during trace-evidence checking. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Assignment](../../src/trace-evidence.ts#L311) <!-- internal -->
      <a id="check.trace-evidence.Assignment"></a><br>Spans assigned to flow nodes: an outcome per node and the spans it took.
    - fn [assignment](../../src/trace-evidence.ts#L320) (outcomes: [number, Outcome][], spans: string[] = []) → Assignment <!-- internal -->
      <a id="check.trace-evidence.assignment"></a><br>Builds the result record the matcher returns from [`check.trace-evidence.Matcher.branch`](check.md#check.trace-evidence.Matcher.branch), [`check.trace-evidence.Matcher.solve`](check.md#check.trace-evidence.Matcher.solve) and [`check.trace-evidence.Matcher.take`](check.md#check.trace-evidence.Matcher.take), bundling the index–outcome pairs and span IDs. It also precomputes counts of outcomes whose verdict is "ok"… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [combine](../../src/trace-evidence.ts#L324) (...parts: Assignment[]) → Assignment <!-- internal -->
      <a id="check.trace-evidence.combine"></a><br>Merges several `Assignment` values into one by concatenating their outcomes and spans and summing their `ok` and `fail` counts. Used by [`check.trace-evidence.Matcher.branch`](check.md#check.trace-evidence.Matcher.branch), [`check.trace-evidence.Matcher.solve`](check.md#check.trace-evidence.Matcher.solve), and [`check.trace-evidence.Matcher.take`](check.md#check.trace-evidence.Matcher.take) to fold sub-results… _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [better](../../src/trace-evidence.ts#L329) (a: Assignment, b: Assignment) → boolean <!-- internal -->
      <a id="check.trace-evidence.better"></a><br>More steps observed wins, then fewer failures; an earlier candidate keeps a tie.
    - module [Matcher](../../src/trace-evidence.ts#L339) <!-- internal -->
      <a id="check.trace-evidence.Matcher"></a><br>Matches one run against a flow. A test may call the trigger or a step more than once (an early `return` first, the real call later), so every span of a symbol is a candidate: the search keeps the assignment with the most observed steps, and a step fails only when no assignment…
      - fn [constructor](../../src/trace-evidence.ts#L353) (run: TraceRun)
        <a id="check.trace-evidence.Matcher.constructor"></a><br>Stores the given trace run and indexes every span by its own ID and under its parent's ID, so later lookups can find a span directly or list the children of any span. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [match](../../src/trace-evidence.ts#L364) (nodes: readonly ShapeNode[], trigger: boolean) → [number, Outcome][]
        <a id="check.trace-evidence.Matcher.match"></a><br>Outcomes for `nodes` (the trigger with the steps inside it when `trigger`).
        - calls [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.Matcher.incompleteness](check.md#check.trace-evidence.Matcher.incompleteness)
      - fn [base](../../src/trace-evidence.ts#L378) () → { runId: string; testId: string } <!-- internal -->
        <a id="check.trace-evidence.Matcher.base"></a><br>Builds the shared `{ runId, testId }` fields that identify the current run, which [`check.trace-evidence.Matcher.branch`](check.md#check.trace-evidence.Matcher.branch), [`check.trace-evidence.Matcher.match`](check.md#check.trace-evidence.Matcher.match), [`check.trace-evidence.Matcher.orderOutcome`](check.md#check.trace-evidence.Matcher.orderOutcome), and [`check.trace-evidence.Matcher.solve`](check.md#check.trace-evidence.Matcher.solve) stamp onto the outcomes they… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [descendants](../../src/trace-evidence.ts#L383) (parent: TraceSpan | null) → TraceSpan[] <!-- internal -->
        <a id="check.trace-evidence.Matcher.descendants"></a><br>Spans under `parent` (all spans for null), depth-first in start order.
      - fn [candidates](../../src/trace-evidence.ts#L402) (parent: TraceSpan | null, id: string) → TraceSpan[] <!-- internal -->
        <a id="check.trace-evidence.Matcher.candidates"></a><br>Collects the spans under `parent` via [`check.trace-evidence.Matcher.descendants`](check.md#check.trace-evidence.Matcher.descendants), keeping only those whose symbol matches `id` and that are not yet marked used. Feeds candidate spans to [`check.trace-evidence.Matcher.branch`](check.md#check.trace-evidence.Matcher.branch) and [`check.trace-evidence.Matcher.solve`](check.md#check.trace-evidence.Matcher.solve). _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants)
      - fn [incompleteness](../../src/trace-evidence.ts#L407) () → string | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.incompleteness"></a><br>Why the run cannot confirm or refute what it shows, or null for a finished run.
      - fn [absenceDoubt](../../src/trace-evidence.ts#L417) (id: string) → string | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.absenceDoubt"></a><br>Why an unobserved step is not a proven absence, or null when it is.
        - calls [check.trace-evidence.Matcher.incompleteness](check.md#check.trace-evidence.Matcher.incompleteness)
      - fn [bound](../../src/trace-evidence.ts#L429) (parent: TraceSpan | null, node: ShapeNode) → number <!-- internal -->
        <a id="check.trace-evidence.Matcher.bound"></a><br>The most steps of `node` and below that any assignment under `parent` could observe.
        - calls [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants)
      - fn [symbolsFrom](../../src/trace-evidence.ts#L445) (nodes: readonly ShapeNode[], i: number) → Set<string> <!-- internal -->
        <a id="check.trace-evidence.Matcher.symbolsFrom"></a><br>Symbols of `nodes[i..]` and everything under them.
      - fn [list](../../src/trace-evidence.ts#L469) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, previous: readonly TraceSpan[], trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.list"></a><br>The best assignment for `nodes[i..]` under `parent`, the sibling before them matched to `previous` (every step of it for a `parallel` group). Memoized: the answer depends on the spans taken so far only through those it could take itself, so the search stays polynomial in the…
        - calls [check.trace-evidence.Matcher.symbolsFrom](check.md#check.trace-evidence.Matcher.symbolsFrom), [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants), [check.trace-evidence.Matcher.solve](check.md#check.trace-evidence.Matcher.solve)
      - fn [solve](../../src/trace-evidence.ts#L493) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, previous: readonly TraceSpan[], trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.solve"></a><br>Matches one shape step against trace spans under a parent, delegating `when` nodes to [`check.trace-evidence.Matcher.branch`](check.md#check.trace-evidence.Matcher.branch), trying each in-order candidate via [`check.trace-evidence.Matcher.take`](check.md#check.trace-evidence.Matcher.take) and keeping the best by [`check.trace-evidence.better`](check.md#check.trace-evidence.better). When no span fits it emits… _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
        - calls [check.trace-evidence.Matcher.branch](check.md#check.trace-evidence.Matcher.branch), [check.trace-evidence.Matcher.group](check.md#check.trace-evidence.Matcher.group), [check.trace-evidence.Matcher.candidates](check.md#check.trace-evidence.Matcher.candidates), [check.trace-evidence.startsBefore](check.md#check.trace-evidence.startsBefore), [check.trace-evidence.Matcher.bound](check.md#check.trace-evidence.Matcher.bound), [check.trace-evidence.Matcher.take](check.md#check.trace-evidence.Matcher.take), [check.trace-evidence.Matcher.orderOutcome](check.md#check.trace-evidence.Matcher.orderOutcome), [check.trace-evidence.better](check.md#check.trace-evidence.better), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.Matcher.absenceDoubt](check.md#check.trace-evidence.Matcher.absenceDoubt), [check.trace-evidence.Matcher.outsideRoot](check.md#check.trace-evidence.Matcher.outsideRoot), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list)
      - fn [take](../../src/trace-evidence.ts#L526) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, span: TraceSpan, outcome: Outcome, trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.take"></a><br>`span` as `node`: its children are matched inside it, the siblings after it.
        - calls [check.trace-evidence.OverBudget](check.md#check.trace-evidence.OverBudget), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment)
      - fn [branch](../../src/trace-evidence.ts#L538) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, previous: readonly TraceSpan[], trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.branch"></a><br>A `when` is exercised in this test when its first step is observed; its steps are not ordered after the siblings before it.
        - calls [check.trace-evidence.Matcher.candidates](check.md#check.trace-evidence.Matcher.candidates), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list)
      - fn [group](../../src/trace-evidence.ts#L557) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, previous: readonly TraceSpan[], trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.group"></a><br>A `parallel` group: each step is matched under the group's parent after the sibling before the group, in any order with the others, overlap allowed. The sibling after the group is ordered after every step it observed.
        - calls [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list), [check.trace-evidence.Matcher.alone](check.md#check.trace-evidence.Matcher.alone), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment)
      - fn [alone](../../src/trace-evidence.ts#L579) (node: ShapeNode) → readonly ShapeNode[] <!-- internal -->
        <a id="check.trace-evidence.Matcher.alone"></a><br>`[node]`, the same array every time: `list` memoizes by the array.
      - fn [rootSpan](../../src/trace-evidence.ts#L589) (span: TraceSpan) → TraceSpan <!-- internal -->
        <a id="check.trace-evidence.Matcher.rootSpan"></a><br>Root of the `parentSpanId` chain. A span whose parent is missing is its own root.
      - fn [outsideRoot](../../src/trace-evidence.ts#L606) (parent: TraceSpan, id: string) → TraceSpan | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.outsideRoot"></a><br>A span of `id` whose call tree is not the parent's, and which did not start before the parent image on the same clock. Spans that did start earlier, and spans in the parent's own tree, stay a confirmed absence.
        - calls [check.trace-evidence.Matcher.rootSpan](check.md#check.trace-evidence.Matcher.rootSpan), [check.trace-evidence.startsBefore](check.md#check.trace-evidence.startsBefore)
      - fn [nestedIn](../../src/trace-evidence.ts#L618) (span: TraceSpan, ancestor: TraceSpan) → boolean <!-- internal -->
        <a id="check.trace-evidence.Matcher.nestedIn"></a><br>`span`'s parent chain passes through `ancestor` (the image of the previous sibling).
      - fn [orderOutcome](../../src/trace-evidence.ts#L630) (parent: TraceSpan | null, span: TraceSpan, previous: readonly TraceSpan[]) → Outcome <!-- internal -->
        <a id="check.trace-evidence.Matcher.orderOutcome"></a><br>The order of `span` after every span of `previous`: the first that is not `ok`, else `ok`.
        - calls [check.trace-evidence.Matcher.orderAfter](check.md#check.trace-evidence.Matcher.orderAfter)
      - fn [orderAfter](../../src/trace-evidence.ts#L636) (parent: TraceSpan | null, span: TraceSpan, after: TraceSpan | null) → Outcome <!-- internal -->
        <a id="check.trace-evidence.Matcher.orderAfter"></a>
        - calls [check.trace-evidence.Matcher.nestedIn](check.md#check.trace-evidence.Matcher.nestedIn), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.sameClock](check.md#check.trace-evidence.sameClock)
    - fn [sameClock](../../src/trace-evidence.ts#L656) (a: Mark, b: Mark) → boolean <!-- internal -->
      <a id="check.trace-evidence.sameClock"></a><br>Reports whether two marks carry the same `clockId`, so callers like [`check.trace-evidence.startsBefore`](check.md#check.trace-evidence.startsBefore) and [`check.trace-evidence.Matcher.orderOutcome`](check.md#check.trace-evidence.Matcher.orderOutcome) only compare timestamps that share a clock. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [startsBefore](../../src/trace-evidence.ts#L660) (span: TraceSpan, other: TraceSpan) → boolean <!-- internal -->
      <a id="check.trace-evidence.startsBefore"></a><br>Returns true when both spans' start marks share a clock per [`check.trace-evidence.sameClock`](check.md#check.trace-evidence.sameClock) and the first span's start sequence number is strictly lower. Used by [`check.trace-evidence.Matcher.solve`](check.md#check.trace-evidence.Matcher.solve) and [`check.trace-evidence.Matcher.outsideRoot`](check.md#check.trace-evidence.Matcher.outsideRoot) to order spans. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
      - calls [check.trace-evidence.sameClock](check.md#check.trace-evidence.sameClock)
  - module [verdict](../../src/verdict.ts#L1)
    <a id="check.verdict"></a><br>One rule outcome. `fail` is a known violation, `unverified` is missing evidence, `ok` is a covered pass.
    - type [VerdictKind](../../src/verdict.ts#L3) = "ok" | "fail" | "unverified"
      <a id="check.verdict.VerdictKind"></a><br>A string-literal union naming the three possible outcomes of a check: passed, failed, or not verified. It carries no logic and is used to tag verdict records produced in the check layer. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - type [Verdict](../../src/verdict.ts#L5)
      <a id="check.verdict.Verdict"></a><br>The result record for one checked criterion: its kind, the rule text and area it covers, source location, optional diagnostic code and message, plus optional evidence provenance and the coverage hole behind an unverified outcome. _(llm · claude:claude-opus-5-5 · 2026-10-05)_
    - fn [formatVerdict](../../src/verdict.ts#L25) (v: Verdict) → string
      <a id="check.verdict.formatVerdict"></a><br>Renders a single `Verdict` as one compiler-style diagnostic line: file, line, and column joined by colons, then the code (falling back to the verdict kind) and the message. Used by [`features.spec-to-code.specToCodeText`](features.md#features.spec-to-code.specToCodeText) to print results as text. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
      <a id="check.wiring.WireOrder"></a><br>Result of resolving wiring order: either a successful topological `order` of node names, or a `cycle` listing the names that form a dependency loop. Consumers discriminate on which key is present. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
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
