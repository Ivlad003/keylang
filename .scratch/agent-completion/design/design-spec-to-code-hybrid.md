# Design: `spec-to-code --mode hybrid` and TUI/prompt flows that use the agent

All file:line references were re-checked against HEAD. Probes are in `/tmp/claude-1000/-home-kosmodev-pet-project-keylang/84bcd598-07f5-4d0f-99b0-ee5f051b0245/scratchpad/probes/` (`s2c-probe.ts`, `ctx-probe.ts`, `static-probe.ts`, `hybrid-validate-probe.ts`, `hybrid-validate-probe2.ts`). No repository files were changed.

## 0. Critical path and dependencies

- **Hybrid works with any `LlmClient`.** It can ship before the `cli:*` provider slice and runs on the existing `anthropic:`/`openrouter:` path. It needs three small, shared additions to the provider seam, listed in §4.1: `LlmRequest.signal`, `LlmClient.readsRepo`, and the `KEYLANG_AGENT` recursion guard. The provider slice owns the child process, the read-only flags, `cwd = root`, and the config regex at `src/config.ts:234`.
- **Package names come from the deps slice.** Hybrid needs the names of the packages `package.json` declares, as `declaredPackageNames(root)` (§4.2). The deps slice also plans to put declared packages on `Analysis`, so whichever lands first adds the function and the other reuses it.
- **Blocker for changing the default:** `tests/draft.test.ts:477` configures `agent`, and `:490` then runs `spec-to-code --apply` with no mock and without overriding `HOME`. With hybrid as the default, that test would read a real key and call the network. Pin it to `--mode algo` in the same change.
- **Public contract changes:**
  - a `spec-to-code --mode hybrid` value, a new effective default, and a `--prompt` flag;
  - the `specToCode()` signature (`mcp.ts:258` and `cli.ts:520` are the only callers);
  - new TUI keys `a` and `Ctrl+X`, and `Ctrl+Space` becoming context-sensitive;
  - the harness text changes to `--mode algo`.
  - MCP stays unchanged.

## 1. Verified current state

**CLI**
- `--mode` accepts only `algo|llm` (`cli.ts:510`) and defaults to `algo` (`cli.ts:265`).
- `llm` mode makes two model calls, one for the body and one for the tests (`spec-to-code.ts:79`, `:172`). The model's code block is appended to the file (`:80`).
- The only check on the answer is a regex for the function's name (`spec-to-code.ts:260-261`).

**What llm mode accepts today (probe `s2c-probe.ts`)**
- A body that does not parse passes with exit 0. It is even reported as **K202** (implemented): the overlay snapshot records a `parse-error` gap, but nothing refuses it (`graph.ts:316-317`).
- A changed signature passes too. K201 is only printed.
- An import of an undeclared package or a missing local file passes. It only becomes an `unresolved-import` coverage item.

**TUI**
- There is no spec-to-code entry. The user runs the CLI and then presses `m` (`tests/tui.test.ts:571-575`).
- `merge-session.ts:127-131` already merges code proposals against the file on disk.
- `Ctrl+Space` in view drafts only the flow under the cursor, from its `trigger` (`assist.ts:280-350`, `app.ts:880`). There is no free-text prompt to the agent.
- `Ctrl+G` is deterministic and uses no model (`tui/text-to-spec.ts`).
- The palette has no agent entries (`app.ts:1501-1503`), although `design.md:343` promises "дія на `planned` або палітра `:`" (an action on `planned` or the `:` palette).
- Agent work cannot be cancelled. `Assist.close()` only stops the ghost timer and the microphone (`assist.ts:96-99`). Progress is one message, which is cleared on the next key (`app.ts:770`).

**MCP**
- `scaffold` calls `specToCode(analysis, id, into)` with no model (`mcp.ts:248-281`).
- `design.md:588` already puts "LLM-режим `scaffold` через MCP" (an LLM mode for `scaffold` over MCP) out of v1.

**Harness**
- The CLI fallback text is `keylang spec-to-code <id> --print` (`adapters/harness.ts:134`, `resources/keylang-feature/SKILL.md:31`).

