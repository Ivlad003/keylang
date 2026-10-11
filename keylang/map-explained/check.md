<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [assess](#check.assess) · [flows](#check.flows) · [migration](#check.migration) · [resolve](#check.resolve) · [rules](#check.rules) · [scc](#check.scc) · [system-catalog](#check.system-catalog) · [system](#check.system) · [test-report](#check.test-report) · [trace-evidence](#check.trace-evidence) · [verdict](#check.verdict) · [wiring](#check.wiring)

# map

- check
  <a id="check"></a><br>Turns specs and analysis snapshots into diagnostics and ok/fail/unverified verdicts for IDs, rules, flows and wiring. It may not depend on `extract` or [`external.web-tree-sitter`](external.md#external.web-tree-sitter). _(llm · claude:claude-opus-5-5 · 2026-10-06 · stale)_
  - module [assess](../../src/assess.ts#L1)
    <a id="check.assess"></a><br>One assessment for `keylang check` and `keylang lsp`: the same diagnostics and verdicts. Pipeline: parsed spec Documents (Markdown → IR) + the analysis snapshot (code → graph) + test/trace evidence → resolve, rules, flows, wiring, migration and system checks → one sorted list…
    - node [external.node](external.md#external.node)
    - diag [base.diag](base.md#base.diag)
    - config [base.config](base.md#base.config)
    - flows [check.flows](check.md#check.flows)
    - ir [lang.ir](lang.md#lang.ir)
    - migration [check.migration](check.md#check.migration)
    - resolve [check.resolve](check.md#check.resolve)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - system [check.system](check.md#check.system)
    - test-report [check.test-report](check.md#check.test-report)
    - trace-evidence [check.trace-evidence](check.md#check.trace-evidence)
    - verdict [check.verdict](check.md#check.verdict)
    - wiring [check.wiring](check.md#check.wiring)
    - type [SnapshotInput](../../src/assess.ts#L24)
      <a id="check.assess.SnapshotInput"></a><br>The slice of the analysis snapshot that checks read; `check` does not import `map`.
    - type [Assessment](../../src/assess.ts#L35)
      <a id="check.assess.Assessment"></a><br>The outcome of one assessment: the resolved index, every diagnostic (sorted) and every verdict.
    - type [AssessEvidence](../../src/assess.ts#L46)
      <a id="check.assess.AssessEvidence"></a><br>Evidence and options of one assessment beside the specs and the snapshot.
    - fn [assess](../../src/assess.ts#L68) ( docs: readonly Document[], snapshot: SnapshotInput | null, evidence: AssessEvidence = { tests: null, traces: null }, format: RuleFormat = 1, ) → Assessment
      <a id="check.assess.assess"></a><br>Assess spec documents against a snapshot (null: no code analysed yet) and the evidence. `format` is the rules format of `keylang.json`.
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.resolve.check](check.md#check.resolve.check), [check.rules.evaluateRules](check.md#check.rules.evaluateRules), [check.flows.evaluateFlows](check.md#check.flows.evaluateFlows), [check.assess.flowInput](check.md#check.assess.flowInput), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.wiring.checkWiring](check.md#check.wiring.checkWiring), [check.assess.nodeKinds](check.md#check.assess.nodeKinds), [check.migration.migrationCheck](check.md#check.migration.migrationCheck), [check.system.systemCheck](check.md#check.system.systemCheck), [base.diag.compareDiagnostics](base.md#base.diag.compareDiagnostics), [check.rules.canonicalRuleSpec](check.md#check.rules.canonicalRuleSpec), [check.assess.afterRecovery](check.md#check.assess.afterRecovery), [check.assess.recoveredLines](check.md#check.assess.recoveredLines)
    - fn [recoveredLines](../../src/assess.ts#L151) (docs: readonly Document[]) → Map<string, string> <!-- internal -->
      <a id="check.assess.recoveredLines"></a><br>Item lines whose place in the tree the parser recovered after a K003 (an odd indent, a jump, a tab): the line itself and its subtree, keyed `file:line`, with the position of the nearest such K003.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [afterRecovery](../../src/assess.ts#L182) (verdicts: Verdict[], recovered: ReadonlyMap<string, string>) → Verdict[] <!-- internal -->
      <a id="check.assess.afterRecovery"></a><br>An `ok` on a recovered line is about a tree the file does not have: `unverified`. `fail` stays.
    - fn [sameFinding](../../src/assess.ts#L202) (verdict: Verdict, diagnostics: readonly Diagnostic[]) → boolean
      <a id="check.assess.sameFinding"></a><br>Whether a diagnostic on the verdict's line reports the same finding: same or contained message, or a failed ID verdict and the K001 about the same target.
    - fn [flowInput](../../src/assess.ts#L213) (snapshot: SnapshotInput, evidence: AssessEvidence) → FlowInput <!-- internal -->
      <a id="check.assess.flowInput"></a><br>What flows read of the snapshot and the evidence.
    - fn [nodeKinds](../../src/assess.ts#L235) (nodes: SnapshotInput["nodes"]) → Map<string, string> <!-- internal -->
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
    - type [Via](../../src/flows.ts#L25) <!-- internal -->
      <a id="check.flows.Via"></a><br>How a call edge came about when it is not a plain call of the code (`Via` of the graph): a hook, an argument, a framework's config.
    - type [SnapshotEdge](../../src/flows.ts#L28) <!-- internal -->
      <a id="check.flows.SnapshotEdge"></a><br>A snapshot edge as flows read it: kind, endpoints, resolution and the provenance fields verdicts name.
    - type [SnapshotNodeView](../../src/flows.ts#L57) <!-- internal -->
      <a id="check.flows.SnapshotNodeView"></a><br>A snapshot node as flows read it.
    - type [FlowInput](../../src/flows.ts#L71)
      <a id="check.flows.FlowInput"></a><br>The code side of a flow check: the snapshot's nodes, edges and coverage, plus test and trace evidence.
    - type [EntryView](../../src/flows.ts#L101)
      <a id="check.flows.EntryView"></a><br>An entry point as flows read it.
    - type [Planned](../../src/flows.ts#L109) <!-- internal -->
      <a id="check.flows.Planned"></a><br>A `planned` declaration of the specs and whether the code already has it.
    - type [Channel](../../src/flows.ts#L119) = "ID" | "static" | "tests" | "trace" <!-- internal -->
      <a id="check.flows.Channel"></a><br>The independent evidence channels a flow line gets verdicts in.
    - type [FlowNode](../../src/flows.ts#L122) = Trigger | FlowItem <!-- internal -->
      <a id="check.flows.FlowNode"></a><br>Any line of a flow tree that `visit` walks.
    - type [FlowEvaluation](../../src/flows.ts#L125)
      <a id="check.flows.FlowEvaluation"></a><br>The flows' diagnostics and a verdict per checked channel.
    - type [ChannelVerdict](../../src/flows.ts#L131) <!-- internal -->
      <a id="check.flows.ChannelVerdict"></a><br>One channel's outcome for a flow line, before it becomes a `Verdict`.
    - type [EntryVerdict](../../src/flows.ts#L137) extends ChannelVerdict <!-- internal -->
      <a id="check.flows.EntryVerdict"></a><br>An entry-point outcome; `mismatch` when the ID is an entry point of another kind only.
    - type [ScheduleForm](../../src/flows.ts#L142) <!-- internal -->
      <a id="check.flows.ScheduleForm"></a><br>A schedule in a comparable form.
    - type [DoubtfulBodies](../../src/flows.ts#L148) <!-- internal -->
      <a id="check.flows.DoubtfulBodies"></a><br>Fns whose body a proof cannot pass through, by fn ID, with the reason: replaced by a decorator, or unreadable.
    - type [RouteSearch](../../src/flows.ts#L154) <!-- internal -->
      <a id="check.flows.RouteSearch"></a><br>A breadth-first search: the route to the target (null when none) and the depth of every fn reached.
    - type [PossibleRoute](../../src/flows.ts#L160) <!-- internal -->
      <a id="check.flows.PossibleRoute"></a><br>The first ambiguous or closure call on the shortest possible route (null when none), and every fn reached.
    - fn [evaluateFlows](../../src/flows.ts#L170) (compiled: SpecIR, index: Index, input: FlowInput) → FlowEvaluation
      <a id="check.flows.evaluateFlows"></a><br>Check every flow of the specs against the snapshot: ID, static reachability, tests and traces, each as its own verdict, plus the flow diagnostics (K201–K205).
      - calls [check.flows.collectPlanned](check.md#check.flows.collectPlanned), [check.flows.callGraph](check.md#check.flows.callGraph), [check.flows.specHash](check.md#check.flows.specHash), [check.trace-evidence.traceFlow](check.md#check.trace-evidence.traceFlow), [check.flows.idVerdict](check.md#check.flows.idVerdict), [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [check.flows.subscribersVerdict](check.md#check.flows.subscribersVerdict), [check.flows.entryVerdict](check.md#check.flows.entryVerdict), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.flows.subscriberReach](check.md#check.flows.subscriberReach), [check.flows.reachability](check.md#check.flows.reachability), [check.flows.traceProvenance](check.md#check.flows.traceProvenance), [check.flows.directCall](check.md#check.flows.directCall), [check.flows.claimArea](check.md#check.flows.claimArea), [check.flows.scheduleVerdict](check.md#check.flows.scheduleVerdict), [check.flows.emitsVerdict](check.md#check.flows.emitsVerdict), [check.flows.quantitative](check.md#check.flows.quantitative), [check.test-report.matchTest](check.md#check.test-report.matchTest)
    - fn [claimArea](../../src/flows.ts#L435) (node: ClaimItem | ThenItem | WhenItem | TimerItem) → string <!-- internal -->
      <a id="check.flows.claimArea"></a><br>How a verdict names a claim or timer line (`when x`, `then y`, `every 1h`, `invariant …`).
    - fn [entryVerdict](../../src/flows.ts#L451) (kind: string, id: string, entries: readonly EntryView[] | undefined) → EntryVerdict <!-- internal -->
      <a id="check.flows.entryVerdict"></a><br>`trigger <kind> <id>` against the entry points of the snapshot: `ok` with the entry's label when the fn is an entry of that kind; `mismatch` (K205) when it is an entry of other kinds only; `unverified` when no entry names it, since an adapter keylang lacks may know it.
    - fn [scheduleForm](../../src/flows.ts#L479) (text: string) → ScheduleForm <!-- internal -->
      <a id="check.flows.scheduleForm"></a><br>A schedule in a comparable form: cron fields (a macro expanded) or a duration.
    - fn [labelSchedule](../../src/flows.ts#L493) (label: string) → string | null <!-- internal -->
      <a id="check.flows.labelSchedule"></a><br>The schedule a cron entry's label carries: the whole label when it is one, else its last six or five words (`clean_quotes 0 0 * * *`); null when the adapter did not write it.
      - calls [lang.parser.scheduleText](lang.md#lang.parser.scheduleText)
    - fn [scheduleVerdict](../../src/flows.ts#L506) (parent: string | null, written: string, entries: readonly EntryView[] | undefined) → ChannelVerdict <!-- internal -->
      <a id="check.flows.scheduleVerdict"></a><br>Static evidence of `every <schedule>`: the cron entry point of the parent (the trigger for a top-level line) runs on the written schedule. `ok` when one does, `fail` when every cron entry of the fn says another schedule of the same form, else `unverified` (no cron entry, no…
      - calls [check.flows.scheduleForm](check.md#check.flows.scheduleForm), [check.flows.labelSchedule](check.md#check.flows.labelSchedule)
    - fn [traceProvenance](../../src/flows.ts#L537) (evidence: TraceEvidence) → Verdict["evidence"] <!-- internal -->
      <a id="check.flows.traceProvenance"></a><br>The evidence block of a trace verdict: provenance plus run and test IDs when known.
    - fn [quantitative](../../src/flows.ts#L548) (text: string) → boolean <!-- internal -->
      <a id="check.flows.quantitative"></a><br>A count, a bound, or a negation: a subsequence of calls cannot prove it.
    - fn [idVerdict](../../src/flows.ts#L557) ( id: string, plan: Planned | undefined, span: Span, file: string, index: Index, input: FlowInput, verdict: (channel: Channel, area: string, value: Verdict["verdict"], file: string, span: Span, message: string) => void, missing = "K001 dangling reference", ) → Verdict["verdict"] <!-- internal -->
      <a id="check.flows.idVerdict"></a><br>The ID channel of one reference: planned (unverified), known to the snapshot or the specs (ok), inside an opaque module (unverified), else `missing` (fail). Reports the verdict and returns it.
      - calls [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [check.flows.moduleMembers](check.md#check.flows.moduleMembers)
    - fn [subscribersOf](../../src/flows.ts#L583) (graph: CallGraph, event: string) → Step[] <!-- internal -->
      <a id="check.flows.subscribersOf"></a><br>The subscribers of an event: its `observer` edges, whichever static mode, in the snapshot's order.
    - fn [describeSubscriber](../../src/flows.ts#L588) (step: Step) → string <!-- internal -->
      <a id="check.flows.describeSubscriber"></a><br>A subscriber as a verdict names it: the fn and the line that subscribes it, with the area when it is not global.
      - calls [check.flows.at](check.md#check.flows.at)
    - fn [subscribersVerdict](../../src/flows.ts#L599) (graph: CallGraph, event: string, input: FlowInput) → ChannelVerdict <!-- internal -->
      <a id="check.flows.subscribersVerdict"></a><br>Static evidence of `trigger event <id>`: the event's subscribers, listed with the config lines that subscribe them. None is `unverified`: a subscriber keylang did not read (another module, a config it skips) may still exist.
      - calls [check.flows.subscribersOf](check.md#check.flows.subscribersOf), [check.flows.describeSubscriber](check.md#check.flows.describeSubscriber)
    - fn [subscriberReach](../../src/flows.ts#L614) (graph: CallGraph, input: FlowInput, event: string, target: string) → ChannelVerdict <!-- internal -->
      <a id="check.flows.subscriberReach"></a><br>A step right under `trigger event <id>`: reached from at least one of the event's subscribers (or a subscriber itself). `ok` names the subscriber; otherwise `unverified` when some subscriber may reach it, `fail` when every one is a confirmed absence.
      - calls [check.flows.subscribersOf](check.md#check.flows.subscribersOf), [check.flows.describeConfig](check.md#check.flows.describeConfig), [check.flows.reachability](check.md#check.flows.reachability), [check.flows.describeSubscriber](check.md#check.flows.describeSubscriber)
    - fn [emitsVerdict](../../src/flows.ts#L640) (graph: CallGraph, input: FlowInput, parent: string | null, event: string) → ChannelVerdict <!-- internal -->
      <a id="check.flows.emitsVerdict"></a><br>Static evidence of `emits event <id>` (ADR 0023 п. 1): the code `parent` reaches dispatches the event, by the rules of a step to an event: `ok` over the edges the mode follows (in `shape` a dispatch is a framework call, so it is `unverified` there), `unverified` with the reason…
      - calls [check.flows.reachability](check.md#check.flows.reachability)
    - type [Step](../../src/flows.ts#L647) <!-- internal -->
      <a id="check.flows.Step"></a><br>One resolved call edge with its endpoints (the callee mapped to a constructor for `new X()`).
    - type [CallGraph](../../src/flows.ts#L654) <!-- internal -->
      <a id="check.flows.CallGraph"></a><br>The snapshot's calls indexed for the searches below, plus what makes an absence unprovable.
    - fn [callGraph](../../src/flows.ts#L683) (input: FlowInput) → CallGraph <!-- internal -->
      <a id="check.flows.callGraph"></a><br>Index the snapshot's call edges and fns once per evaluation.
      - calls [base.languages.constructorName](base.md#base.languages.constructorName), [check.flows.callName](check.md#check.flows.callName), [base.languages.caselessNames](base.md#base.languages.caselessNames), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [check.flows.doubtfulBodies](check.md#check.flows.doubtfulBodies)
    - fn [doubtfulBodies](../../src/flows.ts#L741) (input: FlowInput) → DoubtfulBodies <!-- internal -->
      <a id="check.flows.doubtfulBodies"></a><br>Fns whose body a proof cannot pass through. A decorator in coverage (`@replace` before `def decorated`) belongs to the fn it names as its source or, when its source is the module, to the first fn declared at or after it.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [lastSegment](../../src/flows.ts#L769) (text: string) → string <!-- internal -->
      <a id="check.flows.lastSegment"></a><br>The last dotted segment of an ID or a call text.
    - fn [callName](../../src/flows.ts#L777) (id: string) → string <!-- internal -->
      <a id="check.flows.callName"></a><br>The name code calls a fn by: `m` for `X.m` and `X.m-static`, `#go` for `X.go-private` (§11: a member that shares its name with another gets a suffix).
      - calls [check.flows.lastSegment](check.md#check.flows.lastSegment)
    - fn [namedLike](../../src/flows.ts#L791) (graph: CallGraph, name: string) → string[] <!-- internal -->
      <a id="check.flows.namedLike"></a><br>Fns a call by `name` (`feed`, `#work`) may run. A `#work` call also matches a private member whose ID has no suffix; a fn of PHP matches the name in any ASCII case (`x.RUN` may run `run`).
      - calls [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase)
    - fn [describeVia](../../src/flows.ts#L798) (edge: SnapshotEdge, where = true) → string <!-- internal -->
      <a id="check.flows.describeVia"></a><br>A `via` edge in words. `where`: with the position of a passed callable (a hole's message adds the edge's position itself).
      - calls [check.flows.describeConfig](check.md#check.flows.describeConfig), [check.flows.at](check.md#check.flows.at)
    - fn [describeConfig](../../src/flows.ts#L821) (edge: Pick<SnapshotEdge, "via" | "binding" | "site" | "scope">) → string
      <a id="check.flows.describeConfig"></a><br>A call the framework makes by its config, as the verdict names it: `the preference `I → C` in `etc/di.xml:12``, `the plugin `p` (`P`) on `X` (plugin:around) in `etc/di.xml:30``, with the area when it is not global.
    - fn [provesIn](../../src/flows.ts#L839) (behavior: boolean) → (step: Step) => boolean <!-- internal -->
      <a id="check.flows.provesIn"></a><br>The edges a static mode follows as a proof: plain calls outside closures; in `behavior` also hook edges, callables passed as arguments and calls in a closure passed as an argument (the callee of the call holds it).
    - fn [closureOnly](../../src/flows.ts#L848) (edge: SnapshotEdge, behavior: boolean) → boolean <!-- internal -->
      <a id="check.flows.closureOnly"></a><br>The edge is a route only when some holder calls the closure it sits in: a call in a stored closure, or (in `behavior`) a callable passed from inside one. In `shape`, a closure passed as an argument is named as its `via`.
    - fn [describeHole](../../src/flows.ts#L853) (edge: SnapshotEdge, target: string, input: FlowInput) → string <!-- internal -->
      <a id="check.flows.describeHole"></a><br>Why a call cannot be a proof: ambiguous, a via edge this mode does not follow, a possible override, or unresolved.
      - calls [check.flows.describeVia](check.md#check.flows.describeVia), [check.flows.lastSegment](check.md#check.flows.lastSegment), [check.flows.callName](check.md#check.flows.callName)
    - fn [at](../../src/flows.ts#L870) (edge: SnapshotEdge) → string <!-- internal -->
      <a id="check.flows.at"></a><br>`file:line:col` of an edge.
    - fn [reachability](../../src/flows.ts#L897) (graph: CallGraph, input: FlowInput, parent: string | null, target: string) → ChannelVerdict <!-- internal -->
      <a id="check.flows.reachability"></a><br>Static reachability of `target` from `parent`.
      - calls [check.flows.externalImport](check.md#check.flows.externalImport), [check.flows.provesIn](check.md#check.flows.provesIn), [check.flows.search](check.md#check.flows.search), [check.flows.routeMessage](check.md#check.flows.routeMessage), [check.flows.routeSteps](check.md#check.flows.routeSteps), [check.flows.possibleRoute](check.md#check.flows.possibleRoute), [check.flows.closureOnly](check.md#check.flows.closureOnly), [check.flows.at](check.md#check.flows.at), [check.flows.describeHole](check.md#check.flows.describeHole), [check.flows.callersOf](check.md#check.flows.callersOf), [check.flows.escapeOf](check.md#check.flows.escapeOf), [check.flows.holeNear](check.md#check.flows.holeNear)
    - fn [directCall](../../src/flows.ts#L985) (graph: CallGraph, input: FlowInput, parent: string | null, target: string) → ChannelVerdict <!-- internal -->
      <a id="check.flows.directCall"></a><br>Static evidence for `calls`: whether `parent` calls `target` itself, without order. `ok` is a resolved call in the parent's own body that this mode follows. `fail` is a confirmed absence under the rules of a step's absence: no call of the parent can be the target (no unresolved…
      - calls [check.flows.externalImport](check.md#check.flows.externalImport), [check.flows.provesIn](check.md#check.flows.provesIn), [check.flows.routeMessage](check.md#check.flows.routeMessage), [check.flows.closureOnly](check.md#check.flows.closureOnly), [check.flows.at](check.md#check.flows.at), [check.flows.describeHole](check.md#check.flows.describeHole), [check.flows.namedLike](check.md#check.flows.namedLike), [check.flows.lastSegment](check.md#check.flows.lastSegment), [base.languages.caselessNames](base.md#base.languages.caselessNames), [check.flows.callName](check.md#check.flows.callName), [base.languages.asciiLowerCase](base.md#base.languages.asciiLowerCase), [check.flows.escapeOf](check.md#check.flows.escapeOf), [check.flows.search](check.md#check.flows.search), [check.flows.routeSteps](check.md#check.flows.routeSteps)
    - fn [search](../../src/flows.ts#L1049) (graph: CallGraph, parent: string, target: string, follow: (step: Step) => boolean) → RouteSearch <!-- internal -->
      <a id="check.flows.search"></a><br>Breadth-first from `parent` over the steps `follow` accepts: the route to `target` (null when there is none) and the depth of every fn reached. The search stops at the target, so `depth` is complete only without a route.
    - fn [routeSteps](../../src/flows.ts#L1079) (parent: string, target: string, previous: Map<string, Step>) → Step[] <!-- internal -->
      <a id="check.flows.routeSteps"></a><br>The steps of a route from `parent` to `target`, in call order.
    - fn [fileModule](../../src/flows.ts#L1094) (nodes: FlowInput["nodes"], id: string) → string | null <!-- internal -->
      <a id="check.flows.fileModule"></a><br>The file module of a fn: the nearest module that is not a class.
    - fn [externalImport](../../src/flows.ts#L1113) (input: FlowInput, parent: string, target: string) → ChannelVerdict <!-- internal -->
      <a id="check.flows.externalImport"></a><br>Static proof for `external.<pkg>`: a resolved import from the parent fn's own module that loads the package. A type-only one (`import type`, `export type … from`) is erased from the code that runs, so it proves nothing.
      - calls [check.flows.fileModule](check.md#check.flows.fileModule), [check.flows.at](check.md#check.flows.at)
    - fn [describeDocblock](../../src/flows.ts#L1129) (edge: SnapshotEdge) → string <!-- internal -->
      <a id="check.flows.describeDocblock"></a><br>An edge that rests on a docblock: where PHP's `@var` or `@param` types the receiver.
      - calls [check.flows.at](check.md#check.flows.at)
    - fn [routeMessage](../../src/flows.ts#L1138) (parent: string, target: string, previous: Map<string, Step>) → string <!-- internal -->
      <a id="check.flows.routeMessage"></a><br>The route as the verdict prints it, with a note on every step that is not a plain call of the code: a hook (its default, or the value injected at a site) or a call whose receiver only a docblock types.
      - calls [check.flows.routeSteps](check.md#check.flows.routeSteps), [check.flows.describeVia](check.md#check.flows.describeVia), [check.flows.describeDocblock](check.md#check.flows.describeDocblock)
    - fn [possibleRoute](../../src/flows.ts#L1156) (graph: CallGraph, input: FlowInput, parent: string, target: string, proves: (step: Step) => boolean) → PossibleRoute <!-- internal -->
      <a id="check.flows.possibleRoute"></a><br>Breadth-first search that also follows calls with more than one possible target and calls in closures. Returns the first such call on the shortest route (null when there is none) and every fn the search reached.
      - calls [check.flows.namedLike](check.md#check.flows.namedLike), [check.flows.callName](check.md#check.flows.callName), [check.flows.lastSegment](check.md#check.flows.lastSegment)
    - fn [callersOf](../../src/flows.ts#L1195) (graph: CallGraph, target: string) → Set<string> <!-- internal -->
      <a id="check.flows.callersOf"></a><br>Every fn with a resolved or candidate route to `target`, the target included.
    - fn [escapeOf](../../src/flows.ts#L1216) (graph: CallGraph, input: FlowInput, routes: Set<string>, reachable: ReadonlySet<string>) → { reason: string; from: string | null } | null <!-- internal -->
      <a id="check.flows.escapeOf"></a><br>Why code keylang cannot follow may still run a fn of `routes`, and the fn whose code hands that fn on (null when it is not in a fn: module level, an unsupported construct); null when every route is by name.
      - calls [check.flows.fnAt](check.md#check.flows.fnAt), [check.flows.at](check.md#check.flows.at), [check.flows.callName](check.md#check.flows.callName), [base.languages.caselessNames](base.md#base.languages.caselessNames), [check.flows.identifierPattern](check.md#check.flows.identifierPattern), [base.span.compareText](base.md#base.span.compareText)
    - fn [identifierPattern](../../src/flows.ts#L1273) (name: string, caseless = false) → RegExp <!-- internal -->
      <a id="check.flows.identifierPattern"></a><br>`name` as a whole identifier: `$save` and `зберегти` too, which `\b` does not delimit; `caseless`: in any ASCII case, as PHP compares names (`HELPER` is `helper`, `ÄNDERN` is no `ändern`), which the flag `i` would not keep apart.
    - fn [fnAt](../../src/flows.ts#L1281) (input: FlowInput, file: string, line: number) → string | null <!-- internal -->
      <a id="check.flows.fnAt"></a><br>The innermost fn whose declaration holds `file:line`.
    - fn [holeNear](../../src/flows.ts#L1298) (graph: CallGraph, holes: { edge: SnapshotEdge }[], from: string) → SnapshotEdge | null <!-- internal -->
      <a id="check.flows.holeNear"></a><br>The unresolved call in reachable code nearest `from` among the fns `from` calls, itself included: where a value handed on by `from` may be called. Null when no hole is downstream of it.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [moduleMembers](../../src/flows.ts#L1321) (nodes: FlowInput["nodes"], id: string) → "complete" | "opaque" | null <!-- internal -->
      <a id="check.flows.moduleMembers"></a><br>Whether the nearest enclosing module with a members verdict lists them completely or is opaque; null when none says.
    - fn [collectPlanned](../../src/flows.ts#L1340) (spec: SpecIR, input: FlowInput, diagnostics: Diagnostic[]) → Map<string, Planned> <!-- internal -->
      <a id="check.flows.collectPlanned"></a><br>`planned` declarations. A duplicate is K002.
      - calls [check.flows.codeLocation](check.md#check.flows.codeLocation), [check.flows.plannedMismatch](check.md#check.flows.plannedMismatch), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [codeLocation](../../src/flows.ts#L1373) (id: string, code: SnapshotNodeView, edges: readonly SnapshotEdge[]) → string <!-- internal -->
      <a id="check.flows.codeLocation"></a><br>Where the code of a planned id is: its file and line, or for a node without a file (a package) its first importer. Neither: `in the code`.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [plannedMismatch](../../src/flows.ts#L1388) (item: { decl: string; signature: string | null }, code: { kind: string; signature?: string | null; file?: string | null }) → "kind" | "signature" | null
      <a id="check.flows.plannedMismatch"></a><br>How the code differs from a `planned` declaration of the same id: K201 for a kind or a signature, null (K202) when it matches.
      - calls [check.flows.sameSignature](check.md#check.flows.sameSignature)
    - fn [sameSignature](../../src/flows.ts#L1403) (planned: string, code: string, file: string | null) → boolean <!-- internal -->
      <a id="check.flows.sameSignature"></a><br>Signatures match without spaces, `->` as `→`. A Python method shows its receiver (`(self, to: str)`), a plan may name only what the caller passes (`(to: str)`): both match.
      - calls [check.flows.normalizeSignature](check.md#check.flows.normalizeSignature), [check.flows.parameterList](check.md#check.flows.parameterList)
    - fn [parameterList](../../src/flows.ts#L1418) (signature: string) → string | null <!-- internal -->
      <a id="check.flows.parameterList"></a><br>The leading `(…)` of a normalized signature, up to the parenthesis that closes the first; null when there is none.
    - fn [normalizeSignature](../../src/flows.ts#L1431) (text: string) → string <!-- internal -->
      <a id="check.flows.normalizeSignature"></a><br>A signature without whitespace or a trailing `;`, with `->` written as `→`.
    - fn [specHash](../../src/flows.ts#L1436) (text: string) → string <!-- internal -->
      <a id="check.flows.specHash"></a><br>SHA-256 of a spec line: ties a verdict to the exact text it was about.
  - module [migration](../../src/migration.ts#L1)
    <a id="check.migration"></a><br>Migration between stacks (business-flows/27): the rows of `# migration <name>` (`map <old> → [planned] <new>`, `dropped <old> <reason>`) checked against both sides, and the parity of the old stack's flows with the new one. Pure over two stacks — snapshot nodes, entries, flows…
    - node [external.node](external.md#external.node)
    - diag [base.diag](base.md#base.diag)
    - json [base.json](base.md#base.json)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - test-report [check.test-report](check.md#check.test-report)
    - verdict [check.verdict](check.md#check.verdict)
    - type [MigrationRow](../../src/migration.ts#L30)
      <a id="check.migration.MigrationRow"></a><br>One row of a `# migration` section that parsed.
    - fn [migrationRows](../../src/migration.ts#L52) (docs: readonly Document[]) → MigrationRow[]
      <a id="check.migration.migrationRows"></a><br>Every row of every `# migration` section, in file and line order.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [base.span.compareText](base.md#base.span.compareText)
    - type [NodeView](../../src/migration.ts#L89)
      <a id="check.migration.NodeView"></a><br>What a node of a snapshot says about its contents: enough to tell present, opaque and missing apart.
    - type [OldSnapshot](../../src/migration.ts#L95)
      <a id="check.migration.OldSnapshot"></a><br>The old snapshot `check` resolves old IDs against: none configured, unreadable, or loaded.
    - type [OldIndex](../../src/migration.ts#L101)
      <a id="check.migration.OldIndex"></a><br>An index file of the old stack as `check` and `migration status` read it: `.keylang/index.json` or the export of `map --export-index`.
    - fn [readOldIndex](../../src/migration.ts#L114) (abs: string) → OldIndex
      <a id="check.migration.readOldIndex"></a><br>Reads an index file; a file that is not one is an error naming it.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.diag.errorText](base.md#base.diag.errorText), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [check.migration.isNodeViews](check.md#check.migration.isNodeViews), [check.migration.isEntryRows](check.md#check.migration.isEntryRows)
    - fn [isNodeViews](../../src/migration.ts#L142) (nodes: JsonObject) → nodes is JsonObject & Record<string, NodeView> <!-- internal -->
      <a id="check.migration.isNodeViews"></a><br>Every node of an index file has its `kind`, and `members` when it has one is a known value.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [isEntryRows](../../src/migration.ts#L147) (entries: JsonValue[]) → entries is (JsonObject & OldIndex["entries"][number])[] <!-- internal -->
      <a id="check.migration.isEntryRows"></a><br>Every entry point of an index file has its `kind`, `label` and `id`.
      - calls [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [lookupNode](../../src/migration.ts#L156) (nodes: Readonly<Record<string, NodeView>>, id: string) → "present" | "opaque" | "missing"
      <a id="check.migration.lookupNode"></a><br>Where `id` is in a snapshot's nodes: `present`; `opaque` when the nearest enclosing node is a module whose contents keylang could not read; else `missing` (the area is fully indexed).
    - type [MigrationFindings](../../src/migration.ts#L176)
      <a id="check.migration.MigrationFindings"></a><br>What `# migration` rows yield in `check`: dangling old IDs and a verdict per row.
    - fn [migrationCheck](../../src/migration.ts#L188) (docs: readonly Document[], old: OldSnapshot, snapshotId: string | null) → MigrationFindings
      <a id="check.migration.migrationCheck"></a><br>`check` of the migration rows' old side: each old ID is `ok` when the old snapshot has it, K001 when the snapshot reads its area and lacks it, `unverified` inside an opaque module, without an old snapshot (`migration.from`) or when it cannot be read. The new side is a reference…
      - calls [check.migration.migrationRows](check.md#check.migration.migrationRows), [check.migration.lookupNode](check.md#check.migration.lookupNode), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - type [StackFlow](../../src/migration.ts#L236)
      <a id="check.migration.StackFlow"></a><br>A flow of one stack: hand-written (`spec`) or drafted from an entry point (`discovered`).
    - type [StackIntegration](../../src/migration.ts#L252)
      <a id="check.migration.StackIntegration"></a><br>An outgoing integration of a stack, with the fns that call it.
    - type [StackWebhook](../../src/migration.ts#L261)
      <a id="check.migration.StackWebhook"></a><br>An incoming webhook of a stack.
    - type [Stack](../../src/migration.ts#L268)
      <a id="check.migration.Stack"></a><br>What parity reads of one stack.
    - type [StepParity](../../src/migration.ts#L280)
      <a id="check.migration.StepParity"></a><br>How one step of an old flow is carried over by the table.
    - type [TestParity](../../src/migration.ts#L289)
      <a id="check.migration.TestParity"></a><br>One test of an old flow, judged on both sides by its name.
    - type [FlowParity](../../src/migration.ts#L297)
      <a id="check.migration.FlowParity"></a><br>The verdict for one old flow: its counterpart in the new stack, its steps and its tests.
    - type [MigrationStatus](../../src/migration.ts#L311)
      <a id="check.migration.MigrationStatus"></a><br>The whole `migration status` result: per-flow parity and what is left to carry over.
    - fn [migrationStatus](../../src/migration.ts#L339) (input: { from: string; old: Stack; current: Stack; rows: readonly MigrationRow[]; notes?: readonly string[] }) → MigrationStatus
      <a id="check.migration.migrationStatus"></a><br>The parity of every flow of the old stack, and what is not carried over yet. Deterministic: same inputs, same bytes.
      - calls [base.span.compareText](base.md#base.span.compareText), [check.migration.lookupNode](check.md#check.migration.lookupNode), [check.migration.counterpartOf](check.md#check.migration.counterpartOf), [check.migration.evidence](check.md#check.migration.evidence)
    - fn [evidence](../../src/migration.ts#L521) (stack: Stack, file: string, name: string, side: "old" | "new") → Pick<TestEvidence, "verdict" | "message"> <!-- internal -->
      <a id="check.migration.evidence"></a><br>A test's evidence on one side; a stack without a report leaves it unverified.
      - calls [check.test-report.matchTest](check.md#check.test-report.matchTest)
    - fn [counterpartOf](../../src/migration.ts#L534) (flow: StackFlow, candidates: readonly StackFlow[], mapped: ReadonlyMap<string, readonly MigrationRow[]>) → { flow: StackFlow; by: "import" | "trigger" | "steps" } | null <!-- internal -->
      <a id="check.migration.counterpartOf"></a><br>The new flow an old one became: a hand-written flow `flow import` brought in under the same name; else one whose trigger the table maps the old trigger to; else the one with most of the old steps mapped into it (at least one). Hand-written flows before discovered ones, then by…
    - fn [migrationStatusText](../../src/migration.ts#L563) (status: MigrationStatus) → string
      <a id="check.migration.migrationStatusText"></a><br>The report `keylang migration status` prints.
  - module [resolve](../../src/resolve.ts#L1)
    <a id="check.resolve"></a><br>Cross-file ID resolution: builds the declaration index and reports duplicate declarations (K002) and dangling references (K001).
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - span [base.span](base.md#base.span)
    - type [Decl](../../src/resolve.ts#L18)
      <a id="check.resolve.Decl"></a><br>A declared ID: where its name is written and what kind of item declares it.
    - type [Lookup](../../src/resolve.ts#L32)
      <a id="check.resolve.Lookup"></a><br>The outcome of looking up an ID in the index.
    - type [Members](../../src/resolve.ts#L39) = (moduleId: string) => "complete" | "opaque" | undefined
      <a id="check.resolve.Members"></a><br>What the snapshot knows about a module's members; `undefined` when it has no such module.
    - type [ResolveContext](../../src/resolve.ts#L42)
      <a id="check.resolve.ResolveContext"></a><br>What resolution knows besides the documents.
    - type [Unverified](../../src/resolve.ts#L52)
      <a id="check.resolve.Unverified"></a><br>A reference into a module whose contents the snapshot does not know: neither confirmed nor dangling.
    - type [IndexJson](../../src/resolve.ts#L65) = { decls: Record<string, Decl>; flows: Record<string, Decl> } <!-- internal -->
      <a id="check.resolve.IndexJson"></a><br>An index as JSON: declarations and flows by their name.
    - module [Index](../../src/resolve.ts#L68)
      <a id="check.resolve.Index"></a><br>Every declaration of the documents by ID, flows by name and `planned` intentions by ID.
      - fn [constructor](../../src/resolve.ts#L75) (members?: Members)
        <a id="check.resolve.Index.constructor"></a><br>Stores the optional `Members` map on the new [`check.resolve.Index`](check.md#check.resolve.Index) instance without validating or copying it, leaving the field undefined when no argument is passed. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [lookup](../../src/resolve.ts#L80) (id: string) → Lookup
        <a id="check.resolve.Index.lookup"></a><br>An exact declaration, else the nearest declared module above `id` when its contents are unknown (opaque), else missing.
        - calls [check.resolve.Index.longestPrefix](check.md#check.resolve.Index.longestPrefix)
      - fn [snapshotOpaque](../../src/resolve.ts#L100) (id: string) → boolean
        <a id="check.resolve.Index.snapshotOpaque"></a><br>The snapshot knows the module and says its contents are unknown.
      - fn [longestPrefix](../../src/resolve.ts#L105) (id: string) → Decl | undefined <!-- internal -->
        <a id="check.resolve.Index.longestPrefix"></a><br>The longest declared proper prefix of `id` (`a.b` for `a.b.c`), cutting one segment at a time.
      - fn [suggest](../../src/resolve.ts#L120) (id: string) → string | undefined
        <a id="check.resolve.Index.suggest"></a><br>Best-effort "did you mean" among siblings of the missing segment.
        - calls [check.resolve.Index.longestPrefix](check.md#check.resolve.Index.longestPrefix), [check.resolve.similarity](check.md#check.resolve.similarity)
      - fn [toJSON](../../src/resolve.ts#L147) () → IndexJson
        <a id="check.resolve.Index.toJSON"></a><br>The index as plain JSON, for `parse --json` and tools.
    - fn [similarity](../../src/resolve.ts#L157) (a: string, b: string) → number | null <!-- internal -->
      <a id="check.resolve.similarity"></a><br>How close two names are for a suggestion (0 = one contains the other), or null when too far: a short name only matches a near-exact typo, so `zz` does not suggest `ab`, nor `banana` a layer `a`.
      - calls [check.resolve.codePoints](check.md#check.resolve.codePoints), [check.resolve.levenshtein](check.md#check.resolve.levenshtein)
    - fn [codePoints](../../src/resolve.ts#L170) (s: string) → number <!-- internal -->
      <a id="check.resolve.codePoints"></a><br>Length in Unicode code points, not UTF-16 units.
    - fn [nearestName](../../src/resolve.ts#L175) (word: string, candidates: Iterable<string>) → string | undefined
      <a id="check.resolve.nearestName"></a><br>The candidate closest to `word` for a «did you mean», or undefined when none is close enough.
      - calls [check.resolve.similarity](check.md#check.resolve.similarity), [base.span.compareText](base.md#base.span.compareText)
    - type [Resolved](../../src/resolve.ts#L189) <!-- internal -->
      <a id="check.resolve.Resolved"></a>
    - fn [check](../../src/resolve.ts#L192) (docs: readonly Document[], context: ResolveContext = {}) → Resolved
      <a id="check.resolve.check"></a><br>Build the index over all documents and check every reference.
      - calls [check.resolve.Index](check.md#check.resolve.Index), [check.resolve.insert](check.md#check.resolve.insert), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [lang.ir.isDecl](lang.md#lang.ir.isDecl), [check.resolve.checkRefs](check.md#check.resolve.checkRefs)
    - fn [insert](../../src/resolve.ts#L253) (map: Map<string, Decl>, decl: Decl, what: string, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.insert"></a><br>Adds `decl`, or reports K002 against the first declaration of the same ID; `what` names the namespace.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [thenCandidates](../../src/resolve.ts#L281) (index: Index, word: string) → string[] <!-- internal -->
      <a id="check.resolve.thenCandidates"></a><br>Ids whose last segment is `word`: map declarations and `planned`, never a layer.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [warnBareThen](../../src/resolve.ts#L301) (index: Index, doc: Document, node: Node, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.warnBareThen"></a><br>`then save` is text (Р10). When `save` is the last segment of a real id, say so.
      - calls [lang.parser.linkTextSpan](lang.md#lang.parser.linkTextSpan), [lang.parser.isSegment](lang.md#lang.parser.isSegment), [check.resolve.thenCandidates](check.md#check.resolve.thenCandidates), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [danglingMessage](../../src/resolve.ts#L331) (index: Index, doc: Document, target: string) → string <!-- internal -->
      <a id="check.resolve.danglingMessage"></a><br>K001 text. A generated file is regenerated, not edited, so `did you mean` and `planned` would mislead there: the hint names the command from its marker.
      - calls [check.resolve.Index.suggest](check.md#check.resolve.Index.suggest)
    - fn [checkContinues](../../src/resolve.ts#L346) (index: Index, doc: Document, node: Node, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.checkContinues"></a><br>K206: `continues <flow>` names a flow no `# flow` declares.
      - calls [check.resolve.similarity](check.md#check.resolve.similarity), [base.span.compareText](base.md#base.span.compareText), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [eventRef](../../src/resolve.ts#L365) (node: Node) → Ref | null <!-- internal -->
      <a id="check.resolve.eventRef"></a><br>The reference of `trigger event <id>` or of `emits [event] events.<name>` (ADR 0023 п. 1), null for any other line.
    - fn [checkEventRef](../../src/resolve.ts#L378) (index: Index, doc: Document, node: Node, ref: Ref, diags: Diagnostic[]) → void <!-- internal -->
      <a id="check.resolve.checkEventRef"></a><br>K204 / K205 for an event reference: an ID nothing declares is an unknown event (did you mean the nearest event), an ID of a fn, type or module is not an event. `planned event` counts as declared.
      - calls [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [base.diag.diagnostic](base.md#base.diag.diagnostic), [lang.ir.kindLabel](lang.md#lang.ir.kindLabel), [check.resolve.similarity](check.md#check.resolve.similarity), [base.span.compareText](base.md#base.span.compareText)
    - fn [checkRefs](../../src/resolve.ts#L416) (index: Index, doc: Document, node: Node, diags: Diagnostic[], unverified: Unverified[], knownExternal: ReadonlySet<string>) → void <!-- internal -->
      <a id="check.resolve.checkRefs"></a><br>Checks one item and its children: line-level warnings, then each reference (K001, or unverified inside an opaque module).
      - calls [check.resolve.warnBareThen](check.md#check.resolve.warnBareThen), [check.resolve.checkContinues](check.md#check.resolve.checkContinues), [check.resolve.eventRef](check.md#check.resolve.eventRef), [check.resolve.checkEventRef](check.md#check.resolve.checkEventRef), [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.resolve.danglingMessage](check.md#check.resolve.danglingMessage), [check.resolve.Index.snapshotOpaque](check.md#check.resolve.Index.snapshotOpaque), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning)
    - fn [levenshtein](../../src/resolve.ts#L457) (a: string, b: string) → number <!-- internal -->
      <a id="check.resolve.levenshtein"></a><br>Edit distance over code points, computed row by row with two arrays.
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
    - type [SnapshotView](../../src/rules.ts#L23) <!-- internal -->
      <a id="check.rules.SnapshotView"></a><br>The slice of the snapshot rules need. Kept here so `check` does not import `map`.
    - type [Rule](../../src/rules.ts#L32) <!-- internal -->
      <a id="check.rules.Rule"></a><br>One `allow`/`deny` line flattened for matching: source scope `a`, target scopes `b`.
    - type [LayerOrder](../../src/rules.ts#L43) <!-- internal -->
      <a id="check.rules.LayerOrder"></a><br>One `layers a < b < c` line: `a` lowest.
    - type [UseEdge](../../src/rules.ts#L51) <!-- internal -->
      <a id="check.rules.UseEdge"></a><br>A snapshot edge lifted to the modules at its ends: what dependency rules judge.
    - fn [docblockNote](../../src/rules.ts#L72) (edge: Pick<UseEdge, "docblock" | "config">) → string <!-- internal -->
      <a id="check.rules.docblockNote"></a><br>The note a verdict adds to a dependency that exists only thanks to a docblock, or only in a framework's config.
    - fn [configNote](../../src/rules.ts#L80) (edge: { via?: string; binding?: string; site?: string; scope?: string }) → string <!-- internal -->
      <a id="check.rules.configNote"></a><br>A config edge in words for a K102: `the preference `I → C` (app/etc/di.xml:12)`.
    - fn [siteAt](../../src/rules.ts#L90) (site: string | undefined) → { file: string; line: number; col: number } | null <!-- internal -->
      <a id="check.rules.siteAt"></a><br>`file:line:col` → its parts; null for another shape.
    - type [RuleReport](../../src/rules.ts#L100)
      <a id="check.rules.RuleReport"></a><br>The diagnostics and verdicts of the rules.
    - fn [checkRules](../../src/rules.ts#L106) (docs: readonly Document[], index: Index, snapshot: SnapshotView | null = null) → Diagnostic[]
      <a id="check.rules.checkRules"></a><br>Compiles the documents and evaluates their rules; only the diagnostics (compile and rule ones) are returned.
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [check.rules.evaluateRules](check.md#check.rules.evaluateRules)
    - fn [dependencyKindOf](../../src/rules.ts#L113) ( source: readonly Document[] | SpecIR, index: Index, nodes: Readonly<Record<string, { kind: string }>> | undefined, ) → (id: string) => string | undefined
      <a id="check.rules.dependencyKindOf"></a><br>Kind of an id the way `evaluateRules` sees it: a fn, type, or event rule applies nowhere.
      - calls [check.rules.specOf](check.md#check.rules.specOf), [check.rules.plannedDecl](check.md#check.rules.plannedDecl)
    - fn [blocksDependency](../../src/rules.ts#L124) ( spec: SpecIR, from: string, to: string, kindOf: (id: string) => string | undefined = () => undefined, format: RuleFormat = 1, ) → boolean
      <a id="check.rules.blocksDependency"></a><br>Whether `from` depending on `to` is forbidden by the deny that wins under `format`.
      - calls [check.rules.denyingRule](check.md#check.rules.denyingRule)
    - fn [denyingRule](../../src/rules.ts#L138) ( spec: SpecIR, from: string, to: string, kindOf: (id: string) => string | undefined = () => undefined, format: RuleFormat = 1, ) → { text: string; file: string; line: number; aside: string } | null
      <a id="check.rules.denyingRule"></a><br>The deny that wins `from → to`, or null. `aside` is the incomparable allow a K102 should name: empty when the deny won because it was more specific.
      - calls [check.rules.collectRules](check.md#check.rules.collectRules), [check.rules.ruleHits](check.md#check.rules.ruleHits), [check.rules.specific](check.md#check.rules.specific), [check.rules.incomparableAside](check.md#check.rules.incomparableAside), [check.rules.decide](check.md#check.rules.decide), [check.rules.byHit](check.md#check.rules.byHit)
    - fn [evaluateRules](../../src/rules.ts#L172) (spec: SpecIR, index: Index, snapshot: SnapshotView | null, docs: readonly Document[] = [], format: RuleFormat = 1) → RuleReport
      <a id="check.rules.evaluateRules"></a><br>The rules of `spec` against `snapshot`; without one, a single `unverified` verdict stands for all rule lines.
      - calls [check.rules.plannedDecl](check.md#check.rules.plannedDecl), [check.rules.collectRules](check.md#check.rules.collectRules), [check.rules.incomparableWarnings](check.md#check.rules.incomparableWarnings), [check.rules.firstRuleLine](check.md#check.rules.firstRuleLine), [check.rules.hashText](check.md#check.rules.hashText), [check.rules.noSnapshotSpec](check.md#check.rules.noSnapshotSpec), [check.rules.evaluateOnSnapshot](check.md#check.rules.evaluateOnSnapshot)
    - fn [specOf](../../src/rules.ts#L205) (source: readonly Document[] | SpecIR) → SpecIR <!-- internal -->
      <a id="check.rules.specOf"></a><br>`source` as SpecIR, compiling documents when needed.
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec)
    - fn [plannedDecl](../../src/rules.ts#L212) (spec: SpecIR, id: string) → string <!-- internal -->
      <a id="check.rules.plannedDecl"></a><br>The declared kind of a `planned` ID (`fn` when not found).
    - fn [evaluateOnSnapshot](../../src/rules.ts#L217) (rules: EvaluatedRules, index: Index, snapshot: SnapshotView, planned: readonly string[], format: RuleFormat) → RuleReport <!-- internal -->
      <a id="check.rules.evaluateOnSnapshot"></a><br>Every rule against the snapshot: dependencies (K102/K107), layer orders (K101), and the other rule kinds below.
      - calls [check.rules.siteAt](check.md#check.rules.siteAt), [check.rules.configNote](check.md#check.rules.configNote), [check.rules.base](check.md#check.rules.base), [check.rules.holeAt](check.md#check.rules.holeAt), [check.rules.docblockNote](check.md#check.rules.docblockNote), [check.rules.ruleHits](check.md#check.rules.ruleHits), [check.rules.decide](check.md#check.rules.decide), [check.rules.crossRules](check.md#check.rules.crossRules), [check.rules.sameAreas](check.md#check.rules.sameAreas), [check.rules.layerViolation](check.md#check.rules.layerViolation), [check.rules.incomparableAside](check.md#check.rules.incomparableAside), [check.rules.componentSpec](check.md#check.rules.componentSpec), [check.rules.layerComponent](check.md#check.rules.layerComponent), [check.rules.holeText](check.md#check.rules.holeText), [check.rules.listAt](check.md#check.rules.listAt), [check.rules.overrideEvidence](check.md#check.rules.overrideEvidence), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.pointAt](check.md#check.rules.pointAt), [check.rules.hashText](check.md#check.rules.hashText), [check.resolve.Index.lookup](check.md#check.resolve.Index.lookup), [check.scc.stronglyConnected](check.md#check.scc.stronglyConnected), [check.scc.cycleThrough](check.md#check.scc.cycleThrough)
    - type [Hole](../../src/rules.ts#L779) = SnapshotView["coverage"][number] <!-- internal -->
      <a id="check.rules.Hole"></a><br>A coverage entry of the snapshot: a hole when its kind is one of `DEPENDENCY_HOLES`.
    - type [IndexedHole](../../src/rules.ts#L782) <!-- internal -->
      <a id="check.rules.IndexedHole"></a><br>A hole and its place in the coverage list, which decides between two holes of one module.
    - fn [listAt](../../src/rules.ts#L788) (map: Map<string, T[]>, key: string) → T[] <!-- internal -->
      <a id="check.rules.listAt"></a><br>The list under `key`, created empty when missing.
    - fn [holeText](../../src/rules.ts#L799) (hole: Hole) → string <!-- internal -->
      <a id="check.rules.holeText"></a><br>`unresolved import (src/a.ts:1:19)`: the hole in a verdict's reason.
      - calls [check.rules.holeAt](check.md#check.rules.holeAt)
    - fn [holeAt](../../src/rules.ts#L804) (hole: Hole) → string <!-- internal -->
      <a id="check.rules.holeAt"></a><br>`src/a.ts:1:19`: where the hole is, the `hole` field of a verdict.
    - fn [layerViolation](../../src/rules.ts#L812) (rules: EvaluatedRules, fromLayer: string, toLayer: string) → string | null <!-- internal -->
      <a id="check.rules.layerViolation"></a><br>Why a dependency between two layers breaks the layer orders, or null.
    - fn [layerComponent](../../src/rules.ts#L823) (rules: EvaluatedRules, layer: string) → Set<string> <!-- internal -->
      <a id="check.rules.layerComponent"></a><br>Layers joined to `layer` by the undirected partial order, including `layer` itself.
    - fn [componentSpec](../../src/rules.ts#L843) (rules: EvaluatedRules, layer: string) → string <!-- internal -->
      <a id="check.rules.componentSpec"></a><br>Canonical texts of the `layers` lines in `layer`'s connected order, one hash input.
      - calls [check.rules.layerComponent](check.md#check.rules.layerComponent)
    - type [RuleHit](../../src/rules.ts#L854) <!-- internal -->
      <a id="check.rules.RuleHit"></a><br>A rule that matches an edge, with its specificity score.
    - type [OverrideNote](../../src/rules.ts#L863) <!-- internal -->
      <a id="check.rules.OverrideNote"></a><br>Why a deny did not decide an edge: the rule that won instead, and how.
    - fn [ruleHits](../../src/rules.ts#L875) (rules: EvaluatedRules, from: string, to: string, within: (id: string, scope: string) => boolean) → RuleHit[] <!-- internal -->
      <a id="check.rules.ruleHits"></a><br>Every allow or deny that matches the edge, scored by the deepest target it names.
      - calls [check.rules.scopeDepth](check.md#check.rules.scopeDepth)
    - fn [byHit](../../src/rules.ts#L907) (a: RuleHit, b: RuleHit) → number <!-- internal -->
      <a id="check.rules.byHit"></a><br>Source order of two rule hits: by file, then line.
    - fn [dominates](../../src/rules.ts#L914) (a: RuleHit, b: RuleHit) → boolean <!-- internal -->
      <a id="check.rules.dominates"></a><br>`a` is strictly more specific than `b`: neither of its areas is wider, and one is narrower.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin)
    - fn [crossRules](../../src/rules.ts#L922) (a: RuleHit, b: RuleHit) → boolean <!-- internal -->
      <a id="check.rules.crossRules"></a><br>One rule is narrower on the source and the other on the target.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin)
    - fn [sameAreas](../../src/rules.ts#L932) (a: RuleHit, b: RuleHit) → boolean <!-- internal -->
      <a id="check.rules.sameAreas"></a><br>Both hits cover the same source area and the same target area.
    - fn [overManualRules](../../src/rules.ts#L937) (hits: readonly RuleHit[]) → RuleHit[] <!-- internal -->
      <a id="check.rules.overManualRules"></a><br>The baseline is a lower rule layer: a manual hit over the same areas drops a generated one.
      - calls [check.rules.sameAreas](check.md#check.rules.sameAreas)
    - fn [areaWithin](../../src/rules.ts#L942) (id: string, scope: string) → boolean <!-- internal -->
      <a id="check.rules.areaWithin"></a><br>`id` is `scope` or an ID under it.
    - type [Decision](../../src/rules.ts#L946) = { winners: RuleHit[]; denyWins: boolean } <!-- internal -->
      <a id="check.rules.Decision"></a>
    - fn [decide](../../src/rules.ts#L953) (all: readonly RuleHit[], format: RuleFormat) → Decision <!-- internal -->
      <a id="check.rules.decide"></a><br>First a manual hit drops a baseline hit over the same areas (both formats). Format 1: the greatest depth sum, and every `deny` on that sum.
      - calls [check.rules.overManualRules](check.md#check.rules.overManualRules), [check.rules.dominates](check.md#check.rules.dominates)
    - fn [incomparableAside](../../src/rules.ts#L973) (deny: RuleHit, hits: readonly RuleHit[], format: RuleFormat) → string <!-- internal -->
      <a id="check.rules.incomparableAside"></a><br>The `; …` note a K102 adds for each incomparable allow the deny beat; empty when none.
      - calls [check.rules.crossRules](check.md#check.rules.crossRules), [check.rules.byHit](check.md#check.rules.byHit)
    - fn [overrideEvidence](../../src/rules.ts#L995) (deny: Rule, targets: string, notes: readonly OverrideNote[]) → string <!-- internal -->
      <a id="check.rules.overrideEvidence"></a><br>The `ok` message of a deny whose every edge another rule decided: which rules, and why they won.
    - fn [incomparableWarnings](../../src/rules.ts#L1018) (rules: EvaluatedRules, format: RuleFormat) → Diagnostic[] <!-- internal -->
      <a id="check.rules.incomparableWarnings"></a><br>One K106 per incomparable allow/deny line pair, on the allow line. Static: no snapshot required.
      - calls [check.rules.areaWithin](check.md#check.rules.areaWithin), [check.rules.scopeDepth](check.md#check.rules.scopeDepth), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.hashText](check.md#check.rules.hashText)
    - fn [canonicalRuleSpec](../../src/rules.ts#L1075) (spec: SpecIR, file: string, line: number) → string | null
      <a id="check.rules.canonicalRuleSpec"></a><br>Canonical text of the rule line at `file:line`, or null when that line is not a rule. K101, K103, and an unreachable module's entry verdict hash several lines themselves.
      - calls [check.rules.collectRules](check.md#check.rules.collectRules)
    - fn [noSnapshotSpec](../../src/rules.ts#L1099) (spec: SpecIR) → string
      <a id="check.rules.noSnapshotSpec"></a><br>Every rule line of the specs, valid or not, joined in file and line order. The hash of `no snapshot`.
    - fn [firstRuleLine](../../src/rules.ts#L1111) (spec: SpecIR) → { file: string; span: Span } | null <!-- internal -->
      <a id="check.rules.firstRuleLine"></a><br>The first rule line in file, line and column order, a rejected `layers` line included; null without one.
    - fn [scopeDepth](../../src/rules.ts#L1122) (id: string) → number
      <a id="check.rules.scopeDepth"></a><br>How specific a scope is: its depth in segments (`app.purchase` is 2), not its length in characters.
    - fn [specific](../../src/rules.ts#L1133) (rules: EvaluatedRules, from: string, to: string, within: (id: string, scope: string) => boolean) → { kind: "allow" | "deny"; rule: Rule } | null <!-- internal -->
      <a id="check.rules.specific"></a><br>The rule that decides `from → to` in format 1: the one whose scopes are deepest in total (`deny app.purchase domain` and `allow app domain.store` both 3), a `deny` on a tie. Format 2 keeps every undominated rule and lets any undominated `deny` win (deny-overrides), so an…
      - calls [check.rules.decide](check.md#check.rules.decide), [check.rules.ruleHits](check.md#check.rules.ruleHits), [check.rules.byHit](check.md#check.rules.byHit)
    - type [EvaluatedRules](../../src/rules.ts#L1141) <!-- internal -->
      <a id="check.rules.EvaluatedRules"></a><br>The rules of a spec, sorted by kind and ready to evaluate.
    - fn [collectRules](../../src/rules.ts#L1163) (spec: SpecIR, kindOf: (id: string) => string | undefined) → EvaluatedRules <!-- internal -->
      <a id="check.rules.collectRules"></a><br>Sorts the compiled rules by kind, rejects member-level dependency rules (K005), and settles the layer orders.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.combineOrders](check.md#check.rules.combineOrders)
    - type [CombinedOrders](../../src/rules.ts#L1229) = { orders: LayerOrder[]; above: Map<string, Set<string>> } <!-- internal -->
      <a id="check.rules.CombinedOrders"></a>
    - fn [combineOrders](../../src/rules.ts#L1236) (chains: readonly LayerOrder[], diagnostics: Diagnostic[]) → CombinedOrders <!-- internal -->
      <a id="check.rules.combineOrders"></a><br>All `layers` lines as one partial order: `a < b` and `b < c` put `c` above `a`, while `a < b` and `c < d` say nothing about `a` and `d`. A line that contradicts the lines before it is K005 and left out.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.rules.transitive](check.md#check.rules.transitive)
    - fn [transitive](../../src/rules.ts#L1277) (direct: ReadonlyMap<string, ReadonlySet<string>>) → Map<string, Set<string>> <!-- internal -->
      <a id="check.rules.transitive"></a><br>Transitive closure of `direct`: each layer → every layer above it, by depth-first search.
    - fn [pointAt](../../src/rules.ts#L1299) (line: number, col: number) → Span <!-- internal -->
      <a id="check.rules.pointAt"></a><br>A one-column span at a code position (a rule finding has no source offset).
    - fn [base](../../src/rules.ts#L1304) (snapshot: SnapshotView, criterion: string, area: string, verdict: Verdict["verdict"], file: string, line: number, col: number, code: string | null, message: string, spec = criterion) → Verdict <!-- internal -->
      <a id="check.rules.base"></a><br>`spec` is the rule as written; its hash changes when the rule does.
      - calls [check.rules.hashText](check.md#check.rules.hashText)
    - fn [hashText](../../src/rules.ts#L1309) (text: string) → string <!-- internal -->
      <a id="check.rules.hashText"></a><br>Hex SHA-256 of a rule's canonical text: the verdict's specHash.
  - module [scc](../../src/scc.ts#L1)
    <a id="check.scc"></a><br>Strongly connected components of a directed module graph. A component is cyclic when it has two or more modules, or a self-loop.
    - fn [stronglyConnected](../../src/scc.ts#L10) (adj: ReadonlyMap<string, ReadonlySet<string>>) → string[][]
      <a id="check.scc.stronglyConnected"></a><br>The cyclic components of `adj` (two or more nodes, or one node with a self-loop), each sorted.
      - calls [check.scc.components](check.md#check.scc.components)
    - fn [components](../../src/scc.ts#L15) (adj: ReadonlyMap<string, ReadonlySet<string>>) → string[][]
      <a id="check.scc.components"></a><br>Every strongly connected component, each after all components it reaches (Tarjan's order).
    - fn [cycleThrough](../../src/scc.ts#L92) (adj: ReadonlyMap<string, ReadonlySet<string>>, members: ReadonlySet<string>, start: string) → string[]
      <a id="check.scc.cycleThrough"></a><br>One cycle inside `members` that passes through `start`.
  - module [system-catalog](../../src/system-catalog.ts#L1)
    <a id="check.system-catalog"></a><br>Technologies a `# system` names (system-design §4): the component kind each one is and the packages that talk to it, in every ecosystem keylang reads (npm names, Python and Rust import names, Composer names). `check` takes a driver import as the evidence of a relation, and…
    - external-ids [base.external-ids](base.md#base.external-ids)
    - parser [lang.parser](lang.md#lang.parser)
    - type [Technology](../../src/system-catalog.ts#L14)
      <a id="check.system-catalog.Technology"></a><br>One catalog entry: a technology, the component kind it is and its driver packages.
    - fn [technologyOf](../../src/system-catalog.ts#L85) (text: string | null | undefined) → Technology | null
      <a id="check.system-catalog.technologyOf"></a><br>The technology a component's text starts with (`postgres 16`, `PostgreSQL`), or null when it names none of the catalog.
    - fn [evidenceIds](../../src/system-catalog.ts#L93) (tech: Technology) → Set<string>
      <a id="check.system-catalog.evidenceIds"></a><br>The external IDs whose import is evidence of talking to `tech`.
      - calls [base.external-ids.externalSegment](base.md#base.external-ids.externalSegment)
    - fn [technologiesOfPackage](../../src/system-catalog.ts#L101) (externalId: string) → Technology[]
      <a id="check.system-catalog.technologiesOfPackage"></a><br>What a package's external ID means (`external.ioredis` → redis): the technologies whose own drivers include it.
      - calls [base.external-ids.externalSegment](base.md#base.external-ids.externalSegment)
    - fn [isSqlClient](../../src/system-catalog.ts#L106) (externalId: string) → boolean
      <a id="check.system-catalog.isSqlClient"></a><br>A generic SQL client or ORM (`@prisma/client`, `typeorm`): evidence of some SQL database, not of which.
      - calls [base.external-ids.externalSegment](base.md#base.external-ids.externalSegment)
  - module [system](../../src/system.ts#L1)
    <a id="check.system"></a><br>`# system <name>` (system-design/02): the sections compiled into a `SystemSpec` — components with their zones, relations, tables, sequences and interview notes — and what `check` says of them. Names are local to a system: an unknown component is K401, an `fk` to an unknown…
    - node [external.node](external.md#external.node)
    - diag [base.diag](base.md#base.diag)
    - external-ids [base.external-ids](base.md#base.external-ids)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - resolve [check.resolve](check.md#check.resolve)
    - span [base.span](base.md#base.span)
    - system-catalog [check.system-catalog](check.md#check.system-catalog)
    - verdict [check.verdict](check.md#check.verdict)
    - type [SystemZone](../../src/system.ts#L29)
      <a id="check.system.SystemZone"></a><br>A `zone` of a system: a named grouping of components, possibly nested.
    - type [SystemColumn](../../src/system.ts#L38)
      <a id="check.system.SystemColumn"></a><br>A column of a table, with its flags and an optional foreign key `fk <table>.<column>`.
    - type [SystemTable](../../src/system.ts#L49)
      <a id="check.system.SystemTable"></a><br>A table of a data store, with its columns and index lines.
    - type [SystemComponent](../../src/system.ts#L60)
      <a id="check.system.SystemComponent"></a><br>A component of a system: a service, store, queue… with its zone, code binding and tables.
    - type [RelationVerb](../../src/system.ts#L77)
      <a id="check.system.RelationVerb"></a><br>The verbs a relation line may start with.
    - type [SystemRelation](../../src/system.ts#L80)
      <a id="check.system.SystemRelation"></a><br>A relation `- <verb> <target> [caption]` under a component.
    - type [SystemMessage](../../src/system.ts#L92)
      <a id="check.system.SystemMessage"></a><br>One message of a sequence: `from → to text`, or `⇢` for an asynchronous one.
    - type [SystemSequence](../../src/system.ts#L101)
      <a id="check.system.SystemSequence"></a><br>A named sequence of messages between components.
    - type [NoteKind](../../src/system.ts#L108) = "requirement" | "nfr" | "estimate" | "tradeoff" | "question"
      <a id="check.system.NoteKind"></a><br>Kinds of interview notes a system section may hold.
    - type [SystemSpec](../../src/system.ts#L111)
      <a id="check.system.SystemSpec"></a><br>One compiled `# system` section (or the system discovered from code, whose `file` is "").
    - type [SystemsOf](../../src/system.ts#L122) = { systems: SystemSpec[]; diagnostics: Diagnostic[] } <!-- internal -->
      <a id="check.system.SystemsOf"></a>
    - fn [systemsOf](../../src/system.ts#L125) (docs: readonly Document[]) → SystemsOf
      <a id="check.system.systemsOf"></a><br>Every `# system` section of the documents in file and line order, and the diagnostics of their names (K002, K401, K402).
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.system.compileSystem](check.md#check.system.compileSystem), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [compileSystem](../../src/system.ts#L150) (file: string, name: string, line: number, nodes: readonly Node[], diagnostics: Diagnostic[]) → SystemSpec <!-- internal -->
      <a id="check.system.compileSystem"></a><br>One section into a `SystemSpec`; reports K002 for repeated names, K401 for unknown components and K402 for bad `fk`s.
      - calls [lang.parser.isComponentKind](lang.md#lang.parser.isComponentKind), [lang.parser.isRelationVerb](lang.md#lang.parser.isRelationVerb), [check.system.compileTable](check.md#check.system.compileTable), [check.resolve.nearestName](check.md#check.resolve.nearestName), [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.system.checkForeignKeys](check.md#check.system.checkForeignKeys)
    - fn [compileTable](../../src/system.ts#L233) (file: string, component: string, node: Node, diagnostics: Diagnostic[]) → SystemTable <!-- internal -->
      <a id="check.system.compileTable"></a><br>A `table` item into a `SystemTable`: `index` lines and `- <column> <type> [pk] [unique] [null] [fk t.c]` columns.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - fn [checkForeignKeys](../../src/system.ts#L270) (file: string, system: SystemSpec, diagnostics: Diagnostic[]) → void <!-- internal -->
      <a id="check.system.checkForeignKeys"></a><br>K402: an `fk` names a table of no data store of the system, or a column that table does not have.
      - calls [check.resolve.nearestName](check.md#check.resolve.nearestName), [base.diag.diagnostic](base.md#base.diag.diagnostic)
    - type [SystemSnapshot](../../src/system.ts#L294)
      <a id="check.system.SystemSnapshot"></a><br>What the system check reads of a snapshot.
    - type [ModuleGraph](../../src/system.ts#L301)
      <a id="check.system.ModuleGraph"></a><br>The repository's modules and their dependencies, module to module, and the packages each imports.
    - fn [moduleOf](../../src/system.ts#L308) (nodes: SystemSnapshot["nodes"], id: string) → string | null <!-- internal -->
      <a id="check.system.moduleOf"></a><br>The module an ID lies in: itself or the nearest module above it, never a package; null for none.
    - fn [moduleGraph](../../src/system.ts#L320) (snapshot: SystemSnapshot) → ModuleGraph
      <a id="check.system.moduleGraph"></a><br>Lifts the snapshot's edges (imports, calls, types) to module → module edges and module → package imports.
      - calls [check.system.moduleOf](check.md#check.system.moduleOf), [base.external-ids.externalPackageId](base.md#base.external-ids.externalPackageId)
    - fn [modulesUnder](../../src/system.ts#L355) (graph: ModuleGraph, ids: readonly string[]) → string[]
      <a id="check.system.modulesUnder"></a><br>The modules of the repository the IDs name: each module equal to or under one of them.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [reach](../../src/system.ts#L363) (graph: ModuleGraph, start: readonly string[], hit: (module: string) => boolean) → string[] | null
      <a id="check.system.reach"></a><br>The first module reached from `start` through imports for which `hit` holds, with the path to it (start first); breadth first, so the path is a shortest.
      - calls [base.span.compareText](base.md#base.span.compareText)
    - fn [pathText](../../src/system.ts#L396) (path: readonly string[]) → string <!-- internal -->
      <a id="check.system.pathText"></a><br>A path for a message: in full up to three modules, else its ends and its length.
    - type [SystemCheck](../../src/system.ts#L400) <!-- internal -->
      <a id="check.system.SystemCheck"></a>
    - fn [systemCheck](../../src/system.ts#L403) (docs: readonly Document[], snapshot: SystemSnapshot | null) → SystemCheck
      <a id="check.system.systemCheck"></a><br>`check` of every `# system`: K002/K401/K402 of the names, the `system` verdicts of relations from bound code, K403.
      - calls [check.system.systemsOf](check.md#check.system.systemsOf), [check.system.moduleGraph](check.md#check.system.moduleGraph), [check.system.judge](check.md#check.system.judge), [check.system.undeclaredStores](check.md#check.system.undeclaredStores)
    - fn [judge](../../src/system.ts#L447) (graph: ModuleGraph, from: SystemComponent, to: SystemComponent) → { verdict: VerdictKind; reason: string } | null <!-- internal -->
      <a id="check.system.judge"></a><br>The verdict of one relation: `ok` with the import path found, `unverified` without one, null when the target names no known technology.
      - calls [check.system.modulesUnder](check.md#check.system.modulesUnder), [check.system.reach](check.md#check.system.reach), [check.system.pathText](check.md#check.system.pathText), [check.system-catalog.technologyOf](check.md#check.system-catalog.technologyOf), [check.system-catalog.evidenceIds](check.md#check.system-catalog.evidenceIds), [base.span.compareText](base.md#base.span.compareText)
    - fn [undeclaredStores](../../src/system.ts#L474) (system: SystemSpec, component: SystemComponent, graph: ModuleGraph, diagnostics: Diagnostic[]) → void <!-- internal -->
      <a id="check.system.undeclaredStores"></a><br>K403: the code of a component reaches a driver of exactly one technology, and no relation of the component goes to a component of it.
      - calls [check.system.modulesUnder](check.md#check.system.modulesUnder), [check.system-catalog.technologyOf](check.md#check.system-catalog.technologyOf), [base.span.compareText](base.md#base.span.compareText), [check.system-catalog.technologiesOfPackage](check.md#check.system-catalog.technologiesOfPackage), [base.diag.diagnostic](base.md#base.diag.diagnostic)
  - module [test-report](../../src/test-report.ts#L1)
    <a id="check.test-report"></a><br>Test-runner reports as evidence for `test <file> "<name>"` in a flow. A report proves the current code only when it names the snapshot it ran against; a third-party report without that link stays unverified.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - json [base.json](base.md#base.json)
    - type [TestStatus](../../src/test-report.ts#L15) = "pass" | "fail" | "skip"
      <a id="check.test-report.TestStatus"></a><br>A test's outcome; a skip proves nothing.
    - type [TestCase](../../src/test-report.ts#L18)
      <a id="check.test-report.TestCase"></a><br>One test result from a report, with the snapshot it ran against.
    - type [JsonReport](../../src/test-report.ts#L33)
      <a id="check.test-report.JsonReport"></a><br>keylang JSON report, schema 1 (written by the `node:test` reporter).
    - fn [loadReports](../../src/test-report.ts#L44) (root: string, files: readonly string[]) → TestCase[]
      <a id="check.test-report.loadReports"></a><br>Read report files (JSON or JUnit XML). Malformed input is an error naming the file.
      - calls [check.test-report.parseJunit](check.md#check.test-report.parseJunit), [check.test-report.parseJsonReport](check.md#check.test-report.parseJsonReport)
    - fn [parseJsonReport](../../src/test-report.ts#L55) (file: string, text: string) → TestCase[]
      <a id="check.test-report.parseJsonReport"></a><br>The cases of a keylang JSON report; every malformed field is an error naming the file and the field.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [check.test-report.optionalString](check.md#check.test-report.optionalString), [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [optionalString](../../src/test-report.ts#L98) (value: JsonValue | undefined, field: string) → string | null <!-- internal -->
      <a id="check.test-report.optionalString"></a><br>A field that may be missing or null (no value) or a string; any other type is an error naming it.
      - calls [base.json.isJsonString](base.md#base.json.isJsonString)
    - fn [repositoryPath](../../src/test-report.ts#L111) (path: string, root: string) → string <!-- internal -->
      <a id="check.test-report.repositoryPath"></a><br>`path` of a JUnit `file` attribute as a flow's `test` writes it: relative to the repository root, with `/`. An absolute path under the root (PHPUnit, jest-junit) loses the root; any other path stays as it is.
      - calls [check.test-report.realRoot](check.md#check.test-report.realRoot), [base.config.toPosix](base.md#base.config.toPosix)
    - fn [realRoot](../../src/test-report.ts#L125) (root: string) → string <!-- internal -->
      <a id="check.test-report.realRoot"></a><br>The root with links resolved, or as given when it cannot be resolved.
    - fn [parseJunit](../../src/test-report.ts#L140) (file: string, text: string, repository: string) → TestCase[]
      <a id="check.test-report.parseJunit"></a><br>JUnit XML: `<testcase classname file name>` with `<failure>`, `<error>` or `<skipped>`, in `<testsuite>`s that may nest under `<testsuites>`. The snapshot comes from `<property name="keylang.snapshotId">` of the testcase or of the nearest suite around it: each suite of a merged…
      - calls [check.test-report.parseXml](check.md#check.test-report.parseXml), [check.test-report.repositoryPath](check.md#check.test-report.repositoryPath)
    - type [XmlElement](../../src/test-report.ts#L186) <!-- internal -->
      <a id="check.test-report.XmlElement"></a><br>In-memory shape of a parsed XML node used by the test-report reader: tag name, attribute map, nested children, the element's direct character data, and the source line where it appeared. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [parseXml](../../src/test-report.ts#L200) (file: string, text: string) → XmlElement <!-- internal -->
      <a id="check.test-report.parseXml"></a><br>The element tree of an XML document: tags, attributes in either quote, the predefined and numeric entities, comments, CDATA, processing instructions and a DOCTYPE. Enough to read a report; not a validating parser.
      - calls [check.test-report.decodeEntities](check.md#check.test-report.decodeEntities)
    - fn [decodeEntities](../../src/test-report.ts#L328) (text: string) → string <!-- internal -->
      <a id="check.test-report.decodeEntities"></a><br>Text with XML's five named entities and decimal or hex character references decoded; anything else stays as written.
    - type [TestEvidence](../../src/test-report.ts#L339)
      <a id="check.test-report.TestEvidence"></a><br>The verdict for one `test` line of a flow, with the reason shown to the user.
    - fn [matchTest](../../src/test-report.ts#L350) (cases: readonly TestCase[], file: string, name: string, snapshotId: string | null) → TestEvidence
      <a id="check.test-report.matchTest"></a><br>Match `test <file> "<name>"`. The name may carry suites as `Suite > name`.
  - module [trace-evidence](../../src/trace-evidence.ts#L1)
    <a id="check.trace-evidence"></a><br>Trace evidence: JSONL spans from instrumented `@flow` tests (schema 1). Steps match as a nested subsequence inside one test: extra calls are fine, one span satisfies one step, order comes from start/end on one clock or from `links`, never from sorting timestamps.
    - node [external.node](external.md#external.node)
    - json [base.json](base.md#base.json)
    - type [Mark](../../src/trace-evidence.ts#L22) <!-- internal -->
      <a id="check.trace-evidence.Mark"></a><br>A point on one clock: `seq` orders events of that clock; `ts` is wall time, not used for order.
    - type [TraceSpan](../../src/trace-evidence.ts#L29)
      <a id="check.trace-evidence.TraceSpan"></a><br>One call of an instrumented symbol: its start, its end (null while open) and its parent span.
    - type [TraceRun](../../src/trace-evidence.ts#L39)
      <a id="check.trace-evidence.TraceRun"></a><br>All events of one `(runId, testId, flow)` across the trace files, validated and assembled.
    - type [RunDraft](../../src/trace-evidence.ts#L69) <!-- internal -->
      <a id="check.trace-evidence.RunDraft"></a><br>A run as it is read. Spans are keyed by id, so a start and the end that closes it are found without a scan; an end whose start is in a file not read yet waits for the last file. `run` events accumulate until every file is read.
    - fn [loadTraces](../../src/trace-evidence.ts#L96) (root: string, files: readonly string[]) → TraceRun[]
      <a id="check.trace-evidence.loadTraces"></a><br>Read and validate trace files. A malformed line is an error naming file and line.
      - calls [check.trace-evidence.eachLine](check.md#check.trace-evidence.eachLine), [check.trace-evidence.readEvent](check.md#check.trace-evidence.readEvent), [check.trace-evidence.finishRun](check.md#check.trace-evidence.finishRun)
    - fn [eachLine](../../src/trace-evidence.ts#L112) (path: string, visit: (text: string, line: number) => void) → void <!-- internal -->
      <a id="check.trace-evidence.eachLine"></a><br>Each line of a file (1-based), read in chunks: a trace of millions of events may not fit in one string.
    - fn [readEvent](../../src/trace-evidence.ts#L138) (runs: Map<string, RunDraft>, file: string, line: number, text: string) → void <!-- internal -->
      <a id="check.trace-evidence.readEvent"></a><br>Validates one JSONL event and folds it into its run; every error names `file:line` and the field.
      - calls [base.json.parseJson](base.md#base.json.parseJson), [base.json.isJsonObject](base.md#base.json.isJsonObject), [base.json.isJsonString](base.md#base.json.isJsonString), [base.json.isJsonBoolean](base.md#base.json.isJsonBoolean), [base.json.isJsonNumber](base.md#base.json.isJsonNumber)
    - fn [finishRun](../../src/trace-evidence.ts#L259) (draft: RunDraft) → TraceRun <!-- internal -->
      <a id="check.trace-evidence.finishRun"></a><br>The run once every file is read: each end closes its start, wherever the two were.
    - type [ShapeNode](../../src/trace-evidence.ts#L301)
      <a id="check.trace-evidence.ShapeNode"></a><br>A flow as trace matching sees it. `key` identifies the spec node across runs. A `parallel` group's steps are matched under the group's parent in any order, each after the sibling before the group; the sibling after the group starts after every step of it.
    - type [TraceEvidence](../../src/trace-evidence.ts#L307)
      <a id="check.trace-evidence.TraceEvidence"></a><br>The trace verdict of one flow node, with the run and test it came from.
    - type [Outcome](../../src/trace-evidence.ts#L314) = TraceEvidence <!-- internal -->
      <a id="check.trace-evidence.Outcome"></a><br>A local type alias that names the result of a trace-evidence check as the same shape as `TraceEvidence`, so the check's output type reads as an outcome without adding any new fields or behavior. _(llm · claude:claude-fable-5-1 · 2026-10-04)_
    - fn [traceFlow](../../src/trace-evidence.ts#L322) (runs: readonly TraceRun[], flow: string, trigger: { key: number; id: string } | null, shape: readonly ShapeNode[], snapshotId: string | null) → Map<number, TraceEvidence>
      <a id="check.trace-evidence.traceFlow"></a><br>Trace verdicts for every step and `when` of one flow, keyed by `ShapeNode.key`. The trigger (if any) must be observed; its steps are matched inside it.
      - calls [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.match](check.md#check.trace-evidence.Matcher.match), [check.trace-evidence.Matcher](check.md#check.trace-evidence.Matcher)
    - fn [keysOf](../../src/trace-evidence.ts#L382) (nodes: readonly ShapeNode[]) → number[] <!-- internal -->
      <a id="check.trace-evidence.keysOf"></a><br>Every node key of a shape, pre-order.
    - module [OverBudget](../../src/trace-evidence.ts#L390) <!-- internal -->
      <a id="check.trace-evidence.OverBudget"></a><br>Thrown to abandon a search that has used up `MATCH_BUDGET`.
    - type [Assignment](../../src/trace-evidence.ts#L393) <!-- internal -->
      <a id="check.trace-evidence.Assignment"></a><br>Spans assigned to flow nodes: an outcome per node and the spans it took.
    - fn [assignment](../../src/trace-evidence.ts#L403) (outcomes: [number, Outcome][], spans: string[] = []) → Assignment <!-- internal -->
      <a id="check.trace-evidence.assignment"></a><br>An assignment with its ok/fail counts computed from the outcomes.
    - fn [combine](../../src/trace-evidence.ts#L408) (...parts: Assignment[]) → Assignment <!-- internal -->
      <a id="check.trace-evidence.combine"></a><br>Assignments of disjoint parts of the flow, joined.
    - fn [better](../../src/trace-evidence.ts#L413) (a: Assignment, b: Assignment) → boolean <!-- internal -->
      <a id="check.trace-evidence.better"></a><br>More steps observed wins, then fewer failures; an earlier candidate keeps a tie.
    - type [RunIdentity](../../src/trace-evidence.ts#L418) = { runId: string; testId: string } <!-- internal -->
      <a id="check.trace-evidence.RunIdentity"></a><br>The run and the test a verdict is about.
    - module [Matcher](../../src/trace-evidence.ts#L426) <!-- internal -->
      <a id="check.trace-evidence.Matcher"></a><br>Matches one run against a flow. A test may call the trigger or a step more than once (an early `return` first, the real call later), so every span of a symbol is a candidate: the search keeps the assignment with the most observed steps, and a step fails only when no assignment…
      - fn [constructor](../../src/trace-evidence.ts#L440) (run: TraceRun)
        <a id="check.trace-evidence.Matcher.constructor"></a><br>Stores the given trace run and indexes every span by its own ID and under its parent's ID, so later lookups can find a span directly or list the children of any span. _(llm · claude:claude-fable-5-1 · 2026-10-04 · stale)_
      - fn [match](../../src/trace-evidence.ts#L453) (nodes: readonly ShapeNode[], trigger: boolean) → [number, Outcome][]
        <a id="check.trace-evidence.Matcher.match"></a><br>Outcomes for `nodes` (the trigger with the steps inside it when `trigger`).
        - calls [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.Matcher.incompleteness](check.md#check.trace-evidence.Matcher.incompleteness)
      - fn [base](../../src/trace-evidence.ts#L474) () → RunIdentity <!-- internal -->
        <a id="check.trace-evidence.Matcher.base"></a><br>The run and test fields every outcome of this run carries.
      - fn [descendants](../../src/trace-evidence.ts#L479) (parent: TraceSpan | null) → TraceSpan[] <!-- internal -->
        <a id="check.trace-evidence.Matcher.descendants"></a><br>Spans under `parent` (all spans for null), depth-first in start order.
      - fn [candidates](../../src/trace-evidence.ts#L505) (parent: TraceSpan | null, id: string) → TraceSpan[] <!-- internal -->
        <a id="check.trace-evidence.Matcher.candidates"></a><br>Spans of symbol `id` under `parent` that the assignment being built has not taken yet.
        - calls [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants)
      - fn [incompleteness](../../src/trace-evidence.ts#L510) () → string | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.incompleteness"></a><br>Why the run cannot confirm or refute what it shows, or null for a finished run.
      - fn [absenceDoubt](../../src/trace-evidence.ts#L525) (id: string) → string | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.absenceDoubt"></a><br>Why an unobserved step is not a proven absence, or null when it is.
        - calls [check.trace-evidence.Matcher.incompleteness](check.md#check.trace-evidence.Matcher.incompleteness)
      - fn [bound](../../src/trace-evidence.ts#L542) (parent: TraceSpan | null, node: ShapeNode) → number <!-- internal -->
        <a id="check.trace-evidence.Matcher.bound"></a><br>The most steps of `node` and below that any assignment under `parent` could observe.
        - calls [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants)
      - fn [symbolsFrom](../../src/trace-evidence.ts#L565) (nodes: readonly ShapeNode[], i: number) → Set<string> <!-- internal -->
        <a id="check.trace-evidence.Matcher.symbolsFrom"></a><br>Symbols of `nodes[i..]` and everything under them.
      - fn [list](../../src/trace-evidence.ts#L596) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, previous: readonly TraceSpan[], trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.list"></a><br>The best assignment for `nodes[i..]` under `parent`, the sibling before them matched to `previous` (every step of it for a `parallel` group). Memoized: the answer depends on the spans taken so far only through those it could take itself, so the search stays polynomial in the…
        - calls [check.trace-evidence.Matcher.symbolsFrom](check.md#check.trace-evidence.Matcher.symbolsFrom), [check.trace-evidence.Matcher.descendants](check.md#check.trace-evidence.Matcher.descendants), [check.trace-evidence.Matcher.solve](check.md#check.trace-evidence.Matcher.solve)
      - fn [solve](../../src/trace-evidence.ts#L630) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, previous: readonly TraceSpan[], trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.solve"></a><br>`list` without the memo: branch on `when` and `parallel`, else try every span of the step.
        - calls [check.trace-evidence.Matcher.branch](check.md#check.trace-evidence.Matcher.branch), [check.trace-evidence.Matcher.group](check.md#check.trace-evidence.Matcher.group), [check.trace-evidence.Matcher.candidates](check.md#check.trace-evidence.Matcher.candidates), [check.trace-evidence.startsBefore](check.md#check.trace-evidence.startsBefore), [check.trace-evidence.Matcher.bound](check.md#check.trace-evidence.Matcher.bound), [check.trace-evidence.Matcher.take](check.md#check.trace-evidence.Matcher.take), [check.trace-evidence.Matcher.orderOutcome](check.md#check.trace-evidence.Matcher.orderOutcome), [check.trace-evidence.better](check.md#check.trace-evidence.better), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.Matcher.absenceDoubt](check.md#check.trace-evidence.Matcher.absenceDoubt), [check.trace-evidence.Matcher.outsideRoot](check.md#check.trace-evidence.Matcher.outsideRoot), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list)
      - fn [take](../../src/trace-evidence.ts#L682) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, span: TraceSpan, outcome: Outcome, trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.take"></a><br>`span` as `node`: its children are matched inside it, the siblings after it.
        - calls [check.trace-evidence.OverBudget](check.md#check.trace-evidence.OverBudget), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment)
      - fn [branch](../../src/trace-evidence.ts#L699) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, previous: readonly TraceSpan[], trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.branch"></a><br>A `when` is exercised in this test when its first step is observed; its steps are not ordered after the siblings before it.
        - calls [check.trace-evidence.Matcher.candidates](check.md#check.trace-evidence.Matcher.candidates), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment), [check.trace-evidence.keysOf](check.md#check.trace-evidence.keysOf), [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list)
      - fn [group](../../src/trace-evidence.ts#L727) (parent: TraceSpan | null, nodes: readonly ShapeNode[], i: number, node: ShapeNode, previous: readonly TraceSpan[], trigger: boolean) → Assignment <!-- internal -->
        <a id="check.trace-evidence.Matcher.group"></a><br>A `parallel` group: each step is matched under the group's parent after the sibling before the group, in any order with the others, overlap allowed. The sibling after the group is ordered after every step it observed.
        - calls [check.trace-evidence.Matcher.list](check.md#check.trace-evidence.Matcher.list), [check.trace-evidence.Matcher.alone](check.md#check.trace-evidence.Matcher.alone), [check.trace-evidence.combine](check.md#check.trace-evidence.combine), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.assignment](check.md#check.trace-evidence.assignment)
      - fn [alone](../../src/trace-evidence.ts#L758) (node: ShapeNode) → readonly ShapeNode[] <!-- internal -->
        <a id="check.trace-evidence.Matcher.alone"></a><br>`[node]`, the same array every time: `list` memoizes by the array.
      - fn [rootSpan](../../src/trace-evidence.ts#L770) (span: TraceSpan) → TraceSpan <!-- internal -->
        <a id="check.trace-evidence.Matcher.rootSpan"></a><br>Root of the `parentSpanId` chain. A span whose parent is missing is its own root.
      - fn [outsideRoot](../../src/trace-evidence.ts#L791) (parent: TraceSpan, id: string) → TraceSpan | null <!-- internal -->
        <a id="check.trace-evidence.Matcher.outsideRoot"></a><br>A span of `id` whose call tree is not the parent's, and which did not start before the parent image on the same clock. Spans that did start earlier, and spans in the parent's own tree, stay a confirmed absence.
        - calls [check.trace-evidence.Matcher.rootSpan](check.md#check.trace-evidence.Matcher.rootSpan), [check.trace-evidence.startsBefore](check.md#check.trace-evidence.startsBefore)
      - fn [nestedIn](../../src/trace-evidence.ts#L808) (span: TraceSpan, ancestor: TraceSpan) → boolean <!-- internal -->
        <a id="check.trace-evidence.Matcher.nestedIn"></a><br>`span`'s parent chain passes through `ancestor` (the image of the previous sibling).
      - fn [orderOutcome](../../src/trace-evidence.ts#L822) (parent: TraceSpan | null, span: TraceSpan, previous: readonly TraceSpan[]) → Outcome <!-- internal -->
        <a id="check.trace-evidence.Matcher.orderOutcome"></a><br>The order of `span` after every span of `previous`: the first that is not `ok`, else `ok`.
        - calls [check.trace-evidence.Matcher.orderAfter](check.md#check.trace-evidence.Matcher.orderAfter)
      - fn [orderAfter](../../src/trace-evidence.ts#L830) (parent: TraceSpan | null, span: TraceSpan, after: TraceSpan | null) → Outcome <!-- internal -->
        <a id="check.trace-evidence.Matcher.orderAfter"></a><br>Whether `span` provably runs after `after` (and inside `parent`): ordered by a link, or by sequence numbers on one clock.
        - calls [check.trace-evidence.Matcher.nestedIn](check.md#check.trace-evidence.Matcher.nestedIn), [check.trace-evidence.Matcher.base](check.md#check.trace-evidence.Matcher.base), [check.trace-evidence.sameClock](check.md#check.trace-evidence.sameClock)
    - fn [sameClock](../../src/trace-evidence.ts#L859) (a: Mark, b: Mark) → boolean <!-- internal -->
      <a id="check.trace-evidence.sameClock"></a><br>Two marks are comparable only on one clock.
    - fn [startsBefore](../../src/trace-evidence.ts#L864) (span: TraceSpan, other: TraceSpan) → boolean <!-- internal -->
      <a id="check.trace-evidence.startsBefore"></a><br>`span` provably starts before `other`: same clock, smaller sequence number.
      - calls [check.trace-evidence.sameClock](check.md#check.trace-evidence.sameClock)
  - module [verdict](../../src/verdict.ts#L1)
    <a id="check.verdict"></a><br>Verdicts: the outcome of checking one rule, flow or other specification criterion against the snapshot (the resolve/rules end of Markdown -> IR -> resolve/rules). `fail` is a known violation, `unverified` is missing evidence, `ok` is a covered pass. Entry points: the `Verdict`…
    - type [VerdictKind](../../src/verdict.ts#L8) = "ok" | "fail" | "unverified"
      <a id="check.verdict.VerdictKind"></a><br>The three outcomes a criterion can have; `unverified` is never folded into `ok`.
    - type [Verdict](../../src/verdict.ts#L11)
      <a id="check.verdict.Verdict"></a><br>One criterion's outcome, tied to the spec position that stated it and to the snapshot and spec it was judged on.
    - fn [formatVerdict](../../src/verdict.ts#L32) (v: Verdict) → string
      <a id="check.verdict.formatVerdict"></a><br>One verdict as a `file:line:col: tag message` line; the tag is the diagnostic code when there is one, else the verdict kind.
  - module [wiring](../../src/wiring.ts#L1)
    <a id="check.wiring"></a><br>`# wiring` (ADR 0003): each `wire <id>` is a factory, its children the named dependencies it is built from. The graph must be acyclic: its topological order is the order `keylang wire` initializes in.
    - diag [base.diag](base.md#base.diag)
    - languages [base.languages](base.md#base.languages)
    - config [base.config](base.md#base.config)
    - rules [check.rules](check.md#check.rules)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [WiringView](../../src/wiring.ts#L19)
      <a id="check.wiring.WiringView"></a><br>What the wiring checks read of the snapshot; `check` does not import `map`.
    - type [WireImport](../../src/wiring.ts#L32)
      <a id="check.wiring.WireImport"></a><br>How the generated file imports a factory: from its file, by its exported name (`default` for a default export). A static method is called on its imported class: `member` is its name as written.
    - type [WireOrder](../../src/wiring.ts#L39) = { order: string[] } | { cycle: string[] }
      <a id="check.wiring.WireOrder"></a><br>The build order of all wired IDs, or the first cycle as a closed path (its first ID repeated at the end).
    - fn [wireOrder](../../src/wiring.ts#L45) (wires: readonly Wire[]) → WireOrder
      <a id="check.wiring.wireOrder"></a><br>Dependencies before dependents, depth first in declaration order; an ID without its own `wire` is a leaf. The first cycle found otherwise.
    - fn [wireImport](../../src/wiring.ts#L93) (view: WiringView, id: string) → WireImport | { problem: string }
      <a id="check.wiring.wireImport"></a><br>The import the generated file needs for `id`, read from the exports table; a reason instead when no import can reach it: code of a language `wire` does not generate for, a method (static or not, the snapshot does not say), a name its module does not export.
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [check.wiring.exportedAs](check.md#check.wiring.exportedAs)
    - fn [exportedAs](../../src/wiring.ts#L123) (view: WiringView, id: string) → string | null <!-- internal -->
      <a id="check.wiring.exportedAs"></a><br>The name a symbol is imported by from its own module (`default` for a default export), or null when it is not exported.
    - fn [checkWiring](../../src/wiring.ts#L138) (spec: SpecIR, view: WiringView | null, kindOf: (id: string) => string | undefined = () => undefined, format: RuleFormat = 1) → Diagnostic[]
      <a id="check.wiring.checkWiring"></a><br>K301 for a cycle; K302 for a factory that is not a fn or class, a decorator that is not a fn, or one the generated file cannot import; K002 for a dependency name given twice; K102 for a dependency `deny` forbids.
      - calls [base.diag.diagnostic](base.md#base.diag.diagnostic), [check.wiring.wireOrder](check.md#check.wiring.wireOrder), [check.wiring.useProblem](check.md#check.wiring.useProblem), [check.rules.denyingRule](check.md#check.rules.denyingRule)
    - fn [useProblem](../../src/wiring.ts#L201) (view: WiringView, id: string, role: string) → string | null <!-- internal -->
      <a id="check.wiring.useProblem"></a><br>Why the generated file could not build or apply `id` in this role, or null; a missing ID is K001 from the resolver.
      - calls [check.wiring.wireImport](check.md#check.wiring.wireImport)
