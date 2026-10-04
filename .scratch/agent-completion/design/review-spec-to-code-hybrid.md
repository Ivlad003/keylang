# Review of the `spec-to-code-hybrid` design

The design needs fixes before implementation. I found 3 high, 8 medium and 7 low defects. The biggest: the dependency check rejects standard-library imports in Python and Rust, the answer format makes large existing files fail, and `--print` cannot promise "nothing written" once a `cli:*` agent runs.

## High

**H1. Check 8 rejects standard-library imports in Python and Rust.**
- Evidence:
  - `src/python-imports.ts:47`: any import that is not in the repository becomes `{kind:"external", pkg: segments[0]}`, so `import os` becomes `external.os`.
  - `src/rust-imports.ts:82-83`: `std`, `core` and `alloc` are `TOOLCHAIN` crates and become `external.std` and so on.
  - `src/declared-packages.ts:1-3,32-33` reads no Python manifest and no toolchain crates. Only `external.node` is exempt (`graph.ts:366`).
  - `stubFor` does produce `.py` and `.rs` targets (`spec-to-code.ts:232-240`).
- Result: every Python body that imports the standard library, and every Rust body with `use std::…`, fails a contract check. That means a retry and then exit 2. This is also against decision 3 (Rust/Python at package level only).
- Fix:
  - Run check 8 only for JS/TS files.
  - For Rust, allow `TOOLCHAIN` crates plus Cargo `crate.deps`, which the Rust resolver already limits to declared crates.
  - For Python, skip the check and add a note ("Python dependencies are not checked against a manifest").
  - Add a Python case to the tests.

**H2. Whole-file answers break on large existing files, and the retry spends a second call on the same failure.**
- Evidence:
  - The design sets no `maxTokens`. Today's llm mode uses 8192 (`spec-to-code.ts:191,256`).
  - `anthropicComplete` ignores `stop_reason === "max_tokens"` (`llm.ts:94-100`). A truncated answer has no closing fence, so it becomes "code block missing", then a retry, then the same truncation, then exit 2.
- The design's own rules make echoing the file pointless. Every original line must stay (check 4), only imports and helpers may be added, and existing declarations must keep their fingerprints (check 5).
- Fix:
  - For an existing file, ask for additions only: one block `path=<file> part=imports` with new import lines, and one `part=append` block with the declarations. keylang puts the imports after the last top-level import and appends the rest. This makes the subsequence check, the CRLF handling (M6) and most of the token cost unnecessary.
  - Keep whole-file blocks for new files and new tests.
  - Surface `max_tokens` as its own error and skip the retry for it.
  - Size `maxTokens` from the input: a floor of 8192 and a cap of 32000.
  - Probe the SDK's non-streaming limit before raising the cap. The client passes an explicit `timeout`, so the SDK's 10-minute guard probably does not fire, but this is not verified.

**H3. `--print` and the default run cannot keep their "nothing written" promise with a `cli:*` agent.**
- Evidence: `--print` "нічого не створює" (creates nothing) is a documented contract (`docs/tools.md:35`). The design leaves read-only access to each CLI's flags (§8). Its test 3 only proves that a well-behaved fake binary writes nothing.
- In proposal mode an agent could change `src/app/refund.ts` directly, and keylang would still write a proposal over it without noticing. `--apply` is protected only by `expect: before` (`cli.ts:543`).
- Fix: when `model.readsRepo` is set, `specToCode` hashes before and after the call:
  - the candidate files;
  - `.keylang/proposals/**`;
  - the spec directory;
  - the list of tracked files (`git ls-files -m -o --exclude-standard` if git exists, otherwise a walk of the layer globs).

  Any change gives exit 2: "the agent changed <files> during the call; keylang wrote nothing". Test 3 should use a fake `claude` that does write a file and assert exit 2.

## Medium

**M1. In the TUI, the base analysis has evidence and the candidate does not, so `introduced()` sees false differences.**
- Evidence: the TUI analyses with `this.analyzer({ root, overlay })` and no `withoutEvidence` (`app.ts:293`). `specToCode` analyses the candidate with `withoutEvidence: true` (`spec-to-code.ts:84`). `introduced()` compares by full verdict key (`:91-97`).
- Verdicts that come from test reports or traces differ between the two, so findings appear that the candidate did not cause. That leads to retries and notes.
- Fix: add `SpecToCodeOptions.evidence: boolean` (default `false`). The TUI passes `true`, or passes a base analysis it built with the same flags. Assert in TUI test 4 that nothing is introduced beyond K202 and the static ok.