**Reusable pieces that already exist**
- `parsesCleanly(path, src)` (`extract/bodies.ts:26-28`). `features` may import `extract`; only `lang`, `check` and `tui` are denied it (`keylang/rules.md`).
- `contextForIds()` (`agent-context.ts:61`). Probe `ctx-probe.ts`: for a planned id, its callers and its callees, it returns the node summaries, the callers' code, the flow text and the tests (≈328 tokens).
- K202 at the plan's span means "implemented, with a compatible signature" (`flows.ts:640-647`).
- Imports resolve as `external` when the package is declared **or installed** (`imports.ts:88`, `:262`). The declared-only rule of decision 4 therefore needs its own check.
- The static verdicts of steps nested under the planned fn check the body deterministically. Probe `static-probe.ts`: the stub gives `static fail infra.db.save: absence…`; a body that calls it gives `static ok infra.db.save: called from app.refund.refund`.

## 2. Semantics of `--mode hybrid`

This matches the "каркас так, текст ні" (skeleton yes, text no) row of `design.md:279`.

### Step 1: the scaffold
Exactly today's algo candidate: the same pre-checks, stub and test stubs (`spec-to-code.ts:51-80`, `:143-183`). It skips the stub's own overlay analysis, which algo still does.

### Step 2: one agent call
The request is deterministic, built by `hybridRequest()`.

**System prompt:**
- Keep `<name>` and the signature exactly as in the stub's first line. Replace the body that throws `not implemented: <id>`.
- Keep every line the file already has, and do not change its other declarations. Imports and private helpers may be added.
- Import only repository files, the standard library, and these declared packages: `<names|none>`.
- Keep every test name, and replace the placeholder assertions.
- Answer with one fenced block per file, each holding the whole file, with the info string `<lang> path=<file>`.
- When `readsRepo` is set: "You may read files of this repository; do not edit, create or delete files, and do not run commands."

**User prompt, in this order:**
1. `Planned: <id> <signature> (<plan file>:<line>)`.
2. `The flow expects <id> to call, in order: <id> <signature> [file, import "<rel>"]…`, from the steps nested under `id`. The walk mirrors `callersInFlows` (`spec-to-code.ts:203-213`).
3. `Called from: …`.
4. `Types in the signature: Order → domain.order.Order in src/domain/order.ts (import "../domain/order.ts")`, for each identifier that matches exactly one snapshot `type` node.
5. `Context:` followed by `contextText(contextForIds(analysis, [id, ...callees, ...callers]))`.
6. `Scaffold:` followed by each file of the scaffold, whole and with LF line endings.
7. `The developer asks: <instruction>`, only when there is one.

