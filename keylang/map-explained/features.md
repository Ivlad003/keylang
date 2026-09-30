<!-- keylang:generated — не редагувати, `keylang map` -->

[README](README.md) · modules: [agent-context](#features.agent-context) · [baseline](#features.baseline) · [changed](#features.changed) · [check-results](#features.check-results) · [draft-llm](#features.draft-llm) · [draft](#features.draft) · [explain-llm](#features.explain-llm) · [explain-node](#features.explain-node) · [explain](#features.explain) · [feature-status](#features.feature-status) · [ghost](#features.ghost) · [keys](#features.keys) · [llm](#features.llm) · [lsp-features](#features.lsp-features) · [node-search](#features.node-search) · [proposals](#features.proposals) · [spec-to-code](#features.spec-to-code) · [stats](#features.stats) · [voice-local](#features.voice-local) · [voice](#features.voice)

# map

- features
  <a id="features"></a>
  - module [agent-context](../../src/agent-context.ts#L1)
    <a id="features.agent-context"></a><br>What goes to the model (design §7.3 «Контекст»): the buffer, the nodes on the cursor line and their neighbours, the flows and rules naming them, their code and the tests of those flows — each item with a token estimate, so the person sees and trims what the agent reads. `@id`…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - type [ContextKind](../../src/agent-context.ts#L19)
      <a id="features.agent-context.ContextKind"></a>
    - type [ContextItem](../../src/agent-context.ts#L21)
      <a id="features.agent-context.ContextItem"></a>
    - type [ContextPack](../../src/agent-context.ts#L34)
      <a id="features.agent-context.ContextPack"></a>
    - type [ContextInput](../../src/agent-context.ts#L41)
      <a id="features.agent-context.ContextInput"></a>
    - fn [estimateTokens](../../src/agent-context.ts#L51) (text: string) → number
      <a id="features.agent-context.estimateTokens"></a><br>Roughly four characters a token: an estimate for the person, not a bill.
    - fn [contextForIds](../../src/agent-context.ts#L61) (analysis: Analysis, ids: readonly string[]) → ContextPack
      <a id="features.agent-context.contextForIds"></a><br>The bundle for a list of ids: each node and its neighbors, the flows and rules that name it, its code, and the e2e tests of those flows. A planned id that is not implemented is marked planned and incomplete.
      - calls [features.agent-context.addIdItems](features.md#features.agent-context.addIdItems), [features.agent-context.packOf](features.md#features.agent-context.packOf)
    - fn [contextPack](../../src/agent-context.ts#L73) (analysis: Analysis, input: ContextInput) → ContextPack
      <a id="features.agent-context.contextPack"></a>
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.agent-context.specDigest](features.md#features.agent-context.specDigest), [features.agent-context.estimateTokens](features.md#features.agent-context.estimateTokens), [features.agent-context.addIdItems](features.md#features.agent-context.addIdItems)
    - fn [packOf](../../src/agent-context.ts#L112) (items: ContextItem[], keySource: string) → ContextPack <!-- internal -->
      <a id="features.agent-context.packOf"></a>
    - fn [addIdItems](../../src/agent-context.ts#L117) (analysis: Analysis, ids: readonly string[], removed: ReadonlySet<string>, items: ContextItem[]) → void <!-- internal -->
      <a id="features.agent-context.addIdItems"></a><br>Nodes, neighbors, code, flows, rules and tests for `ids`. `add` is the TUI pack's adder; a fresh list is built when `items` is empty and `removed` is empty.
      - calls [features.agent-context.estimateTokens](features.md#features.agent-context.estimateTokens), [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.agent-context.snapshotSource](features.md#features.agent-context.snapshotSource), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.agent-context.sectionText](features.md#features.agent-context.sectionText)
    - fn [sectionText](../../src/agent-context.ts#L162) (doc: Document, section: Section) → string <!-- internal -->
      <a id="features.agent-context.sectionText"></a><br>A section as the analysis read it (an unsaved buffer included), in canonical form.
      - calls [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [specDigest](../../src/agent-context.ts#L167) (analysis: Analysis) → string <!-- internal -->
      <a id="features.agent-context.specDigest"></a><br>What every hand-written spec of the analysis says: part of the pack key, so a changed rule or flow elsewhere is a new pack.
      - calls [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [snapshotSource](../../src/agent-context.ts#L179) (analysis: Analysis, file: string) → string | null
      <a id="features.agent-context.snapshotSource"></a><br>The text of a source file when it still has the bytes the snapshot hashed; null otherwise.
    - fn [contextText](../../src/agent-context.ts#L188) (pack: ContextPack) → string
      <a id="features.agent-context.contextText"></a><br>The pack as the prompt text a model gets.
  - module [baseline](../../src/baseline.ts#L1)
    <a id="features.baseline"></a><br>`keylang/rules.baseline.md`: deny rules for the dependencies the current graph does not have, so a new edge between layers or a new package is K102. The grammar is the ordinary `deny` / `allow`.
    - node [external.node](external.md#external.node)
    - config [base.config](base.md#base.config)
    - map [map.map](map.md#map.map)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - span [base.span](base.md#base.span)
    - fn [baselineText](../../src/baseline.ts#L25) (snapshot: AnalysisSnapshot) → string
      <a id="features.baseline.baselineText"></a><br>Baseline rules for one snapshot. Layers come from `keylang.json`, in code-unit order; `unassigned` is a source only when a module is in it.
      - calls [features.baseline.externalModule](features.md#features.baseline.externalModule)
    - fn [externalModule](../../src/baseline.ts#L62) (snapshot: AnalysisSnapshot, id: string) → string | null <!-- internal -->
      <a id="features.baseline.externalModule"></a><br>The external module an id belongs to (`external.stripe` for a symbol under it).
    - fn [baselinePath](../../src/baseline.ts#L74) (config: Pick<Config, "dir">) → string
      <a id="features.baseline.baselinePath"></a><br>Where the baseline lives: `<dir>/rules.baseline.md`, relative to the root, POSIX.
    - type [BaselinePlan](../../src/baseline.ts#L82)
      <a id="features.baseline.BaselinePlan"></a><br>What `keylang baseline` would do, computed before anything is written. Internal to one operation — not a stored format.
    - fn [planBaseline](../../src/baseline.ts#L103) (config: Config, snapshot: AnalysisSnapshot) → BaselinePlan
      <a id="features.baseline.planBaseline"></a><br>Plans the baseline of `snapshot` against the file on disk. Reads, writes nothing.
      - calls [features.baseline.baselinePath](features.md#features.baseline.baselinePath), [features.baseline.baselineText](features.md#features.baseline.baselineText), [features.baseline.readOrNull](features.md#features.baseline.readOrNull), [base.safe-write.isGeneratedText](base.md#base.safe-write.isGeneratedText), [features.baseline.ruleLines](features.md#features.baseline.ruleLines), [map.map.sourceInputs](map.md#map.map.sourceInputs)
    - fn [baselinePlanProblems](../../src/baseline.ts#L128) (plan: BaselinePlan) → string[]
      <a id="features.baseline.baselinePlanProblems"></a><br>Why the plan may not be committed now (`path: reason` lines; empty when it may): the target must pass the repository's write rules and still hold the bytes the plan saw, and `keylang.json` and the sources must be the ones the baseline was computed from.
      - calls [base.safe-write.writeProblem](base.md#base.safe-write.writeProblem), [map.map.sourceInputProblems](map.md#map.map.sourceInputProblems)
    - fn [commitBaseline](../../src/baseline.ts#L137) (plan: BaselinePlan) → void
      <a id="features.baseline.commitBaseline"></a><br>Writes the planned text atomically at the target (a link inside the repository is followed; CRLF of the old file kept). Throws on an I/O error.
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [base.safe-write.writeAtomic](base.md#base.safe-write.writeAtomic)
    - fn [ruleLines](../../src/baseline.ts#L144) (text: string) → string[] <!-- internal -->
      <a id="features.baseline.ruleLines"></a><br>The `- deny` / `- allow` lines of a rules text, in order.
    - fn [readOrNull](../../src/baseline.ts#L148) (abs: string) → string | null <!-- internal -->
      <a id="features.baseline.readOrNull"></a>
  - module [changed](../../src/changed.ts#L1)
    <a id="features.changed"></a><br>`check --changed` keeps the full analysis and drops findings that do not touch the changed files: a changed spec (every finding in that file), a rule whose scope contains a changed module, and a flow with a step whose code is in a changed file. `hook stop` maps the fails that…
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - type [ChangedInput](../../src/changed.ts#L13)
      <a id="features.changed.ChangedInput"></a>
    - type [HookFail](../../src/changed.ts#L21)
      <a id="features.changed.HookFail"></a>
    - type [RuleHit](../../src/changed.ts#L27) <!-- internal -->
      <a id="features.changed.RuleHit"></a>
    - fn [filterChanged](../../src/changed.ts#L41) (input: ChangedInput, changed: ReadonlySet<string>, deleted: readonly string[] = []) → { diagnostics: Diagnostic[]; verdicts: Verdict[] }
      <a id="features.changed.filterChanged"></a><br>Diagnostics and verdicts that touch `changed` (paths as check prints them). `deleted` are module ids whose file git removed: the node is gone, so a flow step that named it is still in the report. Order is preserved.
      - calls [features.changed.ruleHits](features.md#features.changed.ruleHits), [features.changed.covers](features.md#features.changed.covers), [features.changed.flowLinesTouching](features.md#features.changed.flowLinesTouching), [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [hookFails](../../src/changed.ts#L60) (report: { diagnostics: readonly Diagnostic[]; verdicts: readonly Verdict[] }) → HookFail[]
      <a id="features.changed.hookFails"></a><br>Error diagnostics, then fail verdicts that are not the same finding.
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding)
    - fn [hookDecision](../../src/changed.ts#L71) (event: { stop_hook_active?: boolean }, fails: readonly HookFail[]) → string
      <a id="features.changed.hookDecision"></a><br>Stdin event plus the fails of one changed check. `stop_hook_active` never blocks. The same inputs return the same JSON.
    - fn [parseHookEvent](../../src/changed.ts#L78) (text: string) → { stop_hook_active?: boolean }
      <a id="features.changed.parseHookEvent"></a><br>The object on stdin. Empty stdin is an event with no `stop_hook_active`.
    - fn [covers](../../src/changed.ts#L93) (scope: readonly string[], moduleId: string, layer: string) → boolean <!-- internal -->
      <a id="features.changed.covers"></a>
    - fn [ruleHits](../../src/changed.ts#L99) (spec: SpecIR) → RuleHit[] <!-- internal -->
      <a id="features.changed.ruleHits"></a><br>Scope and the verdict criterion `--changed` already matches. `no-cycles` stays the literal criterion, not the hashed `no-cycles <module|*>`.
    - fn [flowLinesTouching](../../src/changed.ts#L116) (input: ChangedInput, changed: ReadonlySet<string>, gone: (id: string) => boolean) → Set<string> <!-- internal -->
      <a id="features.changed.flowLinesTouching"></a><br>`file:line` of every verdict in a flow that names a symbol whose file changed or was deleted.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
  - module [check-results](../../src/check-results.ts#L1)
    <a id="features.check-results"></a><br>The results of `keylang check --format json`: diagnostics and verdicts in one list, a diagnostic joined with the verdict it explains. Shared by the CLI and the MCP server, so an agent sees exactly what CI sees.
    - node [external.node](external.md#external.node)
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - verdict [check.verdict](check.md#check.verdict)
    - type [Provenance](../../src/check-results.ts#L10) = NonNullable<Verdict["evidence"]>["provenance"] <!-- internal -->
      <a id="features.check-results.Provenance"></a>
    - type [CheckResult](../../src/check-results.ts#L12)
      <a id="features.check-results.CheckResult"></a>
    - fn [checkResults](../../src/check-results.ts#L34) (verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]) → CheckResult[]
      <a id="features.check-results.checkResults"></a><br>Diagnostics and verdicts as one list; a verdict that repeats a diagnostic lends it its criterion, hash, and provenance.
      - calls [check.assess.sameFinding](check.md#check.assess.sameFinding), [base.diag.isError](base.md#base.diag.isError)
  - module [draft-llm](../../src/draft-llm.ts#L1)
    <a id="features.draft-llm"></a><br>`draft flow --mode llm|hybrid` (design §5.1): the model proposes a flow from a compact map, the flow grammar and flows of this repository; an ID that is neither in the snapshot nor declared `planned` sends the draft back once with the nearest real IDs. The answer is reconciled…
    - analyze [map.analyze](map.md#map.analyze)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - draft [features.draft](features.md#features.draft)
    - fmt [lang.fmt](lang.md#lang.fmt)
    - ir [lang.ir](lang.md#lang.ir)
    - llm [features.llm](features.md#features.llm)
    - parser [lang.parser](lang.md#lang.parser)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - type [DraftStatus](../../src/draft-llm.ts#L20) = "agree" | "llm-only" | "algo-only" | "conflict"
      <a id="features.draft-llm.DraftStatus"></a>
    - type [ModelDraft](../../src/draft-llm.ts#L22)
      <a id="features.draft-llm.ModelDraft"></a>
    - fn [draftFlowWithModel](../../src/draft-llm.ts#L47) (analysis: Analysis, trigger: string, client: LlmClient, mode: "llm" | "hybrid", name?: string, context?: string) → Promise<ModelDraft>
      <a id="features.draft-llm.draftFlowWithModel"></a><br>`context`: the pack from the TUI context panel, sent as it is shown.
      - calls [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft-llm.compactMap](features.md#features.draft-llm.compactMap), [features.draft-llm.similarFlows](features.md#features.draft-llm.similarFlows), [features.draft-llm.flowText](features.md#features.draft-llm.flowText), [features.draft-llm.unknownIn](features.md#features.draft-llm.unknownIn), [features.draft-llm.reconcile](features.md#features.draft-llm.reconcile)
    - fn [reconcile](../../src/draft-llm.ts#L88) (analysis: Analysis, text: string, algo: { text: string; steps: readonly string[] }, trigger: string, mode: "llm" | "hybrid", agent: string) → { text: string; counts: Record<DraftStatus, number>; dropped: string[] } <!-- internal -->
      <a id="features.draft-llm.reconcile"></a><br>The model's flow judged on its IR. An item with a parse error other than indentation (a step under an `invariant`, an unknown keyword) is dropped; the requested trigger is added when the answer lacks it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.draft-llm.reachability](features.md#features.draft-llm.reachability), [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [features.draft-llm.algoItem](features.md#features.draft-llm.algoItem), [features.draft-llm.algoCallers](features.md#features.draft-llm.algoCallers), [lang.fmt.formatDocument](lang.md#lang.fmt.formatDocument)
    - fn [algoItem](../../src/draft-llm.ts#L148) (kind: "trigger" | "step", id: string) → Node <!-- internal -->
      <a id="features.draft-llm.algoItem"></a><br>One provenance-marked item of the algo projection, as the parser reads it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [algoCallers](../../src/draft-llm.ts#L154) (text: string) → [string, string[]][] <!-- internal -->
      <a id="features.draft-llm.algoCallers"></a><br>Each step of the algo draft (preorder) with its callers there, nearest first.
      - calls [lang.spec-ir.compileSpec](lang.md#lang.spec-ir.compileSpec), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [reachability](../../src/draft-llm.ts#L168) (nodes: NonNullable<Analysis["snapshot"]>["nodes"]) → (from: string, to: string) => boolean <!-- internal -->
      <a id="features.draft-llm.reachability"></a><br>Whether `from` reaches `to` through resolved calls of the snapshot, as a static step proof would.
    - fn [flowText](../../src/draft-llm.ts#L192) (answer: string, name: string) → string <!-- internal -->
      <a id="features.draft-llm.flowText"></a><br>The flow section of an answer: the first fenced block (or the whole answer), under the requested heading. An ID written as code in an item (`` - step `a.b` ``, which the prompt's own examples invite) is the ID.
      - calls [lang.parser.isId](lang.md#lang.parser.isId)
    - fn [unknownIn](../../src/draft-llm.ts#L205) (analysis: Analysis, text: string) → string[] <!-- internal -->
      <a id="features.draft-llm.unknownIn"></a><br>Referenced IDs that are neither snapshot nodes nor `planned` in the draft or the specs.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [compactMap](../../src/draft-llm.ts#L223) (analysis: Analysis, steps: readonly string[]) → string <!-- internal -->
      <a id="features.draft-llm.compactMap"></a><br>The fns the draft can reach, then the rest of their modules; at most 300 lines, which the prompt says.
    - fn [similarFlows](../../src/draft-llm.ts#L233) (docs: readonly Document[], steps: readonly string[]) → string[] <!-- internal -->
      <a id="features.draft-llm.similarFlows"></a><br>Up to three hand-written flows, those sharing most IDs with the draft first.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [features.draft-llm.lineTree](features.md#features.draft-llm.lineTree)
    - fn [lineTree](../../src/draft-llm.ts#L253) (node: { tokens: { text: string }[]; children: unknown[] }, level: number) → string[] <!-- internal -->
      <a id="features.draft-llm.lineTree"></a>
    - type [RulesDraft](../../src/draft-llm.ts#L259)
      <a id="features.draft-llm.RulesDraft"></a>
    - fn [draftRulesWithModel](../../src/draft-llm.ts#L273) (analysis: Analysis, client: LlmClient, mode: "llm" | "hybrid", algoText: string, target: string) → Promise<RulesDraft>
      <a id="features.draft-llm.draftRulesWithModel"></a><br>`draft rules --mode llm|hybrid`: the model proposes rules from the layer dependencies; each is checked at once against the current snapshot, alone, as `check` would: `agree` when it holds, `conflict` when the code breaks it (with the edge), `llm-only` when the evidence is not…
      - calls [features.draft-llm.judgeRule](features.md#features.draft-llm.judgeRule)
    - fn [judgeRule](../../src/draft-llm.ts#L317) (analysis: Analysis, others: readonly Document[], target: string, rule: string, conflicts: string[]) → DraftStatus <!-- internal -->
      <a id="features.draft-llm.judgeRule"></a><br>One rule, checked alone against the snapshot: what it adds to a check without it.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [base.config.resolveStatic](base.md#base.config.resolveStatic), [check.assess.assess](check.md#check.assess.assess)
    - fn [draftLayoutWithModel](../../src/draft-llm.ts#L351) (analysis: Analysis, client: LlmClient, files: readonly string[]) → Promise<Record<string, string[]>>
      <a id="features.draft-llm.draftLayoutWithModel"></a><br>`draft map --mode llm|hybrid`: the model proposes layers (name → globs), validated as `keylang.json` would be. Only printed: layers are never assigned without a person (design §5.1 p.4).
      - calls [base.config.parseConfig](base.md#base.config.parseConfig)
  - module [draft](../../src/draft.ts#L1)
    <a id="features.draft"></a><br>`keylang draft flow <trigger> --mode algo`: the deterministic projection of a flow from the snapshot's call edges (design §5, §5.3). Each resolved call to a function of the repository becomes a nested `step`, in the order the code writes them; a function already listed is not…
    - ir [lang.ir](lang.md#lang.ir)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - snapshot [map.snapshot](map.md#map.snapshot)
    - type [FlowDraft](../../src/draft.ts#L13)
      <a id="features.draft.FlowDraft"></a>
    - fn [draftFlow](../../src/draft.ts#L21) (snapshot: AnalysisSnapshot, trigger: string, options: { name?: string; depth?: number } = {}) → FlowDraft
      <a id="features.draft.draftFlow"></a>
    - fn [withFlow](../../src/draft.ts#L59) (existing: string | null, draft: Pick<FlowDraft, "name" | "text">) → string
      <a id="features.draft.withFlow"></a><br>A spec with the draft added: the section of the same flow is replaced, whatever follows the name on its heading line, otherwise the draft is appended. Sections come from the parser, so a `# ` line in a code block is not a heading.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.draft.nextHeading](features.md#features.draft.nextHeading), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [withRules](../../src/draft.ts#L83) (existing: string | null, draftText: string) → string
      <a id="features.draft.withRules"></a><br>`draft rules` into an existing spec: the drafted rules go at the end of its last `# rules` section, or into a new `# rules` section at the end, never under a trailing `# flow`. A rule the file already has (comments aside) is not repeated.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.parser.renderMeaning](lang.md#lang.parser.renderMeaning), [features.draft.nextHeading](features.md#features.draft.nextHeading), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf)
    - fn [nextHeading](../../src/draft.ts#L113) (sections: readonly { heading: { span: { start: { line: number } } } | null }[], index: number) → number | null <!-- internal -->
      <a id="features.draft.nextHeading"></a><br>0-based line index of the heading after `sections[index]`, or null at the end of the file.
    - fn [distinctNames](../../src/draft.ts#L123) (drafts: readonly FlowDraft[]) → FlowDraft[]
      <a id="features.draft.distinctNames"></a><br>Flow names that keep drafts apart in one spec: two `save` triggers (`A.save`, `B.save`) become `A-save` and `B-save`, taking as many trailing ID segments as it needs.
    - fn [draftRules](../../src/draft.ts#L153) (snapshot: AnalysisSnapshot, cyclic: boolean) → string
      <a id="features.draft.draftRules"></a><br>`draft rules --mode algo`: rules the current code already keeps, so each passes `check` as written. Layers in an order where every observed dependency points down (`a < b`: `b` may use `a`), when the layers form no cycle; otherwise a `deny` for each pair used in one direction…
      - calls [features.draft.layerOrder](features.md#features.draft.layerOrder)
    - fn [layerOrder](../../src/draft.ts#L178) (layers: readonly string[], uses: ReadonlyMap<string, ReadonlySet<string>>) → string[] | null <!-- internal -->
      <a id="features.draft.layerOrder"></a><br>Layers with those used first (Kahn, ties by name); null for a cycle.
    - fn [codeToSpec](../../src/draft.ts#L195) (snapshot: AnalysisSnapshot, file: string, line: number | null) → { name: string; drafts: FlowDraft[] }
      <a id="features.draft.codeToSpec"></a><br>`code-to-spec <path[:line]>`: the functions the code position names — the innermost fn whose range holds the line, or every exported fn of the file without a line — each as a flow draft.
      - calls [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft.distinctNames](features.md#features.draft.distinctNames)
    - type [ChangedLines](../../src/draft.ts#L219)
      <a id="features.draft.ChangedLines"></a><br>Changed lines per file, 1-based and inclusive; `all` for a file git does not track yet.
    - fn [diffHunks](../../src/draft.ts#L225) (diff: string) → Map<string, [number, number][]>
      <a id="features.draft.diffHunks"></a><br>The new-side line ranges of `git diff --unified=0`. A deletion is the line it happened after, so the fn around it counts as changed.
      - calls [features.draft.gitPath](features.md#features.draft.gitPath)
    - fn [deletedDiffPaths](../../src/draft.ts#L248) (diff: string) → string[]
      <a id="features.draft.deletedDiffPaths"></a><br>Paths removed in `git diff` (`--- a/file` then `+++ /dev/null`). `diffHunks` follows the new side, so a deletion has no hunk to land on.
      - calls [features.draft.gitPath](features.md#features.draft.gitPath)
    - fn [gitPath](../../src/draft.ts#L262) (text: string) → string <!-- internal -->
      <a id="features.draft.gitPath"></a><br>A path as `git diff` prints it: C-quoted (`"b/\303\251.ts"`, `"b/a\"b.ts"`) when it holds a quote, a backslash or a control byte.
    - fn [changedFlows](../../src/draft.ts#L290) (snapshot: AnalysisSnapshot, changed: ChangedLines, named: ReadonlySet<string>) → { drafts: FlowDraft[]; named: string[] }
      <a id="features.draft.changedFlows"></a><br>`code-to-spec --since <ref>`: a flow draft for each fn the change touches. A fn some hand-written spec already names is reported, not drafted again — its flow is the place to look.
      - calls [features.draft.draftFlow](features.md#features.draft.draftFlow), [features.draft.distinctNames](features.md#features.draft.distinctNames)
  - module [explain-llm](../../src/explain-llm.ts#L1)
    <a id="features.explain-llm"></a><br>The plain-language explanation of a node (design §5.4, ADR 0004): what goes to the model, how the answer is kept, and when it is stale. An explanation lives in `<dir>/explain/<id>.md` (a brief for the explained map in `<dir>/explain/brief/<id>.md`) beside its baseline — the…
    - node [external.node](external.md#external.node)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - analyze [map.analyze](map.md#map.analyze)
    - brief [base.brief](base.md#base.brief)
    - config [base.config](base.md#base.config)
    - explain-node [features.explain-node](features.md#features.explain-node)
    - explanations [map.explanations](map.md#map.explanations)
    - graph [map.graph](map.md#map.graph)
    - llm [features.llm](features.md#features.llm)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - span [base.span](base.md#base.span)
    - type [Explanation](../../src/explain-llm.ts#L21) = StoredExplanation
      <a id="features.explain-llm.Explanation"></a>
    - fn [readExplanation](../../src/explain-llm.ts#L24) (config: Config, id: string, detail: ExplanationDetail = "short") → Explanation | null
      <a id="features.explain-llm.readExplanation"></a><br>The saved explanation of `id` at this detail: `short` and `full` share `<id>.md`, a brief has its own file.
      - calls [map.explanations.readStoredExplanation](map.md#map.explanations.readStoredExplanation), [map.explanations.explanationPath](map.md#map.explanations.explanationPath)
    - fn [writeExplanation](../../src/explain-llm.ts#L29) (config: Config, id: string, e: Explanation) → void
      <a id="features.explain-llm.writeExplanation"></a>
      - calls [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite), [map.explanations.explanationPath](map.md#map.explanations.explanationPath), [map.explanations.formatStoredExplanation](map.md#map.explanations.formatStoredExplanation), [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [explainedIds](../../src/explain-llm.ts#L34) (config: Config, kind: "answers" | "briefs") → string[]
      <a id="features.explain-llm.explainedIds"></a><br>IDs of every saved explanation (`answers`) or brief, sorted.
      - calls [map.explanations.storedIds](map.md#map.explanations.storedIds), [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [oldExplanations](../../src/explain-llm.ts#L39) (root: string) → number
      <a id="features.explain-llm.oldExplanations"></a><br>Explanation files in the store of keylang 0.1, which is not read any more.
    - fn [moveHint](../../src/explain-llm.ts#L45) (config: Config, count: number) → string
      <a id="features.explain-llm.moveHint"></a><br>How to move the store of keylang 0.1 to where explanations live now.
      - calls [map.explanations.explainDir](map.md#map.explanations.explainDir)
    - fn [currentBaseline](../../src/explain-llm.ts#L53) (analysis: Analysis, id: string) → string | null
      <a id="features.explain-llm.currentBaseline"></a><br>The baseline an explanation of `id` is compared with now (`snapshotBaseline`): "" for a planned node, which has no code yet; null when the id is gone.
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl)
    - fn [isStale](../../src/explain-llm.ts#L58) (analysis: Analysis, id: string, e: Explanation) → boolean
      <a id="features.explain-llm.isStale"></a>
      - calls [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline)
    - fn [briefText](../../src/explain-llm.ts#L63) (answer: string) → string
      <a id="features.explain-llm.briefText"></a><br>A model's brief as saved: one or two sentences in one paragraph, cut by the rule doc comments follow.
      - calls [base.brief.briefOf](base.md#base.brief.briefOf)
    - fn [unknownIds](../../src/explain-llm.ts#L71) (analysis: Analysis, text: string) → string[]
      <a id="features.explain-llm.unknownIds"></a><br>`` `a.b.c` `` in the answer that are neither snapshot IDs nor declared `planned`. Only a path that starts with a layer is an ID at all: `` `process.env` `` is code.
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl)
    - fn [explanationRequest](../../src/explain-llm.ts#L86) (analysis: Analysis, summary: NodeSummary, options: { lang: string; detail: ExplanationDetail; briefs: ReadonlyMap<string, StoredExplanation> }) → LlmRequest
      <a id="features.explain-llm.explanationRequest"></a><br>The request: the node's summary, its code, the signatures around it, and the words of the specs that mention it (layer, flows, rules). Not the repository.
      - calls [features.agent-context.snapshotSource](features.md#features.agent-context.snapshotSource), [features.explain-llm.sourceLines](features.md#features.explain-llm.sourceLines), [features.explain-node.formatSummary](features.md#features.explain-node.formatSummary), [features.explain-llm.members](features.md#features.explain-llm.members)
    - fn [members](../../src/explain-llm.ts#L126) (analysis: Analysis, id: string, briefs: ReadonlyMap<string, StoredExplanation>) → string[] <!-- internal -->
      <a id="features.explain-llm.members"></a><br>The members right under a module, class or layer with their explanations (doc comments, briefs): a layer is explained through its modules, a module through its functions and types.
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf)
    - fn [sourceLines](../../src/explain-llm.ts#L142) (text: string, from: number, to: number) → string <!-- internal -->
      <a id="features.explain-llm.sourceLines"></a>
    - type [BriefBatch](../../src/explain-llm.ts#L149) = "missing" | "stale"
      <a id="features.explain-llm.BriefBatch"></a><br>Which briefs a batch writes: nodes with no explanation or a stale brief (`missing`), or only stale briefs (`stale`).
    - type [BriefLevel](../../src/explain-llm.ts#L152) = "fn/type" | "class/module" | "layer"
      <a id="features.explain-llm.BriefLevel"></a><br>Levels of the explained map, explained bottom-up: a parent's prompt carries its members' briefs.
    - type [PlannedBrief](../../src/explain-llm.ts#L154)
      <a id="features.explain-llm.PlannedBrief"></a>
    - fn [planBriefs](../../src/explain-llm.ts#L167) (analysis: Analysis, batch: BriefBatch, briefs: ReadonlyMap<string, StoredExplanation>) → PlannedBrief[]
      <a id="features.explain-llm.planBriefs"></a><br>The nodes a batch explains, in the order it asks: fn and types, then classes and modules from the deepest up, then layers. A node with a doc comment is never asked about: the code already says what it does.
      - calls [map.explanations.snapshotBaseline](map.md#map.explanations.snapshotBaseline), [base.span.compareText](base.md#base.span.compareText)
    - fn [estimateTokens](../../src/explain-llm.ts#L185) (analysis: Analysis, plan: readonly PlannedBrief[], briefs: ReadonlyMap<string, StoredExplanation>) → { input: number; output: number }
      <a id="features.explain-llm.estimateTokens"></a><br>A rough size of the batch for `--dry-run`: about four characters a token, and a brief of about 80 tokens out.
      - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.explanationRequest](features.md#features.explain-llm.explanationRequest)
    - type [BatchResult](../../src/explain-llm.ts#L196)
      <a id="features.explain-llm.BatchResult"></a>
    - fn [runBriefs](../../src/explain-llm.ts#L206) ( analysis: Analysis, client: LlmClient, plan: readonly PlannedBrief[], options: { jobs: number; briefs: Map<string, StoredExplanation>; progress: (done: number, total: number, id: string, failed: string | null) => void }, ) → Promise<BatchResult>
      <a id="features.explain-llm.runBriefs"></a><br>Ask for every planned brief, `jobs` at a time within a wave, and save each one as soon as it arrives: an interrupted or failed batch keeps what it got, and the next run asks only for the rest. A failure of one node does not stop the others.
      - calls [features.explain-node.summarizeNode](features.md#features.explain-node.summarizeNode), [features.explain-llm.explanationRequest](features.md#features.explain-llm.explanationRequest), [features.explain-llm.currentBaseline](features.md#features.explain-llm.currentBaseline), [features.explain-llm.briefText](features.md#features.explain-llm.briefText), [features.explain-llm.writeExplanation](features.md#features.explain-llm.writeExplanation), [base.span.compareText](base.md#base.span.compareText)
  - module [explain-node](../../src/explain-node.ts#L1)
    <a id="features.explain-node"></a><br>`keylang explain <id>` without a model: what the snapshot and the specs say about one node. Deterministic and offline; the LLM explanation (§5.4) builds on it and falls back to it.
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - type [NodeSummary](../../src/explain-node.ts#L9)
      <a id="features.explain-node.NodeSummary"></a>
    - type [ExplainResult](../../src/explain-node.ts#L32)
      <a id="features.explain-node.ExplainResult"></a>
    - fn [summarizeNode](../../src/explain-node.ts#L34) (analysis: Analysis, id: string) → ExplainResult
      <a id="features.explain-node.summarizeNode"></a>
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl), [features.explain-node.nodeHolding](features.md#features.explain-node.nodeHolding), [features.lsp-features.flowsUsing](features.md#features.lsp-features.flowsUsing)
    - fn [nodeHolding](../../src/explain-node.ts#L95) (root: Node, ref: Ref) → Node | null <!-- internal -->
      <a id="features.explain-node.nodeHolding"></a><br>The allow, deny, entry item, nested layer, or module line that holds `ref`.
    - fn [formatSummary](../../src/explain-node.ts#L105) (s: NodeSummary) → string
      <a id="features.explain-node.formatSummary"></a><br>The summary as text: one line per fact, empty facts left out.
  - module [explain](../../src/explain.ts#L1)
    <a id="features.explain"></a><br>Short explanations for diagnostic codes. Every code in `diag.ts` has an entry.
    - diag [base.diag](base.md#base.diag)
    - fn [explainCode](../../src/explain.ts#L104) (code: string) → string | null
      <a id="features.explain.explainCode"></a>
  - module [feature-status](../../src/feature-status.ts#L1)
    <a id="features.feature-status"></a><br>Whether a feature file is done: every `planned` in it is implemented (K202, not K201), every flow step in it is static ok, and no rule fail exists in any spec. Tests and trace are reported and do not block.
    - assess [check.assess](check.md#check.assess)
    - diag [base.diag](base.md#base.diag)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - verdict [check.verdict](check.md#check.verdict)
    - type [Gap](../../src/feature-status.ts#L13)
      <a id="features.feature-status.Gap"></a>
    - type [FeatureInfo](../../src/feature-status.ts#L22)
      <a id="features.feature-status.FeatureInfo"></a>
    - type [FeatureReport](../../src/feature-status.ts#L31)
      <a id="features.feature-status.FeatureReport"></a>
    - type [FeatureInput](../../src/feature-status.ts#L37)
      <a id="features.feature-status.FeatureInput"></a>
    - fn [idsIn](../../src/feature-status.ts#L50) (doc: Document) → string[]
      <a id="features.feature-status.idsIn"></a><br>Ids declared or named in one spec, in first-seen order.
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [featureStatus](../../src/feature-status.ts#L67) (input: FeatureInput, slug: string) → FeatureReport | null
      <a id="features.feature-status.featureStatus"></a><br>The feature report, or null when `keylang/<dir>/features/<slug>.md` is not one of the specs. Gaps are ordered by kind, then file, line, column, id.
      - calls [features.feature-status.finding](features.md#features.feature-status.finding), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [base.diag.isError](base.md#base.diag.isError), [check.assess.sameFinding](check.md#check.assess.sameFinding), [base.span.compareText](base.md#base.span.compareText)
    - fn [finding](../../src/feature-status.ts#L125) (diagnostics: readonly Diagnostic[], file: string, line: number, code: string) → Diagnostic | undefined <!-- internal -->
      <a id="features.feature-status.finding"></a>
  - module [ghost](../../src/ghost.ts#L1)
    <a id="features.ghost"></a><br>Ghost text (design §7.3): one next line of a flow from the agent, shown grey after a pause and only on a cheap signal — the cursor on a new `- ` item of a flow that has a trigger. A suggestion is checked where it would stand, in the buffer: one that does not parse there (a step…
    - analyze [map.analyze](map.md#map.analyze)
    - agent-context [features.agent-context](features.md#features.agent-context)
    - ir [lang.ir](lang.md#lang.ir)
    - llm [features.llm](features.md#features.llm)
    - parser [lang.parser](lang.md#lang.parser)
    - fn [ghostSignal](../../src/ghost.ts#L16) (path: string, text: string, line: number, col: number) → boolean
      <a id="features.ghost.ghostSignal"></a><br>The cursor line starts a new list item (`- ` and nothing after it) inside a `# flow` with a trigger.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [ghostSuggestions](../../src/ghost.ts#L29) (analysis: Analysis, client: LlmClient, path: string, text: string, line: number, pack: ContextPack | null) → Promise<string[]>
      <a id="features.ghost.ghostSuggestions"></a><br>Up to three one-line continuations; each keeps the indentation of the cursor line and names only known IDs.
      - calls [features.agent-context.contextText](features.md#features.agent-context.contextText), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk), [lang.parser.parse](lang.md#lang.parser.parse)
  - module [keys](../../src/keys.ts#L1)
    <a id="features.keys"></a><br>API keys kept outside the environment: `~/.config/keylang/<name>.key`, mode 0600. Shared by the model adapter and voice, without loading either.
    - node [external.node](external.md#external.node)
    - fn [readKey](../../src/keys.ts#L8) (home: string, name: string) → string | undefined
      <a id="features.keys.readKey"></a><br>The key in `~/.config/keylang/<name>.key`; a file others can read is refused, not used.
  - module [llm](../../src/llm.ts#L1)
    <a id="features.llm"></a><br>One text completion from the configured model (`keylang.json` `agent`): `anthropic:<model>` through the official SDK, `openrouter:<model>` through its chat completions endpoint with SSE. Keys come from the environment or `~/.config/keylang/<provider>.key` (mode 0600).
    - Anthropic [external.anthropic-ai-sdk](external.md#external.anthropic-ai-sdk)
    - eventsource-parser [external.eventsource-parser](external.md#external.eventsource-parser)
    - node [external.node](external.md#external.node)
    - keys [features.keys](features.md#features.keys)
    - type [LlmRequest](../../src/llm.ts#L18)
      <a id="features.llm.LlmRequest"></a>
    - type [LlmClient](../../src/llm.ts#L24)
      <a id="features.llm.LlmClient"></a>
    - type [LlmSetup](../../src/llm.ts#L31) = { client: LlmClient } | { missing: string }
      <a id="features.llm.LlmSetup"></a>
    - type [Env](../../src/llm.ts#L33) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.llm.Env"></a>
    - fn [llmClient](../../src/llm.ts#L40) (agent: string | null, env: Env = process.env, home: string = homedir()) → LlmSetup
      <a id="features.llm.llmClient"></a>
      - calls [features.llm.timeoutMs](features.md#features.llm.timeoutMs), [features.keys.readKey](features.md#features.keys.readKey), [features.llm.anthropicComplete](features.md#features.llm.anthropicComplete), [features.llm.openrouterComplete](features.md#features.llm.openrouterComplete)
    - fn [timeoutMs](../../src/llm.ts#L67) (env: Env) → number | string <!-- internal -->
      <a id="features.llm.timeoutMs"></a><br>`KEYLANG_LLM_TIMEOUT_MS`, a positive whole number of milliseconds; the reason when it is not one.
    - fn [anthropicComplete](../../src/llm.ts#L73) (client: Anthropic, model: string, request: LlmRequest, timeout: number) → Promise<string> <!-- internal -->
      <a id="features.llm.anthropicComplete"></a>
    - fn [openrouterComplete](../../src/llm.ts#L103) (base: string, key: string, model: string, request: LlmRequest, timeout: number) → Promise<string> <!-- internal -->
      <a id="features.llm.openrouterComplete"></a>
      - calls [features.llm.parseJson](features.md#features.llm.parseJson)
    - fn [parseJson](../../src/llm.ts#L156) (text: string) → unknown <!-- internal -->
      <a id="features.llm.parseJson"></a>
  - module [lsp-features](../../src/lsp-features.ts#L1)
    <a id="features.lsp-features"></a><br>Language features over one analysis: pure functions from an `Analysis`, a document, and a position to LSP results. Positions are LSP's: 0-based line, UTF-16 character.
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - assess [check.assess](check.md#check.assess)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - emit [map.emit](map.md#map.emit)
    - brief [base.brief](base.md#base.brief)
    - explanations [map.explanations](map.md#map.explanations)
    - ir [lang.ir](lang.md#lang.ir)
    - map [map.map](map.md#map.map)
    - node-search [features.node-search](features.md#features.node-search)
    - parser [lang.parser](lang.md#lang.parser)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - span [base.span](base.md#base.span)
    - verdict [check.verdict](check.md#check.verdict)
    - type [LspPosition](../../src/lsp-features.ts#L24)
      <a id="features.lsp-features.LspPosition"></a>
    - type [LspRange](../../src/lsp-features.ts#L29)
      <a id="features.lsp-features.LspRange"></a>
    - type [Location](../../src/lsp-features.ts#L34)
      <a id="features.lsp-features.Location"></a>
    - type [Workspace](../../src/lsp-features.ts#L40)
      <a id="features.lsp-features.Workspace"></a><br>What features read: the analysis, the root, and the text of any document.
    - fn [workspace](../../src/lsp-features.ts#L47) (root: string, analysis: Analysis, buffers: ReadonlyMap<string, string>) → Workspace
      <a id="features.lsp-features.workspace"></a>
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [features.lsp-features.readOrNull](features.md#features.lsp-features.readOrNull), [map.emit.isGeneratedMap](map.md#map.emit.isGeneratedMap)
    - fn [lineStarts](../../src/lsp-features.ts#L86) (text: string) → number[] <!-- internal -->
      <a id="features.lsp-features.lineStarts"></a>
    - fn [lspPoint](../../src/lsp-features.ts#L96) (text: string | null, line: number, col: number) → LspPosition <!-- internal -->
      <a id="features.lsp-features.lspPoint"></a><br>A 1-based line and column in code points — the unit of IR spans and of snapshot positions in code alike — as an LSP position (UTF-16).
    - fn [fromPos](../../src/lsp-features.ts#L102) (text: string | null, pos: Pos) → LspPosition <!-- internal -->
      <a id="features.lsp-features.fromPos"></a>
      - calls [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
    - fn [fromSpan](../../src/lsp-features.ts#L106) (text: string | null, span: Span) → LspRange <!-- internal -->
      <a id="features.lsp-features.fromSpan"></a>
      - calls [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos)
    - fn [lineRange](../../src/lsp-features.ts#L111) (text: string | null, line: number, col: number) → LspRange <!-- internal -->
      <a id="features.lsp-features.lineRange"></a><br>A 1-based line and a column in code points, to the end of that line.
    - fn [toOffset](../../src/lsp-features.ts#L117) (text: string, position: LspPosition) → number <!-- internal -->
      <a id="features.lsp-features.toOffset"></a>
      - calls [features.lsp-features.lineStarts](features.md#features.lsp-features.lineStarts)
    - fn [uriOf](../../src/lsp-features.ts#L121) (root: string, path: string) → string <!-- internal -->
      <a id="features.lsp-features.uriOf"></a>
    - type [Target](../../src/lsp-features.ts#L127) <!-- internal -->
      <a id="features.lsp-features.Target"></a>
    - fn [nodesOf](../../src/lsp-features.ts#L129) (doc: Document) → { node: Node; section: Section; parent: Node | null }[] <!-- internal -->
      <a id="features.lsp-features.nodesOf"></a>
      - calls [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes)
    - fn [targetAt](../../src/lsp-features.ts#L142) (doc: Document, offset: number) → Target | null
      <a id="features.lsp-features.targetAt"></a><br>The id, reference, or code link at an offset of a document. Spans are half-open: the offset after an id is not in it.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [base.span.spanContains](base.md#base.span.spanContains)
    - fn [docOf](../../src/lsp-features.ts#L157) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.docOf"></a>
      - calls [features.lsp-features.readingDoc](features.md#features.lsp-features.readingDoc)
    - fn [readOrNull](../../src/lsp-features.ts#L161) (abs: string) → string | null <!-- internal -->
      <a id="features.lsp-features.readOrNull"></a>
    - fn [readingDoc](../../src/lsp-features.ts#L177) (ws: Workspace, path: string) → Document | undefined <!-- internal -->
      <a id="features.lsp-features.readingDoc"></a><br>A file of the explained map. The analysis does not check it (it is no spec), but its IDs and code links lead where the map's do: hover, definition and Enter in the TUI work there too.
      - calls [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [at](../../src/lsp-features.ts#L188) (ws: Workspace, path: string, position: LspPosition) → Target | null <!-- internal -->
      <a id="features.lsp-features.at"></a>
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.targetAt](features.md#features.lsp-features.targetAt), [features.lsp-features.toOffset](features.md#features.lsp-features.toOffset)
    - type [LspDiagnostic](../../src/lsp-features.ts#L197)
      <a id="features.lsp-features.LspDiagnostic"></a>
    - fn [diagnosticsFor](../../src/lsp-features.ts#L207) (ws: Workspace, path: string) → LspDiagnostic[]
      <a id="features.lsp-features.diagnosticsFor"></a><br>Diagnostics and verdicts of one document, as `check --format json` reports them.
      - calls [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan), [check.assess.sameFinding](check.md#check.assess.sameFinding), [features.lsp-features.lineRange](features.md#features.lsp-features.lineRange)
    - type [Described](../../src/lsp-features.ts#L232) <!-- internal -->
      <a id="features.lsp-features.Described"></a>
    - fn [describe](../../src/lsp-features.ts#L242) (ws: Workspace, id: string) → Described | null <!-- internal -->
      <a id="features.lsp-features.describe"></a>
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl)
    - fn [plannedDecl](../../src/lsp-features.ts#L256) (docs: readonly Document[], id: string) → { kind: string; signature: string | null; file: string; line: number; col: number } | null
      <a id="features.lsp-features.plannedDecl"></a>
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [flowsUsing](../../src/lsp-features.ts#L265) (spec: SpecIR, id: string) → string[]
      <a id="features.lsp-features.flowsUsing"></a>
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [hover](../../src/lsp-features.ts#L275) (ws: Workspace, path: string, position: LspPosition) → { contents: { kind: "markdown"; value: string }; range: LspRange } | null
      <a id="features.lsp-features.hover"></a>
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.describe](features.md#features.lsp-features.describe), [features.lsp-features.flowsUsing](features.md#features.lsp-features.flowsUsing), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - fn [definition](../../src/lsp-features.ts#L296) (ws: Workspace, path: string, position: LspPosition) → Location | null
      <a id="features.lsp-features.definition"></a>
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.describe](features.md#features.lsp-features.describe), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint), [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf)
    - fn [signatureHelp](../../src/lsp-features.ts#L310) (ws: Workspace, path: string, position: LspPosition) → { signatures: { label: string; documentation?: string }[]; activeSignature: 0; activeParameter: 0 } | null
      <a id="features.lsp-features.signatureHelp"></a>
      - calls [features.lsp-features.describe](features.md#features.lsp-features.describe)
    - fn [references](../../src/lsp-features.ts#L324) (ws: Workspace, path: string, position: LspPosition, includeDeclaration = true) → Location[]
      <a id="features.lsp-features.references"></a><br>Declarations and uses of the id under the cursor; `includeDeclaration: false` (LSP's `context`) leaves out the declarations.
      - calls [features.lsp-features.at](features.md#features.lsp-features.at), [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf), [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [SymbolInformation](../../src/lsp-features.ts#L340)
      <a id="features.lsp-features.SymbolInformation"></a>
    - fn [workspaceSymbols](../../src/lsp-features.ts#L360) (ws: Workspace, briefs: ReadonlyMap<string, StoredExplanation>, query: string) → SymbolInformation[]
      <a id="features.lsp-features.workspaceSymbols"></a><br>Nodes of the snapshot and planned intentions matching `query` (`searchNodes`, fuzzy): by name and ID first, then by the text of their explanation. Each points at its code, a planned one at its declaration in the spec, a layer at its line in `keylang.json`; `containerName` is…
      - calls [features.node-search.searchNodes](features.md#features.node-search.searchNodes), [features.lsp-features.symbolLocation](features.md#features.lsp-features.symbolLocation), [base.brief.capText](base.md#base.brief.capText), [features.lsp-features.symbolKind](features.md#features.lsp-features.symbolKind)
    - fn [symbolKind](../../src/lsp-features.ts#L376) (kind: string) → number <!-- internal -->
      <a id="features.lsp-features.symbolKind"></a>
    - fn [symbolLocation](../../src/lsp-features.ts#L385) (ws: Workspace, hit: NodeHit) → Location | null <!-- internal -->
      <a id="features.lsp-features.symbolLocation"></a>
      - calls [features.lsp-features.uriOf](features.md#features.lsp-features.uriOf), [features.lsp-features.lineRange](features.md#features.lsp-features.lineRange), [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
    - type [DocumentSymbol](../../src/lsp-features.ts#L405)
      <a id="features.lsp-features.DocumentSymbol"></a>
    - fn [statusOf](../../src/lsp-features.ts#L418) (verdicts: readonly Verdict[], diagnostics: readonly Diagnostic[], path: string, line: number) → string | undefined <!-- internal -->
      <a id="features.lsp-features.statusOf"></a><br>Worst verdict on a line of this document: `fail` > `unverified` > `ok`.
    - fn [flowPhrases](../../src/lsp-features.ts#L428) (spec: SpecIR) → Map<Node, string> <!-- internal -->
      <a id="features.lsp-features.flowPhrases"></a><br>Written phrase of a trigger, step, when, or then, keyed by its text-IR node.
      - calls [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow), [features.lsp-features.itemPhrase](features.md#features.lsp-features.itemPhrase)
    - fn [itemPhrase](../../src/lsp-features.ts#L439) (item: Trigger | FlowItem) → string | null <!-- internal -->
      <a id="features.lsp-features.itemPhrase"></a>
    - fn [documentSymbols](../../src/lsp-features.ts#L446) (ws: Workspace, path: string) → DocumentSymbol[]
      <a id="features.lsp-features.documentSymbols"></a>
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.flowPhrases](features.md#features.lsp-features.flowPhrases), [lang.ir.walk](lang.md#lang.ir.walk), [features.lsp-features.statusOf](features.md#features.lsp-features.statusOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [features.lsp-features.fromPos](features.md#features.lsp-features.fromPos), [features.lsp-features.fromSpan](features.md#features.lsp-features.fromSpan)
    - type [CompletionItem](../../src/lsp-features.ts#L533)
      <a id="features.lsp-features.CompletionItem"></a>
    - fn [completions](../../src/lsp-features.ts#L560) (ws: Workspace, path: string, position: LspPosition) → CompletionItem[]
      <a id="features.lsp-features.completions"></a><br>Keywords by position at the start of an item; after `step`/`trigger` only functions and planned functions; after other reference keywords, ids that the enclosing module may depend on (`deny` removes the rest).
      - calls [features.lsp-features.docOf](features.md#features.lsp-features.docOf), [features.lsp-features.enclosing](features.md#features.lsp-features.enclosing), [features.lsp-features.sectionAt](features.md#features.lsp-features.sectionAt), [lang.parser.keywordsAt](lang.md#lang.parser.keywordsAt), [features.lsp-features.moduleAround](features.md#features.lsp-features.moduleAround), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [check.rules.blocksDependency](check.md#check.rules.blocksDependency)
    - fn [sectionAt](../../src/lsp-features.ts#L608) (doc: Document, line: number) → Section | undefined <!-- internal -->
      <a id="features.lsp-features.sectionAt"></a>
    - fn [enclosing](../../src/lsp-features.ts#L618) (doc: Document, line: number, col: number) → Node | undefined <!-- internal -->
      <a id="features.lsp-features.enclosing"></a><br>The nearest item above `line` that starts left of `col`: the parent of a new item there.
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [ancestors](../../src/lsp-features.ts#L627) (doc: Document, node: Node) → Node[] <!-- internal -->
      <a id="features.lsp-features.ancestors"></a>
      - calls [features.lsp-features.nodesOf](features.md#features.lsp-features.nodesOf)
    - fn [moduleAround](../../src/lsp-features.ts#L640) (ws: Workspace, doc: Document, parent: Node | undefined) → string | null <!-- internal -->
      <a id="features.lsp-features.moduleAround"></a><br>The module a completion is written in: the nearest enclosing module or fn declaration.
      - calls [features.lsp-features.ancestors](features.md#features.lsp-features.ancestors)
    - type [CodeLens](../../src/lsp-features.ts#L655) <!-- internal -->
      <a id="features.lsp-features.CodeLens"></a>
    - fn [codeLenses](../../src/lsp-features.ts#L661) (ws: Workspace, path: string) → CodeLens[]
      <a id="features.lsp-features.codeLenses"></a><br>`flows: checkout, pay` above each function of a source file that a flow names. The command `keylang.flows` (registered by the editor client) gets the flow names.
      - calls [features.lsp-features.flowsUsing](features.md#features.lsp-features.flowsUsing), [features.lsp-features.lspPoint](features.md#features.lsp-features.lspPoint)
  - module [node-search](../../src/node-search.ts#L1)
    <a id="features.node-search"></a><br>Finding nodes by name, ID or what their explanation says (ADR 0004): the TUI's node search, MCP `search` and LSP workspace symbols share one ranking.
    - analyze [map.analyze](map.md#map.analyze)
    - explanations [map.explanations](map.md#map.explanations)
    - ir [lang.ir](lang.md#lang.ir)
    - span [base.span](base.md#base.span)
    - type [NodeHit](../../src/node-search.ts#L9)
      <a id="features.node-search.NodeHit"></a>
    - type [NodeQuery](../../src/node-search.ts#L22)
      <a id="features.node-search.NodeQuery"></a>
    - fn [searchNodes](../../src/node-search.ts#L40) (analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>, q: NodeQuery) → NodeHit[]
      <a id="features.node-search.searchNodes"></a><br>Nodes of the snapshot and `planned` intentions of the specs matching the query, case-insensitive: first those whose ID or name matches (for `fuzzy`, the exact name, then a name prefix, a name part, an ID part, then a subsequence of the name and of the ID; shorter IDs first…
      - calls [features.node-search.candidates](features.md#features.node-search.candidates), [features.node-search.idRank](features.md#features.node-search.idRank), [base.span.compareText](base.md#base.span.compareText)
    - fn [candidates](../../src/node-search.ts#L55) (analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>) → NodeHit[] <!-- internal -->
      <a id="features.node-search.candidates"></a>
      - calls [map.explanations.explanationOf](map.md#map.explanations.explanationOf), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [idRank](../../src/node-search.ts#L77) (query: string, id: string, fuzzy: boolean) → number | null <!-- internal -->
      <a id="features.node-search.idRank"></a><br>How well the ID or its last segment matches, lower is better; null when it does not.
      - calls [features.node-search.subsequence](features.md#features.node-search.subsequence)
    - fn [subsequence](../../src/node-search.ts#L91) (query: string, text: string) → boolean <!-- internal -->
      <a id="features.node-search.subsequence"></a><br>Every code point of `query` appears in `text` in order.
  - module [proposals](../../src/proposals.ts#L1)
    <a id="features.proposals"></a><br>Proposals (CONTEXT.md): the full proposed text of one hand-written spec or source file, kept in `.keylang/proposals/<path>` until a person merges it hunk by hunk. `draft`, `code-to-spec` and MCP `apply_diff` propose specs, `spec-to-code` proposes code and its tests; only the…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - languages [base.languages](base.md#base.languages)
    - parser [lang.parser](lang.md#lang.parser)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - wire-gen [map.wire-gen](map.md#map.wire-gen)
    - fn [proposalProblem](../../src/proposals.ts#L24) (root: string, specDir: string, path: string, generated: (path: string) => boolean = () => false) → string | null
      <a id="features.proposals.proposalProblem"></a><br>Why `.keylang/proposals/<path>` may not be merged, or null. A proposal replaces one hand-written spec: a Markdown file under the spec directory, not a generated map file, and not reached through a link that leads out. `specDir` is relative to the root, POSIX; `generated` says…
      - calls [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within), [lang.parser.parse](lang.md#lang.parser.parse)
    - fn [codeProposalProblem](../../src/proposals.ts#L48) (root: string, path: string) → string | null
      <a id="features.proposals.codeProposalProblem"></a><br>Why a proposal for the source file `path` may not be merged, or null: a file of a language keylang reads, inside the repository (links included), outside the directories sources are not read from, and not one keylang generates (`keylang wire`).
      - calls [base.languages.languageOf](base.md#base.languages.languageOf), [base.safe-write.landing](base.md#base.safe-write.landing), [map.analyze.within](map.md#map.analyze.within)
    - fn [writeProposal](../../src/proposals.ts#L64) (root: string, path: string, text: string) → string
      <a id="features.proposals.writeProposal"></a><br>Writes the proposal for `path` (relative, POSIX) atomically and returns its file; `.keylang/proposals/` is keylang's own store, so a link there that leads elsewhere is refused like any other.
      - calls [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [lineDiff](../../src/proposals.ts#L69) (before: string, after: string) → string
      <a id="features.proposals.lineDiff"></a><br>`-`/`+` lines between a common prefix and suffix: enough to see what a proposal changes.
  - module [spec-to-code](../../src/spec-to-code.ts#L1)
    <a id="features.spec-to-code"></a><br>`keylang spec-to-code <id>` (design §5.5), algo: a stub for a `planned` fn in the file its ID names, with the declared signature, analyzed as a new snapshot before anything is written; and for each `test` its flows name in a file that does not exist yet, a TS/JS e2e test that…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - config [base.config](base.md#base.config)
    - diag [base.diag](base.md#base.diag)
    - glob [base.glob](base.md#base.glob)
    - graph [map.graph](map.md#map.graph)
    - lsp-features [features.lsp-features](features.md#features.lsp-features)
    - proposals [features.proposals](features.md#features.proposals)
    - rules [check.rules](check.md#check.rules)
    - spec-ir [lang.spec-ir](lang.md#lang.spec-ir)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - llm [features.llm](features.md#features.llm)
    - verdict [check.verdict](check.md#check.verdict)
    - type [FileCandidate](../../src/spec-to-code.ts#L24)
      <a id="features.spec-to-code.FileCandidate"></a>
    - type [CodeCandidate](../../src/spec-to-code.ts#L32) extends FileCandidate
      <a id="features.spec-to-code.CodeCandidate"></a>
    - fn [specToCode](../../src/spec-to-code.ts#L50) (analysis: Analysis, id: string, into?: string, model?: LlmClient) → Promise<CodeCandidate>
      <a id="features.spec-to-code.specToCode"></a><br>`model`: the body comes from the model instead of the stub — the whole function with the declared signature, in one fenced block — and is analyzed the same way before anything is written.
      - calls [features.lsp-features.plannedDecl](features.md#features.lsp-features.plannedDecl), [features.spec-to-code.callersInFlows](features.md#features.spec-to-code.callersInFlows), [check.rules.blocksDependency](check.md#check.rules.blocksDependency), [check.rules.dependencyKindOf](check.md#check.rules.dependencyKindOf), [features.spec-to-code.newModuleFile](features.md#features.spec-to-code.newModuleFile), [map.graph.placeFile](map.md#map.graph.placeFile), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [features.spec-to-code.modelBody](features.md#features.spec-to-code.modelBody), [features.spec-to-code.stubFor](features.md#features.spec-to-code.stubFor), [base.safe-write.allCrlf](base.md#base.safe-write.allCrlf), [map.analyze.analyze](map.md#map.analyze.analyze), [features.spec-to-code.introduced](features.md#features.spec-to-code.introduced), [features.spec-to-code.testCandidates](features.md#features.spec-to-code.testCandidates)
    - fn [introduced](../../src/spec-to-code.ts#L91) (base: Analysis, next: Analysis) → { verdicts: Verdict[]; diagnostics: Diagnostic[] } <!-- internal -->
      <a id="features.spec-to-code.introduced"></a><br>Findings `next` has that `base` does not: what a candidate would change, wherever it lands (a K102 in the new file too).
    - fn [flowTests](../../src/spec-to-code.ts#L102) (analysis: Analysis, id: string) → { flow: string; file: string; name: string }[] <!-- internal -->
      <a id="features.spec-to-code.flowTests"></a><br>The `test` entries of the flows that name `id`: flow name, test file and test name.
      - calls [features.spec-to-code.flowsMentioning](features.md#features.spec-to-code.flowsMentioning), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowsMentioning](../../src/spec-to-code.ts#L115) (analysis: Analysis, id: string) → Flow[] <!-- internal -->
      <a id="features.spec-to-code.flowsMentioning"></a><br>Hand-written flows whose trigger, step, claim, `then`, or `planned` names `id`.
      - calls [features.spec-to-code.flowMentions](features.md#features.spec-to-code.flowMentions)
    - fn [flowMentions](../../src/spec-to-code.ts#L120) (spec: SpecIR, flow: Flow, id: string) → boolean <!-- internal -->
      <a id="features.spec-to-code.flowMentions"></a>
      - calls [features.spec-to-code.flowOwns](features.md#features.spec-to-code.flowOwns), [lang.spec-ir.walkFlow](lang.md#lang.spec-ir.walkFlow)
    - fn [flowOwns](../../src/spec-to-code.ts#L133) (spec: SpecIR, flow: Flow, line: number) → boolean <!-- internal -->
      <a id="features.spec-to-code.flowOwns"></a><br>`line` sits in this flow: after its heading and before the next flow of the same file.
    - fn [testCandidates](../../src/spec-to-code.ts#L143) (analysis: Analysis, id: string, codeFile: string, code: string, model: LlmClient | undefined) → Promise<{ tests: FileCandidate[]; notes: string[] }> <!-- internal -->
      <a id="features.spec-to-code.testCandidates"></a><br>One new file per test path the flows name and the disk lacks. A test in an existing file, or in a language without a `node:test` shape, is a note: editing someone's test file is theirs to do.
      - calls [features.spec-to-code.flowTests](features.md#features.spec-to-code.flowTests), [features.proposals.codeProposalProblem](features.md#features.proposals.codeProposalProblem), [base.config.toPosix](base.md#base.config.toPosix), [features.spec-to-code.modelTest](features.md#features.spec-to-code.modelTest), [features.spec-to-code.testStub](features.md#features.spec-to-code.testStub)
    - fn [testStub](../../src/spec-to-code.ts#L178) (from: string, name: string, entries: readonly { flow: string; name: string }[]) → string <!-- internal -->
      <a id="features.spec-to-code.testStub"></a>
    - fn [modelTest](../../src/spec-to-code.ts#L186) (model: LlmClient, file: string, from: string, name: string, id: string, code: string, entries: readonly { flow: string; name: string }[]) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelTest"></a><br>The e2e test file from the model; each declared test name must be in it verbatim.
    - fn [callersInFlows](../../src/spec-to-code.ts#L203) (analysis: Analysis, id: string) → string[] <!-- internal -->
      <a id="features.spec-to-code.callersInFlows"></a><br>IDs directly above `id` in flows: the trigger or step each of its steps is nested under.
    - fn [newModuleFile](../../src/spec-to-code.ts#L216) (config: Config, moduleId: string) → string <!-- internal -->
      <a id="features.spec-to-code.newModuleFile"></a><br>`<layer glob prefix>/<segments>.<ext>`; one prefix per layer, or the path is ambiguous.
      - calls [base.glob.globPrefix](base.md#base.glob.globPrefix)
    - fn [stubFor](../../src/spec-to-code.ts#L231) (file: string, name: string, id: string, signature: string | null, newFile: boolean) → string <!-- internal -->
      <a id="features.spec-to-code.stubFor"></a><br>`(order: Order) → Promise<Refund>` → a function of that signature that fails until written; the declared parameters and result are kept as written, so the stub's own signature matches the plan (no K201).
    - fn [modelBody](../../src/spec-to-code.ts#L247) (analysis: Analysis, model: LlmClient, file: string, name: string, id: string, signature: string | null, before: string | null) → Promise<string> <!-- internal -->
      <a id="features.spec-to-code.modelBody"></a><br>The function from the model, with its declared name; the rest of its answer is dropped.
      - calls [features.spec-to-code.flowsMentioning](features.md#features.spec-to-code.flowsMentioning)
  - module [stats](../../src/stats.ts#L1)
    <a id="features.stats"></a><br>`.keylang/stats.json`: how often people accept what a model proposed (design §5.1 p.7, §7.3). Counts per reconciliation status of draft lines, and per kind of suggestion; local, never a verdict.
    - node [external.node](external.md#external.node)
    - safe-write [base.safe-write](base.md#base.safe-write)
    - type [Tally](../../src/stats.ts#L9)
      <a id="features.stats.Tally"></a>
    - type [Stats](../../src/stats.ts#L15)
      <a id="features.stats.Stats"></a>
    - fn [readStats](../../src/stats.ts#L25) (root: string) → Stats
      <a id="features.stats.readStats"></a>
    - fn [updateStats](../../src/stats.ts#L38) (root: string, change: (stats: Stats) => void) → void
      <a id="features.stats.updateStats"></a>
      - calls [features.stats.readStats](features.md#features.stats.readStats), [base.safe-write.safeWrite](base.md#base.safe-write.safeWrite)
    - fn [statusesIn](../../src/stats.ts#L45) (lines: readonly string[]) → Record<string, number>
      <a id="features.stats.statusesIn"></a><br>`status=` of every `keylang:llm` / `keylang:algo` provenance comment in the lines.
    - fn [addDrafts](../../src/stats.ts#L54) (stats: Stats, counts: Record<string, number>, field: keyof Tally) → void
      <a id="features.stats.addDrafts"></a>
  - module [voice-local](../../src/voice-local.ts#L1)
    <a id="features.voice-local"></a><br>The optional native parts of voice (design §7.4): `decibri` for the microphone and `@fugood/whisper.node` (whisper.cpp) for local recognition. Both ship prebuilt binaries and are loaded only when present; without them voice uses the browser's microphone (`keylang web`) and…
    - node [external.node](external.md#external.node)
    - voice [features.voice](features.md#features.voice)
    - fugood-whisper_node [external.fugood-whisper_node](external.md#external.fugood-whisper_node)
    - decibri [external.decibri](external.md#external.decibri)
    - type [Microphone](../../src/voice-local.ts#L17) = { chunks: AsyncIterable<Int16Array>; stop: () => void } <!-- internal -->
      <a id="features.voice-local.Microphone"></a>
    - type [ModuleStatus](../../src/voice-local.ts#L20)
      <a id="features.voice-local.ModuleStatus"></a><br>Whether an optional package can be used here: `missing` when it is not installed, `unavailable` with the reason when it is there but does not load.
    - type [WhisperContext](../../src/voice-local.ts#L22) <!-- internal -->
      <a id="features.voice-local.WhisperContext"></a>
    - type [Whisper](../../src/voice-local.ts#L27) <!-- internal -->
      <a id="features.voice-local.Whisper"></a>
    - type [MicrophoneClass](../../src/voice-local.ts#L32) <!-- internal -->
      <a id="features.voice-local.MicrophoneClass"></a>
    - fn [loadWhisper](../../src/voice-local.ts#L39) () → Promise<{ module: Whisper } | Exclude<ModuleStatus, { status: "ok" }>> <!-- internal -->
      <a id="features.voice-local.loadWhisper"></a><br>`@fugood/whisper.node` with its platform binary: the package itself loads the binary only on first use, so the check loads it, and a package without a working binary is not reported as installed.
      - calls [features.voice-local.optional](features.md#features.voice-local.optional), [features.voice-local.quietly](features.md#features.voice-local.quietly)
    - fn [localStatus](../../src/voice-local.ts#L56) () → Promise<ModuleStatus>
      <a id="features.voice-local.localStatus"></a><br>What `@fugood/whisper.node` can do on this machine.
      - calls [features.voice-local.loadWhisper](features.md#features.voice-local.loadWhisper)
    - fn [localAvailable](../../src/voice-local.ts#L62) () → Promise<boolean>
      <a id="features.voice-local.localAvailable"></a><br>Whether `@fugood/whisper.node` and its binary load on this machine.
      - calls [features.voice-local.localStatus](features.md#features.voice-local.localStatus)
    - fn [loadDecibri](../../src/voice-local.ts#L66) () → { module: { Microphone: MicrophoneClass } } | Exclude<ModuleStatus, { status: "ok" }> <!-- internal -->
      <a id="features.voice-local.loadDecibri"></a>
      - calls [features.voice-local.optional](features.md#features.voice-local.optional)
    - fn [microphoneStatus](../../src/voice-local.ts#L75) () → Promise<ModuleStatus>
      <a id="features.voice-local.microphoneStatus"></a><br>What `decibri` can do on this machine.
      - calls [features.voice-local.loadDecibri](features.md#features.voice-local.loadDecibri)
    - fn [microphoneAvailable](../../src/voice-local.ts#L81) () → Promise<boolean>
      <a id="features.voice-local.microphoneAvailable"></a><br>Whether `decibri` loads on this machine.
      - calls [features.voice-local.microphoneStatus](features.md#features.voice-local.microphoneStatus)
    - fn [defaultMicrophone](../../src/voice-local.ts#L86) () → Promise<Microphone | null>
      <a id="features.voice-local.defaultMicrophone"></a><br>The system microphone through `decibri` (16 kHz, mono, s16le); null when it is not installed.
      - calls [features.voice-local.loadDecibri](features.md#features.voice-local.loadDecibri)
    - fn [transcribeLocal](../../src/voice-local.ts#L108) (modelFile: string, pcm: Int16Array, terms: readonly string[]) → Promise<string>
      <a id="features.voice-local.transcribeLocal"></a><br>whisper.cpp on this machine, window by window, with the glossary as the initial prompt.
      - calls [features.voice-local.loadWhisper](features.md#features.voice-local.loadWhisper), [features.voice-local.quietly](features.md#features.voice-local.quietly), [features.voice.windows](features.md#features.voice.windows), [features.voice.joinWindows](features.md#features.voice.joinWindows)
    - fn [optional](../../src/voice-local.ts#L133) (name: string, load: () => unknown) → { module: unknown } | Exclude<ModuleStatus, { status: "ok" }> <!-- internal -->
      <a id="features.voice-local.optional"></a><br>A package that may be absent or fail to load (a native binding without a prebuilt binary for this platform throws on `require`). Literal specifiers, so the map sees which packages voice may load.
    - fn [quietly](../../src/voice-local.ts#L153) (load: () => Promise<T>) → Promise<({ value: T } | { error: string }) & { warnings: string[] }> <!-- internal -->
      <a id="features.voice-local.quietly"></a><br>Runs `load` with `console.warn` captured: whisper.node warns while it looks for a platform binary, which would draw over the TUI. The warnings become part of a failure's reason.
  - module [voice](../../src/voice.ts#L1)
    <a id="features.voice"></a><br>Voice input (design §7.3 «Голосовий ввід»): PCM (16 kHz, mono, s16le) → text, by a local whisper.cpp model or OpenRouter's audio input. Speech goes into free text by default; a tiny command grammar («крок …», «коли … тоді …», «емітить …») turns into list items with IDs matched…
    - node [external.node](external.md#external.node)
    - analyze [map.analyze](map.md#map.analyze)
    - ir [lang.ir](lang.md#lang.ir)
    - keys [features.keys](features.md#features.keys)
    - parser [lang.parser](lang.md#lang.parser)
    - type [Env](../../src/voice.ts#L23) = Readonly<Record<string, string | undefined>> <!-- internal -->
      <a id="features.voice.Env"></a>
    - type [VoiceConfig](../../src/voice.ts#L25)
      <a id="features.voice.VoiceConfig"></a>
    - type [VoiceEngine](../../src/voice.ts#L30)
      <a id="features.voice.VoiceEngine"></a>
    - fn [modelsDir](../../src/voice.ts#L35) (home: string = homedir()) → string
      <a id="features.voice.modelsDir"></a>
    - fn [localModel](../../src/voice.ts#L40) (home: string = homedir()) → string | null
      <a id="features.voice.localModel"></a><br>The first downloaded whisper model, or null.
      - calls [features.voice.modelsDir](features.md#features.voice.modelsDir)
    - fn [voiceEngine](../../src/voice.ts#L50) (config: VoiceConfig, localAvailable: boolean, env: Env = process.env, home: string = homedir()) → VoiceEngine
      <a id="features.voice.voiceEngine"></a><br>`local`: a downloaded model and the optional `@fugood/whisper.node`; `openrouter`: a key; `auto`: local when its model is there, else OpenRouter with a key. Otherwise what to set up, in one sentence.
      - calls [features.keys.readKey](features.md#features.keys.readKey), [features.voice.localModel](features.md#features.voice.localModel), [features.voice.modelsDir](features.md#features.voice.modelsDir)
    - fn [wav](../../src/voice.ts#L66) (pcm: Int16Array, rate: number = SAMPLE_RATE) → Buffer
      <a id="features.voice.wav"></a><br>A RIFF/WAVE file around 16-bit mono PCM.
    - fn [windows](../../src/voice.ts#L86) (pcm: Int16Array, rate: number = SAMPLE_RATE) → Int16Array[]
      <a id="features.voice.windows"></a><br>Windows of `WINDOW_SECONDS` that overlap by `OVERLAP_SECONDS`; a short recording is one window, an empty one none.
    - fn [seamWord](../../src/voice.ts#L103) (word: string) → string <!-- internal -->
      <a id="features.voice.seamWord"></a><br>A word as the overlap repeats it: case and punctuation differ between windows (`card,` / `Card`).
    - fn [joinWindows](../../src/voice.ts#L108) (texts: readonly string[]) → string
      <a id="features.voice.joinWindows"></a><br>Joins window texts, dropping the words the overlap repeated at a seam: the longest run that ends one window and starts the next.
    - fn [glossary](../../src/voice.ts#L135) (analysis: Analysis, path: string, text: string, line: number) → string[]
      <a id="features.voice.glossary"></a><br>At most 30 IDs near the cursor: those of the current flow, the neighbours of the IDs on the cursor line, and those IDs last — the end of a prompt weighs most.
      - calls [lang.parser.parse](lang.md#lang.parser.parse), [lang.ir.sectionNodes](lang.md#lang.ir.sectionNodes), [lang.ir.walk](lang.md#lang.ir.walk)
    - fn [spoken](../../src/voice.ts#L159) (id: string) → string <!-- internal -->
      <a id="features.voice.spoken"></a><br>The words people say for an ID: its last segments split at case and separators.
    - fn [matchId](../../src/voice.ts#L175) (words: string, ids: readonly string[]) → string | null
      <a id="features.voice.matchId"></a><br>The ID whose spoken form holds every word (the fuzzy match of completion). Several such IDs are ambiguous unless exactly one is said in full («order total» for `domain.order.total` beside `domain.order.totalTax`); then null, and the words stay as said.
      - calls [features.voice.spoken](features.md#features.voice.spoken)
    - fn [speechToSpec](../../src/voice.ts#L192) (text: string, ids: readonly string[], indent = "") → string
      <a id="features.voice.speechToSpec"></a><br>«крок X» → `- step <id>`, «коли A тоді B» → `- when A` + ` - then B`, «емітить X» → `- emits X` (also `step`, `when … then …`, `emits`); anything else stays free text. A step whose ID does not match stays as said.
      - calls [features.voice.matchId](features.md#features.voice.matchId)
    - fn [transcriptOf](../../src/voice.ts#L204) (reply: string) → string <!-- internal -->
      <a id="features.voice.transcriptOf"></a><br>The text of an OpenRouter chat completion; anything else (not JSON, an error with status 200) is an error that says so.
    - fn [transcribeOpenRouter](../../src/voice.ts#L219) (engine: Extract<VoiceEngine, { kind: "openrouter" }>, pcm: Int16Array, terms: readonly string[]) → Promise<string>
      <a id="features.voice.transcribeOpenRouter"></a><br>One OpenRouter chat completion per window, with the glossary as the prompt; an empty recording sends nothing.
      - calls [features.voice.windows](features.md#features.voice.windows), [features.voice.wav](features.md#features.voice.wav), [features.voice.transcriptOf](features.md#features.voice.transcriptOf), [features.voice.joinWindows](features.md#features.voice.joinWindows)