**M2. A findings retry is guaranteed when a nested step targets another unimplemented `planned` fn or an external package.**
- Evidence: "static verdicts that are not ok for steps nested under `id`" are findings problems (§2, step 3). A callee that is only planned has no code, so its step can never be `static ok`, and every hybrid run on a multi-fn plan pays for a second call.
- Fix: only steps whose target is in `snapshot.nodes` and not unimplemented-planned count as problems. Others become a note: "`<callee>` is planned; call it after `spec-to-code <callee>`". The hint in item 2 of the prompt should say the same.

**M3. Check 7 (unplanned exported declaration fails the contract) wrongly rejects common signatures.**
- A signature can name a type that exists nowhere, for example `→ Refund`. The agent must then declare it. If it exports the type, check 7 refuses the answer (exit 2). If it does not, TS declaration emit fails (TS4060) and keylang does not notice.
- In Python every top-level `def` without an underscore counts as exported, so any helper is refused.
- Fix:
  - Make check 7 a finding (a note, so the candidate is kept), not a contract check.
  - Explicitly allow exported types named in the planned signature when no snapshot node matches them.
  - For Python, count only names in `__all__`, or skip the check.

**M4. The prompt must go over stdin, which the design does not require.**
- The hybrid prompt holds whole files, the context pack and the scaffold. Test 3 says "stdin **or** the prompt contains the stub", which leaves argv open.
- On Linux one argv string is limited to 128 KiB (`MAX_ARG_STRLEN`), and a large argument would also show in `ps`.
- `claude -p` reads stdin (`--input-format` in `claude --help`). Codex 0.155.1 and opencode 2.0.18 are installed; their stdin forms still need a `--help` check in the provider slice.
- Fix: make it a requirement of the seam: `cli:*` providers pass the prompt only on stdin and pass a fixed argv. Test 3 asserts that the stub is in the recorded stdin and in no argv element.

**M5. Test 1 checks the user prompt for something the design puts in the system prompt.**
- Test 1 asserts `prompts[0]` contains `packages: zod`. But §2 puts "declared packages: `<names|none>`" in the **system** prompt, and both `mockModel` helpers record only `messages[0].content` (`tests/draft.test.ts:69`, `tests/tui.test.ts:986`).
- Fix: add a user-prompt line `Declared packages: zod` (it can stay in the system prompt too), or extend `mockModel` to record `system` as well.

**M6. CRLF and whitespace handling are undefined.**
- The design shows the scaffold "with LF", but does not say that `before` is LF-normalised before the subsequence check. It also does not say that the answer is turned back into CRLF when `allCrlf(before)` (`spec-to-code.ts:81-82`); today's test `draft.test.ts:486-493` depends on that.
- A trailing space or a missing final newline in the answer fails the exact line match.
- H2's additions-only answer avoids all of this. Otherwise, compare lines with `trimEnd` and re-apply CRLF.

**M7. The TUI drops the person's curated context pack.**
- Evidence: `agentDraft` uses `host.contextPack()` (`assist.ts:321-322`), which respects additions and `x` removals in the context panel (`app.ts:1193-1199`). Hybrid calls `contextForIds` itself.
- Fix: add `SpecToCodeOptions.context?: string`. The TUI passes `contextText(pack)` when a pack exists; otherwise `contextForIds` is used.

**M8. Conflicts with the working tree.**
- `docs/adr/0008-shared-workspace-operations.md` already exists, untracked, and `docs/design.md` is modified (`git status`). ADR "0008-spec-to-code-hybrid" collides.
- Fix: use 0009 or later, agreed with the provider slice. Mark edits to `design.md` as touching the user's uncommitted WIP; they must not overwrite it.

## Low