### Step 3: parse and validate
- **Parsing (`answerFiles`).** Fences are anchored to whole lines: `/^```([^\n`]*)\n([\s\S]*?)^```[ \t]*$/gm`. The path comes from `path=`. A single unlabelled block is the code file.
  - A block for any other path is ignored, with a note.
  - A missing test block keeps the scaffold's test, with a note.
- **Contract problems** (checked in probe `hybrid-validate-probe.ts`):
  1. The code block is missing.
  2. `parsesCleanly` fails for the code file or a test file.
  3. The answer still contains `not implemented: <id>`.
  4. The original file's lines are not a subsequence of the answer (greedy check, O(n+m)).
  5. The fingerprint of an existing fn or type in the file changed. This also catches lines inserted inside another declaration.
  6. No K202 at the plan's span in the overlay analysis. The K201 message is used when there is one; otherwise "no fn `<id>`".
  7. A new **exported** declaration in the module that no `planned` declares.
  8. A new `external.*` module that is not `external.node` and not declared in `package.json` (probe 2: an installed but undeclared `left-pad` is caught).
  9. A new `unresolved-import` gap in the file (a missing local file, or a package that is neither declared nor installed).
  10. A declared test name is missing. This is the existing rule at `spec-to-code.ts:197`.
- **Findings problems:**
  - error-level diagnostics that the candidate adds (`introduced()`, `:91-97`);
  - `static` verdicts that are not `ok` for steps nested under `id`.

### Step 4: at most one retry
If there is any problem, the agent gets one more call. The prompt is the original plus `Your answer:`, then `Problems:` as a list, then "Answer again with the whole files." This is the one-round rule of `design.md:286`.

After the retry:
- contract problems remaining → throw `the agent's answer …: <problems>; nothing written` (exit 2);
- findings remaining → added to `notes`, and the candidate is kept.

### Step 5: write
The write paths are those of algo:
- **default:** proposals;
- **`--print`:** nothing is written;
- **`--apply`:** `safeWriteAll` with `expect: before` (`cli.ts:543`), so an edit made during the agent call is never overwritten.
- In the TUI the candidate goes to MERGE, hunk by hunk.
- Hybrid-only rule (see Q2): `--apply` refuses a candidate that adds an error-level diagnostic, and points to the proposal path instead.

### Default mode (recommended)
The effective default is `hybrid` when `config.agent !== null`, and `algo` otherwise. Without an agent the output is silent and byte-identical to today.
- An explicit `--mode hybrid` with no model, or a configured agent with missing credentials, falls back to algo with the note `keylang: <missing>; the template only: stub and failing tests (--mode algo)`.
- `--mode algo` and `--mode llm` keep their current behaviour.
- The same validator is recommended for llm mode (at least the parse check), because a syntax error currently passes.

## 3. What "ready-to-use" covers in v1

- **In scope:**
  - The planned fn's file (new, or appended to an existing module file), including the imports its body needs:
    - local imports must resolve;
    - packages must be declared in `package.json` (decision 4);
    - built-ins are allowed.
  - New test files that algo scaffolds (TS/JS only).
  - keylang never edits `package.json`.
- **Out of scope, reported as notes:**
  - **Wiring callers.** Callers found by `callersInFlows` whose step is still not static ok get the note: "flow `refund`: `app.checkout.checkout` does not call `app.refund.refund` yet; spec-to-code does not edit callers."
  - **Existing test files.** These stay notes, as today (`:155-157`).
  - **Running tests.** keylang never runs generated code; `check` reads the reports later.
- **v2 sketch:**
  - `--wire`: the caller files as extra candidates. Only the declarations of the named callers may change, and the flow step must become `static ok` in the overlay.
  - Insertion-only additions to existing test files, validated by the same subsequence check.

## 4. Code changes

### 4.1 `src/llm.ts` (seam shared with the provider slice)

```ts
export interface LlmRequest { system: string; prompt: string; maxTokens: number;
  /** TUI Ctrl+X / session close; a `cli:*` provider kills its process. */ signal?: AbortSignal }
export interface LlmClient { agent: string; model: string;
  /** Runs in the repository and may read it itself (cli:*, read-only). */ readsRepo?: true;
  complete(request: LlmRequest): Promise<string> }
```

- `anthropicComplete` (`:76`) and `openrouterComplete` (`:105`) use `AbortSignal.any([AbortSignal.timeout(t), request.signal])`. When `request.signal.aborted` is set, they rethrow with `request.signal.throwIfAborted()`.
- The provider slice must set `KEYLANG_AGENT=<agent>` in the child's environment. When `KEYLANG_AGENT` is set, `llmClient` reports `cli:*` as missing, so a nested keylang never spawns another agent.

### 4.2 `src/declared-packages.ts`
Add `declaredPackageNames(root): string[]`: the names from the same manifests, sorted. `declaredExternalIds` is rebuilt on top of it. The scope fix (honour `exclude`) belongs to the deps slice.

### 4.3 `src/spec-to-code.ts`
All changes stay in this file, so there are no layer or `keylang.json` changes.

```ts
export type SpecToCodeMode = "algo" | "llm" | "hybrid";
export interface SpecToCodeOptions { into?: string; mode?: SpecToCodeMode /* default "algo" */; model?: LlmClient;
  instruction?: string; signal?: AbortSignal; overlay?: ReadonlyMap<string, string>;
  analyzer?: (r: AnalysisRequest) => Promise<Analysis>; progress?: (note: string) => void }
export interface CodeCandidate extends FileCandidate { id: string; mode: SpecToCodeMode; agent?: string; rounds?: 1 | 2;
  tests: FileCandidate[]; testNotes: string[]; notes: string[]; verdicts: Verdict[]; diagnostics: Diagnostic[] }
export async function specToCode(analysis: Analysis, id: string, options: SpecToCodeOptions = {}): Promise<CodeCandidate>
```

- **Replaced:** the positional `(analysis, id, into?, model?)` at `:50`.
- **`overlay`:** the TUI's unsaved spec buffers. They are merged into the candidate's analysis at `:84`, so `introduced()` does not compare against a different spec set.
- **`analyzer`:** the TUI's worker-backed analyzer, instead of an in-process `analyze`.
- **New local helpers:**
  - `stepsUnder(analysis, id)`;
  - `scaffoldHints(analysis, id, file)`: calls, callers, types and packages, pure;
  - `hybridRequest(...)`: pure;
  - `answerFiles(answer, expected)`: pure;
  - `isSubsequence(a, b)`;
  - `contractProblems(base, next, scaffold, plan, files)`;
  - `findingProblems(found, nested)`.
- **Overlay in hybrid:** it covers every candidate file (code and tests). Algo keeps the code file only, so MCP `scaffold` and `--print` stay byte-identical.

### 4.4 `src/cli.ts`
- **Options:** add `prompt: { type: "string" }` to the `parseArgs` options (`:169-199`).
- **Call site (`:265`):** pass `mode: values.mode ?? null` and `prompt: values.prompt`.
- **`cmdSpecToCode` (`:507-548`):**
  - resolves the effective mode after `analyze()` from `analysis.config.agent`;
  - validates `algo|llm|hybrid`;
  - `--prompt` with `algo` exits 2: "--prompt needs --mode llm or hybrid";
  - uses the fallback note from §2;
  - `progress` writes to stderr (`keylang: asking <agent> to finish \`<id>\` from the scaffold…`, and on a retry `…answer has N problem(s); asking once more`);
  - `notes` go to stderr;
  - the next-step text for hybrid is "review the finished code and tests, then run the tests".
- **Machine output:** stdout keeps its current shape.
- **USAGE (`:99-107`):** add `--mode algo|llm|hybrid` (default hybrid with `agent`, else algo) and `--prompt <text>`.

### 4.5 `src/mcp.ts:258`
Call `specToCode(analysis, id, { ...(into ? { into } : {}), mode: "algo" })`. MCP gets no hybrid mode (§6).

### 4.6 `src/draft-llm.ts`
- `draftFlowWithModel(…, context?, instruction?, signal?)`: adds a `The developer asks:` line and passes `signal` through.
- New `draftFromPrompt(analysis, client, { path, text, line, instruction, context?, signal? }): Promise<ModelDraft>`:
  - It reuses `GRAMMAR`, `compactMap` and `similarFlows`, with the pack's node ids as `steps`, plus the one-round `unknownIn` retry.
  - It calls `reconcile(..., trigger: string | null)`, generalised so that without an algo projection every step is `llm-only` or `conflict`.
  - With the cursor inside an existing flow that has no trigger, that flow is replaced by name (`withFlow`). Otherwise a new flow is appended, with its name de-duplicated in the way `distinctNames` (`draft.ts:123`) does.

### 4.7 TUI

**`state.ts`**
- `State.agent: { label: string; agent: string; started: number; round: 1 | 2 } | null`. This is plain data; the `AbortController` stays private in `Assist`.
- `Prompt.kind` gains `"agent"`, plus `Prompt.target?: { kind: "build"; id } | { kind: "flow"; name; trigger } | { kind: "new-flow"; path }`.

**`assist.ts`**
- `private job(label, run: (signal) => Promise<void>)`:
  - one job at a time; a second request gives "agent: busy with <label> (Ctrl+X cancels)";
  - while it runs, a 1 s `setInterval(draw).unref()` redraws; it is not counted in `quiet()`, and `track()` already makes `idle()` wait;
  - `finally` clears the job;
  - an abort gives "agent: cancelled; nothing proposed".
- `cancelAgent()`.
- `close()` aborts the running job, which kills the CLI child.
- `agentDraft(instruction?)` is wrapped in `job`.
- New `buildPlanned(id, instruction?)`:
  1. **Refuse when a proposal already waits** for the code file or a test file (the same rule as `:293`).
  2. **Build the candidate:** `specToCode(analysis, id, { mode: model ? "hybrid" : "algo", model, instruction, signal, overlay: host.overlay(), analyzer: host.analyzer, progress })`. Without an agent the TUI proposes the template at once, with a message.
  3. **Drop a stale result.** Before writing, re-check that each file on disk still equals `candidate.before`, and that `plannedDecl(state.analysis.docs, id)` still has the same signature. If either changed, drop the result with a message.
  4. **Write and open.** `writeProposal` writes each file. If the session is still at its spot, `openProposal(code file)` opens MERGE for the code; otherwise the message is "…is a proposal: m merges it". Notes go into `state.message`.
- `AssistHost` gains `overlay()` and `analyzer`.

**`app.ts`**
- `viewKey` (`:880`): `Ctrl+Space` on an unimplemented `planned fn` calls `assist.buildPlanned(id)`. The id comes from `idAtCursor()` (`:730`) or the `planned` node on the cursor line. Anywhere else, `Ctrl+Space` is `agentDraft()` as today.
- New key `a` in view (currently free in the `viewKey` switch): opens the `agent` prompt, with its target resolved at open time.
- `promptKey` Enter on an `agent` prompt dispatches to `buildPlanned`, `agentDraft` or `draftFromPrompt`.
- `handle()` (`:772`): `Ctrl+X` (`\x18`) calls `cancelAgent()` from any mode, but only while a job runs.
- `commands()` (`:1501`) gains `build <id> with the agent` for each unimplemented planned fn (sorted), `ask the agent (a)`, and `cancel the agent`. `runCommand` (`:1515`) handles the `build ` prefix and `cancel the agent` the way it handles `open `.

**`view.ts`**
- Status line segment after proposals (`:567`): `⟳ <label> · <agent> · <n> s · Ctrl+X cancels`.
- `drawPrompt` label `agent → build <id>: `.
- The `HELP.view` (`:455-467`) and `HINTS` (`:515`) tables get the new keys.

### 4.8 Harness text
`adapters/harness.ts:134` and `SKILL.md:31` become `keylang spec-to-code <id> --mode algo --print`. A harness is the implementer and must never trigger a nested agent. The block grows by about 12 B and stays well under `BLOCK_LIMIT` (`:37`).

### 4.9 Map
The signatures change, so run `node bin/keylang.js map`, review the diff, then `map --check` and `check`.

## 5. Docs

| File | Section | Change |
|---|---|---|
| `docs/tools.md:21` | commands table, `spec-to-code` row | Add hybrid and the new default. |
| `docs/tools.md:35` | the `spec-to-code` sentences and the `--mode llm` sentence | Describe hybrid: the scaffold, the answer format, the contract list, the one retry, the notes, the stricter `--apply`, `--prompt`, the fallback note, and that a `cli:*` agent reads the repository. |
| `docs/tools.md:97` | MCP `scaffold` bullet | It equals `spec-to-code --mode algo --print`; there is no hybrid over MCP, because the calling agent finishes the scaffold. |
| `docs/tools.md:128+` | TUI keys table (view row), the `Ctrl+Space` paragraph, MERGE ("spec-to-code from the CLI or `Ctrl+Space`"), status line | Add `a`, context-sensitive `Ctrl+Space`, `Ctrl+X`, and the progress indicator. |
| `docs/design.md` | §5.3, §5.5 table and `:343` | Hybrid for spec-to-code; mark the TUI action and palette as implemented. |
| `docs/design.md` | §7.3 "Агент → людина" (agent → human) | Document the `a` prompt, progress and cancel. |
| `docs/design.md` | §7.6 `:588` | Keep the MCP exclusion and add the reason. |
| `docs/adr/0008-spec-to-code-hybrid.md` (number to be agreed with the provider slice) | new | Whole-file answers with the subsequence and fingerprint rules; default hybrid only when an agent is set; target file plus new tests only; one retry; no MCP hybrid; stricter `--apply`. |

`docs/format.md` needs no change: the language does not change.

## 6. MCP: no hybrid variant

- The harness is already step 2 of hybrid: `scaffold` gives the template and the calling agent finishes it.
- A model call inside a tool call would recurse (Claude Code → `keylang mcp` → `claude -p`), pay twice, and run past MCP tool timeouts. The research report [ext] gives Codex's `tool_timeout_sec` default as 60 s.
- `design.md:588` already excludes it.
- **Optional additive change:** a `hints` field on the `scaffold` output (`{calls, types, packages}` from `scaffoldHints`). It gives harness agents the same deterministic guidance, and a test only needs one extra assertion.

## 7. E2E tests (offline)

### CLI: `tests/draft.test.ts`
These reuse `copy`, `mockModel` and `run`. The fixture is `tests/fixtures/repo` plus:
- `package.json` `{"name":"fixture","dependencies":{"zod":"^4.0.0"}}`;
- `agent: anthropic:claude-opus-5`;
- a flow `planned fn app.refund.refund (order: Order) → Order` / `trigger app.refund.refund` / `  - step infra.db.save` / `  - test tests/refund.test.ts "refund returns the order"`.

1. **"spec-to-code --mode hybrid: the agent gets the scaffold and finishes it; --print writes nothing, the default proposes, --apply writes."** The mock answers blocks for `src/app/refund.ts` (imports `type Order` and `save`, calls `save`) and `tests/refund.test.ts`.
   - **`--print` with no `--mode`** (checks the new default):
     - status 0 and `prompts.length === 1`;
     - `prompts[0]` contains `path=src/app/refund.ts`, `throw new Error("not implemented: app.refund.refund")`, the test stub's `assert.fail`, `# flow refund`, `to call, in order: infra.db.save`, and `packages: zod`;
     - stdout shows the finished body, `ID ok app.refund.refund` and `static ok infra.db.save`, and no K201;
     - stderr says `nothing written`;
     - neither `.keylang/` nor `src/app/refund.ts` exists.
   - **Default run:** both proposals equal the agent's files.
   - **`--apply`:** the files are written with that exact text.
2. **"…an answer that breaks the scaffold goes back once, then nothing is written; without an agent the default is the template."** The mock answers twice: the signature is changed, `left-pad` is imported, and there is no test block.
   - `--apply` exits 2 with `prompts.length === 2`. `prompts[1]` matches `Problems:`, the K201 text and `left-pad`. stderr says `nothing written`. No file or proposal exists.
   - `--prompt x --mode algo` exits 2.
   - `--mode fast` exits 2 and names `algo, llm or hybrid`.
   - With `agent` removed:
     - the default `--print` stdout equals `--mode algo --print`, and stderr has no model note;
     - `--mode hybrid --print` exits 0 with `template only (--mode algo)`.
3. **After the provider slice, with a fake `claude` binary** (a Node script in `<tmp>/bin`, prepended to `PATH`, that records argv, cwd, stdin and `KEYLANG_AGENT` to a file outside the repository, then prints the canned answer), assert:
   - the read-only flags are in argv;
   - `cwd` is the root;
   - `KEYLANG_AGENT` is set;
   - stdin or the prompt contains the stub;
   - with `--print`, the tree bytes are unchanged.
   No real CLI is run.

### TUI: `tests/tui.test.ts`
These use `session()` and the in-process `mockModel` (`:980-1004`), on `checkoutRepo` with a `planned fn application.refund.refund` flow, a nested `step infrastructure.store.save`, a test line and `agent` set.

4. **"tui: Ctrl+Space on a planned fn: the agent finishes the scaffold, the code opens as MERGE; nothing is written before w."**
   - One prompt, and it contains the stub.
   - `mode === "merge"` and `lines()[1]` matches `MERGE src/application/refund.ts · code`.
   - The code file does not exist yet, and both proposals do.
   - After `a…` and `w`, the file equals the agent's text, the analysis has `static ok` for `infrastructure.store.save`, and the status line shows `≈ 1 proposal(s): m`.
5. **"tui: a asks the agent with the person's words; a slow agent shows progress; Ctrl+X cancels without a proposal."** The mock delay is about 2 s, and its timer is cleared in `t.after`.
   - The prompt label is `agent → build application.refund.refund`.
   - The instruction is typed and sent with Enter.
   - The status line matches `build application\.refund\.refund · anthropic:claude-opus-5 · \d+ s · Ctrl\+X cancels`.
   - `prompts[0]` has `The developer asks: use the store`.
   - After `\x18` and `idle()`: the message says `cancelled; nothing proposed`, `state.agent` is null, and `.keylang/proposals` does not exist.
6. **Part B: "tui: a outside a triggered flow writes a new flow from the words as MERGE."** The flow lines carry `status=llm-only` provenance, and nothing is written before `w`.

### Existing tests to update
- `draft.test.ts:490`: add `--mode algo` (required).
- `mcp.test.ts:241`: compare with `--mode algo --print`. Optionally, pass `HOME: dir` to `StdioClientTransport` together with `agent` set, which proves `scaffold` never calls a model.

## 8. Risks

- **Nested agents.** Covered by the harness `--mode algo` text, the `KEYLANG_AGENT` guard, and no MCP hybrid. A user who runs the CLI by hand inside a harness terminal can still start one.
- **Latency and cost.** A CLI agent takes seconds to minutes, and a retry doubles the time. There is no streaming progress; the indicator only shows elapsed time.
- **Whole-file answers for large existing module files.** The echo costs tokens, and truncation leads to a parse failure and a refusal.
- **Validator blind spots.**
  - A pure insertion inside a top-level non-declaration (such as an object literal) passes. It is visible in the diff and in MERGE.
  - Detecting exports in Python and Rust depends on each language's conventions.
  - `declaredExternalIds` counts nested manifests (`bench/**`) and ignores the `-2` collision suffixes, so it can wrongly accept or refuse a package until the deps slice lands.
- **Read-only access** is enforced by each CLI's flags, not by keylang. A CLI agent also sees the whole repository, secrets included, where an API model sees only the context pack. This must be documented.
- **Prompt injection** from the repository or the spec into the agent. The mitigation is read-only tools, validation, and human MERGE.
- **The TUI analysis can be stale** or include unsaved buffers. Handled by passing the overlay and re-checking the plan's signature and the disk before writing.
- **`--apply` in hybrid is stricter than in llm mode.** It must be documented.
- **Timing-sensitive TUI tests.** `render` uses `Date.now()`, so assert with regexes.

## 9. Open questions

1. **Default mode.**
   - (a) hybrid only when `agent` is set, otherwise silent algo (recommended);
   - (b) always hybrid with a note, like `draft`;
   - (c) keep algo.
2. **Should hybrid `--apply` refuse new error-level diagnostics** (K102, K201…)? Recommended: yes; proposals and `--print` keep them visible.
3. **Refuse new exported declarations that were not planned?** Recommended for v1: refuse.
4. **Insertion-only edits to existing test files**, in v1.1?
5. **`--wire` for callers in v2**, validated by "the step becomes static ok"?
6. **Deprecate `--mode llm`** in favour of hybrid later?
7. **Keys.** Is `a` in view the prompt key, or should it be `Alt+A`? Is it acceptable that `Ctrl+Space` on a planned line builds code instead of drafting the flow?
8. **Add `hints` to MCP `scaffold` in this slice?** Recommended: yes; it is additive.
9. **A CLI parity flag, `draft flow --prompt`?**
10. **Should a sandboxed CLI agent run the tests** to confirm the code is ready? Recommended: no in v1; keylang never runs generated code.