- **L1.** `Ctrl+X` is `{ctrl:true, name:"x"}` after decoding (`input.ts:133`), not `"\x18"` in `handle()`. Put the check before `if (this.state.prompt)` (`app.ts:777`) so it also works while a prompt is open.
- **L2.** `buildPlanned` does not re-check for a waiting proposal after the call. `agentDraft` does (`assist.ts:323-326`); add the same check.
- **L3.** The exit code of the hybrid `--apply` refusal (Q2) is not stated. Declare it as 1 (findings), keep 2 for invocation, I/O or contract errors, and document it.
- **L4.** The type-import hint hard-codes `.ts` paths (`"../domain/order.ts"`). NodeNext repositories import `.js`. Copy the extension style of the target module's existing imports, or leave the path out.
- **L5.** `declaredExternalIds` collapses `@a/b` into `a-b` (`declared-packages.ts:20`), so an undeclared `a-b` would pass. Compare real package names from `declaredPackageNames` instead of ids. The design already lists the nested-manifest leak; it applies to this repository's own `tests/fixtures/**/package.json`.
- **L6.** The recursion guard reads only `KEYLANG_AGENT`. A person running `keylang` by hand in a Claude Code terminal gets `CLAUDECODE=1` in the environment. Also treat `CLAUDECODE` as a guard for `cli:claude`, and document it.
- **L7.** `--prompt` joins the global `parseArgs` (`cli.ts:169-199`), and other commands ignore it silently. That matches how `--into` behaves today, so it is acceptable; say so in `--help`.

## Claims that hold

I checked these against the code:
- **CLI and prompts:**
  - `--mode` accepts only `algo|llm` (`cli.ts:510`) and defaults to `algo` (`cli.ts:265`).
  - llm mode makes two calls (`spec-to-code.ts:79`, `:172`); the only answer check is the name regex (`:260-261`); tests must contain the declared name (`:197`).
  - `callersInFlows` is at `:203`.
  - `safeWriteAll(... expect: f.before)` is at `cli.ts:543`.
- **Probe results:** I re-ran `s2c-probe.ts`: `left-pad` and a missing local file both exit 0 with K202 and only an `unresolved-import` gap. K103 is a warning (`diag.ts:50`), so it does not trigger findings retries.
- **Resolution:** K202/K201 at `flows.ts:640-647`. The `parse-error` gap is at `graph.ts:316-317`. Declared **or installed** packages resolve as `external` (`imports.ts:88`, `:262`), so decision 4 does need its own check.
- **Layers:** `spec-to-code.ts` is in `features`. Importing `extract/bodies.ts:26` is allowed (only `lang`, `check` and `tui` are denied `extract`). No cycle through `agent-context.ts` or `draft-llm.ts`. The TUI already loads `analyze` in its own process (`app.ts:17`).
- **Blocker test:** `draft.test.ts:477` sets `agent`, and `:490` uses `keylang()` with `process.env` inherited and no `HOME` override (`:17-19`). It must be pinned to `--mode algo`. No other spec-to-code test sets `agent`.
- **MCP and harness:** `scaffold` calls `specToCode(analysis, id, into)` (`mcp.ts:258`). Harness text is at `harness.ts:134` and `SKILL.md:31`; `BLOCK_LIMIT` is 4096 (`harness.ts:37`), with plenty of room. `design.md:588` already excludes an LLM `scaffold` over MCP. ADR 0005 §4 ("the harness is the only one who writes code") supports having no MCP hybrid.
- **TUI:** `Assist.close()` only stops the ghost timer and the microphone (`assist.ts:96-99`). `a` is free in the view `switch`, and no `Ctrl+X` binding exists. The palette `commands()` and `runCommand` are at `app.ts:1501` and `:1515`. The status line proposals segment is at `view.ts:567`. `Prompt.kind` has no `agent` today (`state.ts:103`). `AnalysisRequest.overlay` exists (`analyze.ts:26`).
- **Sound choices:**
  - The effective default is algo when no agent is set, byte-identical to today.
  - `--mode algo` for the harness and for MCP.
  - Answer blocks for any path other than the expected files are ignored.
  - At most one retry.
  - `--apply` writes only if the disk still matches, and the TUI re-checks the disk before writing.
  - The `AbortSignal` and `readsRepo` seam.
  - `docs/format.md` needs no change.
  - Offline e2e tests through the real CLI and TUI harnesses, with mock servers.