# Final implementation spec: agent-CLI provider, declared dependencies, npm symbols, spec-to-code hybrid

I re-checked the key anchors at HEAD: `src/config.ts:233-235,146-147`, `src/llm.ts:18-44`, `src/tui/assist.ts:96-146`, `src/lsp.ts:293`, `src/lsp-features.ts:533-560`, `src/cli.ts:261-266,507-511`, `tests/draft.test.ts:474-493`, `tests/tui.test.ts:980-1004`, `keylang.json`, `keylang/rules.md`, and `ls docs/adr`. The reviews' corrections are applied, and where two slices disagreed, the choice is recorded in §2.

Numbers at the critical path:
- **ADR numbers.** 0007 exists and 0008 is the user's untracked WIP. New ADRs take **0009–0012**.
- **ID blocker.** A declared-only package step is `ID fail` today. Step 3 fixes this, and steps 5–7 depend on it.

Steps 1–2 (provider) are independent of steps 3–7 (dependencies and symbols). Steps 8–10 (hybrid) need step 1 and, for the guard, step 2. Step 8 uses the declared-packages data from step 3 (`Analysis.packages`) for the dependency check, so it runs after step 3.

---

## 1. Public contract changes

| # | Contract | Change | Doc file / section | Backward compatible |
|---|---|---|---|---|
| C1 | `keylang.json` `agent` | Also accepts `cli:<name>[:<model>]`. The model may contain no whitespace, `<`, `>` or `--`, and must not start with `-`. The error names all three forms. | `docs/tools.md` "Команди" (`:35`), plus the new section `## Модель: API або агент-CLI` | Yes (additive) |
| C2 | **Effective agent** | Precedence: env `KEYLANG_AGENT` > `~/.config/keylang/agents.json` `"use"` > `keylang.json` `agent`. A `cli:` value takes effect only from the two user-level sources. A `cli:` in `keylang.json` becomes `{missing}` with a hint (review H2; open question Q1). | tools.md model section; ADR 0009 | Yes |
| C3 | New user file `~/.config/keylang/agents.json` | `{ "use"?: string, "clis"?: { [name]: { command: string[] } \| { bin: string } } }`. Placeholders are `{prompt_file}` and `{model}`. A preset name takes only `bin`. Unknown fields are errors that name the field. | tools.md model section | New |
| C4 | Env vars | `KEYLANG_AGENT` (selection). `KEYLANG_NESTED=1` is set in every agent child. When it is set, `cli:*` is `{missing}`, which blocks recursion. | tools.md model section | New |
| C5 | `Config.ghost.delay` | The type becomes `number \| null`, with `null` meaning default. The default is 1500 ms for a `cli:` agent and 400 ms otherwise, resolved in `Assist`. An explicit value still wins. | tools.md TUI ghost paragraph (`:148`) | Yes for users. Internal type change. |
| C6 | `explain --jobs` | The default is 2 for a `cli:` agent, 4 otherwise. | `cli.ts` help (`:89`), tools.md `:35` | Yes |
| C7 | `doctor` | New `agent:` line format, including the value's source, plus a line `agent CLIs: claude 2.1.284 · codex … · opencode … · cursor —`. | tools.md `doctor` row (`:25`) | Text output only |
| C8 | Ghost cancellation | A superseded or left ghost request is aborted, and a CLI child is killed. | tools.md `:148` | Yes |
| C9 | **Language semantics: declared packages** | Only manifests at the root or on ancestors of analysed files count, and `exclude` is honoured. Python manifests are not read. Workspace packages (`workspace:`, `file:`, `link:`, `portal:`, or a name matching a root `workspaces` package) are not external. `@types/x` counts as `x`. | `docs/format.md` §6 (`:421`), Р13 (`:441`); ADR 0010 | **No** for references known only via a nested or excluded manifest, which become K001. Argued as a bug fix under ADR 0007 because `format.md:421` already says "between a code file and the root" (Q2). Flag in the PR. |
| C10 | External ID collisions | Suffixes are computed over declared ∪ imported package names. `EXTRACTOR_VERSION` becomes `"m1.9"`. | format.md `:421`, `:633` | **No**, but only for repos with colliding names (Q2) |
| C11 | Flow and resolver verdicts | `external.<pkg>` (declared, not imported) is `unverified "declared, not imported"`, not `ID fail`. `external.<pkg>.X` of a declared or `planned module` package is `unverified "opaque module …"`, not K001. Internal `planned module` members stay K001. | format.md §6, Р13, the `ID` row (`:641`) | Relaxes errors to unverified. `ResolveContext.knownExternal` (exported via `check`) widens its meaning; note it in the PR. |
| C12 | K202 message for an external | `` planned module `external.stripe` is imported by `app.pay` (src/app/pay.ts:1); remove the declaration `` | format.md `:709` | Text only. `tests/cli.test.ts:1842,1849` still match. |
| C13 | Manifest parse errors | Manifests are now read in `buildGraph`, so `map` and `map --check` also exit 2 on a broken ancestor manifest. They are parsed as JSONC (the same parser as `imports.ts:75`). | tools.md `map` row | Stricter for `map` |
| C14 | LSP completion | The result is `{isIncomplete, items}`, and `isIncomplete` can be true while symbols build. Items gain `additionalTextEdits` and `documentation`, and kinds 6 and 7 are new. `labelDetails.description` can be `"+ planned"`. New positions: `- planned module ▮`, a map-module alias, `allow`/`deny` targets (layers and modules only). `external.*` is offered after `step`. | tools.md `keylang lsp` (`:107-108`) | Additive. `completions()` return type changes (internal; `lsp.ts:293` and `app.ts:1121` are the callers). |
| C15 | LSP hover, signatureHelp, definition | Work for package-symbol IDs. The advisory line reads "not checked". signatureHelp can return up to 5 signatures. The LSP still writes nothing. | tools.md `:104-108` | Additive |
| C16 | TUI | One-undo accept that adds the `planned module` line, the `+ planned` marker, and completion inside `[`. Symbol items. The TUI writes `.keylang/cache/packages.json`. | tools.md TUI (`:156`) | Additive |
| C17 | `spec-to-code` | New `--mode hybrid`, new `--prompt <text>` (hybrid or llm only; with algo it exits 2). **The default stays `algo`** (Q3). In hybrid, `--apply` refuses a candidate that adds an error-level diagnostic, with exit 1 (Q4). | tools.md `:21`, `:35`; `cli.ts` USAGE `:99-107`; ADR 0012 | Yes |
| C18 | `specToCode()` signature | Positional `(analysis, id, into?, model?)` becomes `(analysis, id, options)`. Callers are `mcp.ts:258` and `cli.ts:520`. | ADR 0012 | Internal |
| C19 | TUI keys | `Ctrl+Space` on an unimplemented `planned fn` builds code; elsewhere it drafts as today. New `a` (agent prompt in view) and `Ctrl+X` (cancel the agent job). New palette entries and a progress segment on the status line. | tools.md TUI key table; design.md §7.3 | Changes `Ctrl+Space` on a planned line (Q6) |
| C20 | ADR 0005 p.1 | "keylang does not run the harness" is refined: keylang runs a harness only as an answer-only model. | ADR 0005 status line; ADR 0009; `CONTEXT.md:97-99` | Doc |

MCP shapes and the diagnostic codes are unchanged. MCP `scaffold` stays algo and model-free.

---

## 2. Conflicts between slices and their resolution

| Conflict | Resolution |
|---|---|
| **`KEYLANG_AGENT`**: agent-cli uses it for selection, hybrid used it as a recursion guard. | Selection is `KEYLANG_AGENT`. The guard is `KEYLANG_NESTED=1`, set in the child env by `agent-cli.ts`, and checked in `llmClient` for `cli:*` only. |
| **Two hybrid designs** (agent-cli §6 vs the hybrid slice) | The hybrid slice's design wins, with its review fixes: existing files get additions only (`part=imports` + `part=append`), new files and new tests get whole-file blocks, and the dependency check depends on the language. From agent-cli, the worktree guard is kept, but it runs whenever `client.readsRepo`, which covers every `cli:*` including custom agents. |
| **The `hybrid` name clashes with `draft`/`code-to-spec` hybrid** | Keep the name. In both places it means "the deterministic result plus the model, reconciled or validated". `--mode llm` for spec-to-code is unchanged in v1 (Q5). |
| **ADR numbers**: every slice asked for 0007 or 0008. | 0009 agent-CLI provider (step 2), 0010 declared packages (step 3), 0011 package symbols (step 6), 0012 spec-to-code hybrid (step 8). The 0008 WIP file is not touched. |
| **Auto-import: when is the line "needed"?** Deps attached an edit to package items, symbols attached none to member items, and after the resolver fix the verdict no longer needs the line. | One rule for both, keyed by package: `pkg = externalPackageId(id)` is declared, has no snapshot node, has no `planned module pkg` in the live docs, and the cursor is in a `flow` section. The line records intent: the static text reads "planned module, not implemented" instead of "declared, not imported", and K202 later says when to remove it (Q7). |
| **Declared-packages API**: deps has `readManifests`/`DeclaredPackage`, hybrid wanted `declaredPackageNames(root)`, symbols needed the ecosystem and the manifest dir. | One type in `src/declared-packages.ts`: `DeclaredPackage { id, name, ecosystem: "npm"\|"cargo", declarations: {manifest, field, range}[] }` on `Analysis.packages` and `Graph.packages`. Hybrid and symbols read `analysis.packages`, and there is no `declaredPackageNames`. |
| **External IDs** (symbols review H1) | `assignExternalIds` lives in `src/external-ids.ts` (base) and is called once in `buildGraph` over declared ∪ imported names. `DeclaredPackage.id` comes from the same call. |
| **`completions()` return shape**: deps kept an array, symbols needed `isIncomplete`. | Step 5 changes the return type to `CompletionList {isIncomplete, items}`. Step 6 only sets `isIncomplete`. No server cap in v1. |
| **`src/lsp-features.ts`** is edited in steps 5 and 6. | Step 5 adds the candidate sources, positions, `plannedImport` and the gate. Step 6 adds the `packages` table on `Workspace`, the symbol branch, and the `Described` shape (`signatures[]`, `doc`, `advisory`). Separate functions, so they merge cleanly. |
| **`src/cli.ts`** | Step 1 changes the `llmClient` call sites (`:384,432,476,516,585,635,755`). Step 2 changes doctor (`:745-785`) and the jobs default (`:409`). Step 8 changes `cmdSpecToCode` (`:507-548`), the parseArgs `prompt` option (`:169-199`), and USAGE. No overlapping hunks. |
| **`src/tui/app.ts`** | Step 1 cancels ghost where the mode or buffer changes. Step 5 changes `complete` and `acceptCompletion` (`:1101-1145`). Step 7 adds the `PackageIndex` in `adopt`, `live` and `close`. Step 9 changes `viewKey`, `handle`, `commands` and `runCommand`. Distinct regions. |
| **`src/llm.ts`** | Step 1 changes the seam (signal, timeoutMs, options object). Step 2 adds the `cli` branch, `KEYLANG_NESTED`, and the effective-agent lookup. Step 8 adds the `max_tokens` stop check. |
| **`docs/tools.md`** | Each step owns one section (listed per step). The model section is new in step 2. |
| **`keylang.json` layers** | Step 2 adds `src/agent-cli.ts` to features. Step 3 adds `src/external-ids.ts` to base. Step 6 adds `src/package-symbols.ts` to map; `src/extract/dts.ts` is covered by the extract glob. Every step runs `node bin/keylang.js map`, reviews the diff and commits `keylang/map/*.md`. |
| **`docs/design.md`** has user WIP (`M`). | Steps 2, 6 and 8–10 do not edit `design.md`. The §7.1, §7.3, §5.5 and `:343` notes are collected for the user to apply on top of the WIP (listed in step 10). |

---

## 3. Implementation steps

Every step ends with these validation commands: `npm run typecheck && npm test && node bin/keylang.js map` (review the diff) `&& node bin/keylang.js map --check && node bin/keylang.js check`. Tests are offline and write only to temporary copies. Fake binaries live in temporary directories; PATH is `<fakebin>:<dirname(git)>`, and `HOME=<tmp>`.

### Step 1: cancellable model requests; ghost aborts superseded requests
- **Goal.** No stale requests keep running. This prepares the seam for CLI children.
- **Files.**
  - `src/llm.ts:18-22`: `LlmRequest` gains `signal?: AbortSignal` and `timeoutMs?: number`.
    - `llmClient(agent, options: {root: string; env?: Env; home?: string})` replaces the positional `env, home` (`:40`).
    - Export `isAborted(e)`, which checks `name === "AbortError"`.
    - Anthropic (`:76`) and OpenRouter (`:105`) use `AbortSignal.any([AbortSignal.timeout(min(t, req.timeoutMs)), req.signal])`. On `req.signal.aborted`, `throw req.signal.reason` (an AbortError) and do not report a timeout.
  - All callers: `cli.ts:384,432,476,516,585,635,755` pass `{root}`; `assist.ts:135,318` pass `{root: state.root}`.
  - `src/ghost.ts:29`: `ghostSuggestions(..., signal?)` forwards the signal to `complete`.
  - `src/tui/assist.ts`:
    - Add a field `ghostAbort` and a method `cancelGhost()` (stop the timer at `:113-118`, abort the request).
    - `ghostSoon` calls `cancelGhost()` instead of `stopGhostTimer()` (`:122`).
    - The timer callback passes `{signal, timeoutMs: 60_000}`.
    - The catch at `:142` returns silently when `isAborted`.
    - Add `draftAbort` for `agentDraft` (`:316-349`).
    - `close()` (`:96-99`) aborts both.
    - The staleness check at `:139` stays.
  - `src/tui/app.ts`:
    - `:979`: `mode === "edit" ? ghostSoon() : cancelGhost()`.
    - Also call `cancelGhost()` on buffer switch, merge open and `Ctrl+Space`, at the points where `state.mode` or the current buffer changes (agent-cli review M8).
- **Tests.**
  - `tests/tui.test.ts`: extend `mockModel` (`:980`) to count `aborted` requests (`req.on("close")` before the reply) and add a `delay`.
  - New test: `ghost.delay: 0`, a mock delay of 2 s. Type a new flow item, then `Esc`, then `idle()`. Assert `aborted === 1`, `state.message === null`, and no ghost.
  - The existing "two ghost requests…" test (`:1398-1417`) is unchanged and must stay green.
- **Docs.** `docs/tools.md:148`: cancellation.

### Step 2: agent CLIs as a model provider (`cli:*`)
- **Goal.** Decision 1 at the provider level: explain, draft, code-to-spec, ghost and `Ctrl+Space` all work through a CLI.
- **Files.**
  - **`src/config.ts:234`.** The regex becomes `/^(anthropic|openrouter):\S+$|^cli:[a-z][a-z0-9-]*(:(?!-)(?!.*--)[^\s<>]+)?$/`.
    - Error text: `` `agent` must be "anthropic:<model>", "openrouter:<model>" or "cli:<name>[:<model>]" … ``.
    - Export `AGENT_CLI_PRESETS = ["claude","codex","opencode","cursor"]` and `isCliAgent`.
    - `ghost.delay` becomes `number | null` (`:147`).
  - **New `src/agent-cli.ts` (features).** It imports only `node:*` and `./config.ts`, never `llm.ts` (no-cycles). It exports:
    - `readAgentSettings(home)`, which validates `agents.json` with errors that name the file and the field;
    - `resolveAgent(configAgent, env, home): {agent: string | null; source: "KEYLANG_AGENT" | "agents.json" | "keylang.json" | null}`. A `keylang.json` `cli:` gives `{agent: null, blocked: "<hint>"}`;
    - `cliClient(agent, {root, env, home, timeout}): {client} | {missing}`, where the client has `readsRepo: true`;
    - `describeAgentClis(env, home)`;
    - `repoFingerprint(root)`, used by step 8.

    Pure builders `invocation`, `parseResultLine` and `parseOpencodeEvents` are kept apart from the I/O helpers `runInvocation` and `whichSync`.
  - **Presets.** The prompt goes on stdin, except Cursor (argv, refused above 120 KiB). All presets run with `cwd = root` and env `{...process.env, PWD: root, NO_COLOR: "1", KEYLANG_NESTED: "1"}`:
    - **claude:** `-p --output-format json --no-session-persistence --safe-mode --strict-mcp-config --permission-prompts none --disable-slash-commands --system-prompt S --tools "" [--model M]`. For read: `--tools Read,Grep,Glob`. The variadic `--tools` is always followed by an option. Env adds `DISABLE_AUTOUPDATER=1`.
    - **codex:** `exec --sandbox read-only --ephemeral --skip-git-repo-check --color never --cd ROOT` and `-c` settings:
      - `approval_policy="never"`;
      - `developer_instructions=<JSON.stringify(S.toWellFormed())>`;
      - `features.hooks=false`, `features.multi_agent=false`, `features.apps=false`, `features.plugins=false`;
      - `project_doc_max_bytes=0`, `web_search="disabled"`, `mcp_servers={}`.

      Then `[-m M] -o TMP/last.txt -`. For none, also `-c features.shell_tool=false -c features.unified_exec=false`.
    - **opencode:** `run --standalone --format json --agent keylang [--model M]`. Env:
      - `OPENCODE_CONFIG_CONTENT`: the keylang agent with `permission: "deny"`. For read, `{"*":"deny",read,glob,grep,list:"allow"}`.
      - `OPENCODE_DISABLE_PROJECT_CONFIG=1` and `OPENCODE_DISABLE_AUTOUPDATE=1`.
    - **cursor:** `cursor-agent`, or else `agent` if a **synchronous** `spawnSync --version` in `cliClient` (5 s cap, memoized) matches `^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{7,}`. A mismatch is `{missing}` naming Grok (review M4).
      - argv: `-p --output-format json --mode ask --sandbox enabled --workspace ROOT [--model M] <S\n\nP>`. **No `--trust`** (review H2).
      - stdin is a pipe that stays open.
    - **custom:** `command` with `{prompt_file}` (mode 0600, in `mkdtemp(tmpdir())`) and `{model}` (an element containing it is dropped when there is no model). The answer is stdout.
  - **`runInvocation`.**
    - Spawn with `detached: true` on POSIX and an argument array.
    - Drain stdout and stderr, each capped at 16 MiB; keep the last 4 KiB of stderr.
    - An early `type:"result"` line resolves the call and then kills the process group.
    - The deadline is `min(request.timeoutMs, options.timeout)`, where the timeout is passed in from `llmClient` (review M3).
    - On abort or timeout: SIGTERM to `-pid`, then SIGKILL after 2 s.
    - A module-level set of live groups. `process.on("exit")` kills all of them. For SIGINT, SIGTERM and SIGHUP, a one-shot handler is installed only when `listenerCount === 0`.
    - Temp files are removed in `finally`.
    - Error texts are those of agent-cli §4.
  - **`src/llm.ts`.**
    - `llmClient` resolves the effective agent via `resolveAgent`.
    - `cli:*` with `env.KEYLANG_NESTED` set is `{missing: "cli agents are off inside an agent keylang started"}`.
    - The `cli:*` branch goes before `:63` and returns `cliClient`.
    - The `:41` hint mentions `KEYLANG_AGENT=cli:claude`.
  - **`src/tui/assist.ts`.** The ghost check at `:125` uses a memoized `resolveAgent(...).agent` in place of `analysis.config.agent`. The delay is `config.ghost.delay ?? (isCliAgent(a) ? 1500 : 400)`.
  - **`src/cli.ts`.**
    - `:409`: the jobs default depends on the effective agent.
    - Doctor (`:752-759`): an `agent: <value> (from <source>) → <bin> (<version>)` line and an `agent CLIs:` line (probed in parallel, 5 s cap, offline).
  - **Machine output.** None of this affects machine output; the lines above are doctor's text output only.
- **Tests.**
  - New `tests/fixtures/fake-agent.mjs` and `tests/agent-fixture.ts` (`fakeAgents(t, {names, modes, reply, version})`, `/bin/sh` wrappers that `exec "<process.execPath>"`).
  - New `tests/agent-cli.test.ts`, through the real CLI, with `KEYLANG_AGENT` set in the child env:
    1. `explain --llm` through claude, codex, opencode, cursor and custom. Assert:
       - the exact argv array and `cwd === PWD === root`;
       - where the system text goes;
       - the prompt is on stdin and in no argv element (Cursor excepted);
       - `KEYLANG_NESTED=1` in the child;
       - the saved header has `agent=cli:claude:opus`;
       - opencode `permission === "deny"`;
       - custom drops `{model}` and `{prompt_file}` is readable during the call.
    2. Failures:
       - missing binary: exit 0 with the offline summary;
       - `draft flow --mode llm` exits 2;
       - `fail`, `error-result` and `empty` exit 2 with the documented texts;
       - `hang` with `KEYLANG_LLM_TIMEOUT_MS=300` exits 2, and the pids of the child and the grandchild are gone (loose time bound, ≤10 s);
       - Cursor `linger`: exit 0 with the grandchild gone;
       - nothing is saved in any failure case.
    3. Selection and validation:
       - `keylang.json` `cli:claude` without a user opt-in: `explain --llm` falls back offline, and stderr names `KEYLANG_AGENT`;
       - a Grok-version `agent` on PATH gives the "not the Cursor CLI" text;
       - `"cli:claude:-x"`, `"cli:Bad"` and a model containing `-->` exit 2;
       - a bad `agents.json` exits 2 naming the field;
       - `doctor` prints both lines and exits 0 (run with PATH set to the fake directory).
  - `tests/tui.test.ts`: ghost via `KEYLANG_AGENT=cli:claude`, `FAKE_AGENT_MODES=hang,ok,hang`:
    - Enter, then End: pid 1 is dead and call 2's variants are shown.
    - `Esc`: pid 3 is dead and there is no message.
    - After `app.close()`, no fake process is alive.
    - PATH and env are prepended and restored in `t.after`, as at `:993-996`.
  - The existing doctor test (`tests/explain.test.ts:244`) matches the `agent CLIs:` line loosely.
- **Docs.**
  - `docs/tools.md`: the new `## Модель: API або агент-CLI` section before `## TUI` covering:
    - the grammar, precedence and `agents.json`;
    - the preset table with "checked with" versions;
    - env, timeout and cancellation;
    - security (custom agents are not sandboxed; a nested agent can read the repository and its instructions; `ANTHROPIC_*` variables are passed through; opencode user plugins still load and every call persists a session);
    - a suspended TUI (SIGTSTP) leaves children running.
  - Also `docs/tools.md`: rows `:25` and `:35`.
  - New `docs/adr/0009-agent-cli-provider.md` (Ukrainian), with the decisions from agent-cli §9 plus user-level selection only and no `--trust`.
  - ADR 0005 status: "п. 1 уточнено ADR 0009".
  - `CONTEXT.md`: the term "агент-CLI (провайдер моделі)".
  - `keylang.json` features gains `src/agent-cli.ts`.

### Step 3: declared packages, shared external IDs, manifest scope
- **Goal.** The data that steps 4–8 depend on, and C9, C10 and C13.
- **Files.**
  - **New `src/external-ids.ts` (base).** `EXTERNAL`, `externalSegment` (moved from `graph.ts:869-872`), `assignExternalIds(names)` (the collision rule moved from `graph.ts:889-907`), and `externalPackageId(id)`.
  - **`src/graph.ts`.** Re-export `EXTERNAL` (`:187`). `externalModuleIds` collects the imported names, then calls `assignExternalIds(imported ∪ declared)`. `Graph` (`:14-29`) gains `packages: DeclaredPackage[]`, sorted with `compareText`.
  - **`src/declared-packages.ts`.** Rewritten as `readManifests(config, files, inputs)`:
    - The files are the root plus the ancestors of `files`, minus `isExcluded`.
    - It uses the JSONC parser of `imports.ts:75`, on the texts already in `resolver.inputs`.
    - It drops workspace ranges and the root `workspaces` names, and maps `@types/x` to `x`.
    - The existing error texts stay (`:40-58,66,82`).
    - `declaredExternalIds` is removed.
    - Manifest texts go into `graph.resolverInputs`, which also fixes the MCP cache key.
  - **`src/analyze.ts:41-48,97`.** `Analysis.packages`. `knownExternal = new Set(packages.map((p) => p.id))`. With `withoutCode`, the root manifests only.
  - **`src/snapshot.ts:16`.** `EXTRACTOR_VERSION = "m1.9"`.
- **Tests.**
  - `tests/rules-area.test.ts` (next to `:413-470`): `exclude: ["bench/**"]` and `bench/x/package.json` declaring `junk`. `step external.junk` becomes K001 (a behaviour change, asserted).
  - `tests/analyzer.test.ts:488-500`: both `@scope/pkg` and `scope-pkg` declared, only `@scope/pkg` imported. Expect `external.scope-pkg-2` plus a warning.
  - A workspace-range package is not in `knownExternal` (`external.wslib.x` becomes K001).
  - Before claiming no regressions, run the full `npm test` in the real tree (review M5).
- **Docs.** `docs/format.md:421,633` (scope, collisions, Python not read, `@types`, workspaces). New `docs/adr/0010-declared-packages.md` with the ADR 0007 bug-fix argument. `keylang.json` base gains `src/external-ids.ts`.

### Step 4: verdicts for declared and planned package members; K202 text
- **Files.**
  - **`src/resolve.ts:252-259`.** After the exact `knownExternal` match: when `pkg = externalPackageId(target)` is a proper prefix, the target is not planned, and `pkg` is known or planned, the reference is `unverified` with `` opaque module `pkg` (declared, not imported | planned) ``. Update the doc at `:38`.
  - **`src/flows.ts`.** `FlowInput` (`:47`) gains `knownExternal`, passed from `assess.ts:57-66`. `idVerdict` (`:209-224`) gets the new branches (the table in deps §3.2). K202 at `:639`: when `code.file === null`, name the first importer, sorted by file, line and column.
- **Tests.**
  - `rules-area.test.ts`: the §3.2 rows through `check --format json`: exit 1 with only `external.junk` failing. Then an import of `pg` gives no K202, then `planned module external.pg` gives the new K202 text.
  - Tighten `tests/cli.test.ts:1842,1849` to the new text.
- **Docs.** format.md Р13 (`:441`), the `ID` row (`:641`) and `:709`.

### Step 5: dependency completion and auto-import (LSP and TUI)
- **Files.**
  - **`src/rules.ts`.** New `dependencyGate(spec, kindOf, format) → (from, to) => DependencyBlock | null`. `blocksDependency` goes through it. `wiring.ts:143`'s direct `denyingRule` is untouched.
  - **`src/spec-ir.ts`.** Export `plannedDecls(docs)`, wrapping `plannedDecl` (`:472`).
  - **`src/lsp-features.ts`.**
    - `CompletionItem` gains `additionalTextEdits`.
    - `completions()` returns a `CompletionList`.
    - Candidate sources: snapshot externals, then `analysis.packages`, then `plannedDecls(ws.analysis.docs)` (replacing `:598`). `sortText` is 1, 2 or 3.
    - Positions as in deps §4.3. The alias exclusion is derived from `keywordsAt("map","module")` (`parser.ts:124`).
    - A pure `plannedImport(...)` implements the §2 "needed" rule. The anchor is the first top-level node of the section that is neither `kind` nor `planned`.
  - **`src/lsp.ts:293`.** Return the list as is.
  - **`src/tui/app.ts:1101-1145`.**
    - `complete()` skips a leading `[`.
    - `acceptCompletion` builds the main replacement from `completion.from`..cursor **at accept time** (review M3), re-checks `plannedDecls` on the live docs, and applies `additionalTextEdits` through a pure `applyTextEdits(lines, edits)` in `src/tui/buffer.ts`. It is one `edit()`, so one undo step.
    - The message is ``added `- planned module external.pg` to flow <name>``.
  - **`src/tui/view.ts:436-452`.** The `+ planned` marker, without doubling "planned" (`:447`).
- **Tests.**
  - `tests/lsp.test.ts`: update `:599` (`external.node` now appears). A new fixture with a `package.json` declaring `pg`, `vitest` (dev), `@types/node`, `@scope/pkg` and `scope-pkg`. Assert:
    - the detail text;
    - the `+ planned` marker and `additionalTextEdits` at the 0-based line;
    - after a `didChange` that adds the line, the edit is gone;
    - `deny` targets;
    - a gated `step`;
    - K101 under `calls`;
    - `- planned module ▮`.
  - `tests/tui.test.ts`, on `checkoutRepo` with `stripe`:
    - the popup shows the detail and `+ planned`;
    - after Tab, the inserted line (0-based) and the step line are right and the cursor is at the end;
    - `Ctrl+Z` restores the exact text;
    - a second accept in the same unsaved buffer attaches no edit;
    - `Ctrl+S`, then CLI `check`, gives exit 0 and `fmt --check` gives exit 0;
    - `step [infra` opens the list.
- **Docs.** `docs/tools.md:108,156`.

### Step 6: npm symbol index in the LSP
- **Files.**
  - **New `src/extract/dts.ts`.** `readDeclarations(text, moduleName)`. It imports only base (`brief.ts`) and extract (review L1).
  - **`src/extract/ts.ts`.** Export `signature` and `typeSignature` only.
  - **New `src/package-symbols.ts` (map).**
    - `typingsEntry`, the closure walk (checked against realpath containment; each file is stat'ed before it is read), `resolveExports`, and the limits from symbols §3.4.
    - The cache is `.keylang/cache/packages.json`, keyed by resolved package dir. Its inputs include `null` probes and `typesDeclared`. For one npm name, the manifest nearest the root wins.
    - `PackageIndex.refresh()` marks new or changed packages `"pending"` **synchronously**, never rejects (failures become `partial` or `no-typings` with a reason, logged to stderr), and writes the cache only when the bytes change, and only with `persist: true`.
  - **`src/lsp-features.ts`.**
    - `Workspace.packages: PackageTable`.
    - A symbol branch for `step`, `trigger`, `calls` and `reads` after `external.<seg>.`. After `step`/`trigger` it offers callables, classes (Q8) and namespaces.
    - Items are narrowed only by the exact namespace prefix (review M3).
    - Pending makes the list `isIncomplete`.
    - The `plannedImport` rule from step 5 applies to symbol items too.
    - `Described` gains `signatures[]`, `doc` and `advisory`. A `planned` declaration wins over a symbol with the same label.
    - The hover advisory line: `not in <pkg> <ver> typings (advisory)`.
  - **`src/lsp.ts`.** `PackageIndex` with `persist: false`. Refresh after `analysis()` (`:197-211`). `close()` in `drain()` (`:140`).
- **Tests.**
  - `tests/package-fixture.ts` (symbols §6 table). `main.ts` goes under `src/application/`.
  - `tests/lsp.test.ts`:
    - poll until `isIncomplete` is false; the exact labels; the `ns.` members; `js-only`, `ambient-lib` and `cjs-lib`; `undeclared` gives nothing;
    - hover, signatureHelp with 2 signatures, definition;
    - every table key that is also a snapshot node has `node.comment === npm name`;
    - no cache file after exit.
  - `tests/cli.test.ts`:
    - flow names absent from the typings stay `unverified`, not K001;
    - `check` and `map --check` create no cache.
- **Docs.** `docs/tools.md:104-108`, format.md `:421`, Р13 and `:786` (one sentence each). New `docs/adr/0011-package-symbols-advisory.md`. `CONTEXT.md` term "Package symbols". `keylang.json` map gains `src/package-symbols.ts`.

### Step 7: npm symbols in the TUI and web
- **Files.**
  - **`src/tui/analysis-worker.ts` and `background.ts`.** Messages gain `kind: "map" | "packages"`. Package builds queue after the map.
  - **`src/tui/app.ts`.**
    - `AppOptions.packages?: PackageIndex`, shared by `web.ts:169` across tabs (review L6), with `persist: true`.
    - `adopt()` (`:360`) tracks the refresh.
    - `live()` passes the table, and `complete()` uses `.items`.
    - `close()`.
  - **`terminal.ts:116`.** Creates the index.
- **Tests.**
  - `tests/tui.test.ts`:
    - after `idle()`, `step external.fake-lib.ma` shows the popup and Tab inserts the full ID;
    - the cache exists, and a second session leaves it byte-identical;
    - an edited `util.d.mts` offers `ns.added` in a new session.
- **Docs.** `docs/tools.md:156` (the cache file and its invalidation).

### Step 8: `spec-to-code --mode hybrid` (CLI)
- **Files.**
  - **`src/spec-to-code.ts:50`.** `specToCode(analysis, id, options: {into, mode, model, instruction, signal, overlay, analyzer, evidence, context, progress})`.
  - **Hybrid flow.**
    1. The algo scaffold.
    2. One call. The prompt comes from the pure `hybridRequest()` (hybrid §2), and packages are listed in the **user** prompt (review M5).
    3. The answer format:
       - an existing code file: `path=<f> part=imports` and `part=append` blocks, spliced by keylang (imports after the last top-level import, the rest appended);
       - a new code file or new test file: a whole-file block.

       The fence regex matches the opening fence length. CRLF is re-applied per `spec-to-code.ts:81-82`.
    4. **Contract checks:**
       - the code part is present;
       - `parsesCleanly` passes on each result;
       - no `not implemented: <id>` remains;
       - K202 at the plan span;
       - dependencies: TS/JS against `analysis.packages` names plus Node built-ins; Rust against `TOOLCHAIN` plus Cargo deps; Python skipped with a note (review H1);
       - no new `unresolved-import` gap;
       - every test name is present.
    5. **Findings,** which become notes:
       - introduced error-level diagnostics;
       - nested steps that are not `static ok`, counted only when the target is a snapshot node and is not an unimplemented planned fn (review M2);
       - unplanned exported declarations, excluding types named in the signature (review M3).
    6. One retry on contract problems or introduced errors, never after `max_tokens`.
    7. `maxTokens` = clamp(8192, estimate, 32000).
  - **`src/llm.ts`.** The Anthropic answer with `stop_reason === "max_tokens"` throws `answer cut at maxTokens`.
  - **Guard.** When `model.readsRepo`: `repoFingerprint(root)` before and after the call. The fingerprint covers `git status --porcelain=v1 -z --untracked-files=all` plus a sha1 of each dirty path, the candidate files and `.keylang/proposals/**`. Without git: the candidate, proposal and spec files, with a note. A change exits 2 with `the agent changed <files> during the call; keylang wrote nothing`.
  - **`src/cli.ts`.**
    - `--mode algo|llm|hybrid`; the default stays `algo` (`:265`).
    - A `prompt` string option.
    - `--prompt` with algo exits 2.
    - Hybrid without a model falls back to algo with a stderr note.
    - Progress and notes go to stderr; stdout keeps its shape.
    - The `--apply` refusal of introduced errors exits 1.
    - USAGE (`:99-107`).
  - **`src/mcp.ts:258`.** `{into, mode: "algo"}`.
- **Tests.**
  - `tests/draft.test.ts`, with `mockModel` and the REFUND fixture plus `zod`:
    1. `--mode hybrid --print`:
       - exactly one prompt, containing the stub, `assert.fail(`, `to call, in order: infra.db.save` and `Declared packages: zod`;
       - stdout has `ID ok` and `static ok`;
       - nothing is written.

       The default run proposes the files; `--apply` writes the exact text.
    2. An answer that breaks the contract: a changed signature and a `left-pad` import. Exactly 2 prompts, the second with `Problems:`, then exit 2 and nothing is written. Also `--prompt x --mode algo` exits 2, and `--mode fast` exits 2 naming the three modes.
    3. The fake `claude` from step 2: its argv carries `--tools Read,Grep,Glob`, and the stub is on stdin. Mode `write` exits 2 with the guard text and no proposals.
    4. An existing module file answered as a rewritten whole file: the extra changes are ignored, and the file's original text is kept as a prefix.
    5. A Python planned fn whose body imports `os`: no contract problem, and the dependency note is present.
- **Docs.**
  - `docs/tools.md:21,35` (hybrid, answer format, checks, retry, guard, `--prompt`, stricter `--apply`).
  - `docs/tools.md:97` (scaffold = `--mode algo --print`).
  - New `docs/adr/0012-spec-to-code-hybrid.md`.
  - The harness text (`harness.ts:134`) is unchanged, since the default stays algo.

### Step 9: TUI build from a planned fn, agent jobs, cancel
- **Files.**
  - **`src/tui/state.ts`.** `State.agent` progress data. `Prompt.kind` gains `"agent"` plus `target`.
  - **`src/tui/assist.ts`.**
    - `job(label, run)`: one job at a time, a 1 s redraw, `finally` clears it, an abort gives `agent: cancelled; nothing proposed`.
    - `cancelAgent()`.
    - `buildPlanned(id, instruction?)`. It refuses when a proposal is waiting, both before and after the call (review L2). It passes `overlay`, `analyzer`, `evidence: true` and `context: contextText(host.contextPack())`. Before writing, it re-checks the disk against `before` and the plan's signature. It writes proposals and opens MERGE on the code file.
  - **`src/tui/app.ts`.**
    - `viewKey` (`:880`): `Ctrl+Space` on an unimplemented planned fn calls `buildPlanned`.
    - `a` opens the agent prompt.
    - `Ctrl+X` (decoded `{ctrl, name:"x"}`) is handled before `if (state.prompt)` (`:777`).
    - Palette entries in `commands()` and `runCommand` (`:1501,1515`).
  - **`src/tui/view.ts`.**
    - The status segment `⟳ <label> · <agent> · <n> s · Ctrl+X cancels` (`:567`).
    - The prompt label.
    - `HELP` and `HINTS`.
- **Tests.**
  - `tests/tui.test.ts`, on `checkoutRepo` with a planned `application.refund.refund`:
    - `Ctrl+Space`: one prompt with the stub, then MERGE on `src/application/refund.ts · code`, and nothing on disk. After `a` and `w`, the file text is right and `static ok` holds.
    - `a` with a slow mock: the progress segment matches its regex, `prompts[0]` has `The developer asks:`, and `Ctrl+X` gives the cancelled message with no `.keylang/proposals`.
- **Docs.** `docs/tools.md` TUI key table, the `Ctrl+Space` paragraph, MERGE and the status line.

### Step 10: writing a flow from a prompt (TUI)
- **Files.**
  - **`src/draft-llm.ts`.** `draftFlowWithModel(..., instruction?, signal?)`. New `draftFromPrompt(analysis, client, {path, text, line, instruction, context, signal})`, using `reconcile(..., trigger: string | null)`. Without an algo projection, every step is `llm-only` or `conflict`. The flow name is de-duplicated as in `draft.ts:123`.
  - **`assist.ts` and `app.ts`.** `a` outside a triggered flow dispatches here.
- **Tests.** `tests/tui.test.ts`: `a` in a spec with no triggered flow gives a MERGE of a new flow with `status=llm-only` provenance, and nothing is written before `w`.
- **Docs.**
  - `docs/tools.md` TUI.
  - The `docs/design.md` notes go to the user to apply on the WIP, not written by the agent:
    - §7.3: the provider can be an agent CLI; the `a` prompt;
    - §5.5 and `:343`: hybrid and the TUI action are implemented;
    - §7.1: completion covers npm symbols;
    - a roadmap row after M8.

---

## 4. Open questions for the user (each with a default so work can proceed)

1. **Q1. Who may select a `cli:` agent?**
   - Default: only the user, via `KEYLANG_AGENT` or `agents.json` `"use"`.
   - A `keylang.json` `cli:` is accepted by validation but reported as "chosen per user".
   - The alternative, honouring the repository config, lets a cloned repository spend your subscription and start processes just by being opened in the TUI.
2. **Q2. Manifest scope and collision IDs (C9, C10).**
   - Default: a bug fix with no format edition, marked incompatible in the PR.
   - The alternative gates C10 behind `format: 2`.
3. **Q3. spec-to-code default mode.**
   - Default: stays `algo`, and hybrid is explicit (and the TUI's `Ctrl+Space`).
   - The alternative is hybrid when an agent is configured. That needs `draft.test.ts:490` pinned to `--mode algo`, and the harness text becomes `--mode algo --print`.
4. **Q4. Should hybrid `--apply` refuse a candidate that adds an error-level diagnostic (exit 1)?** Default: yes.
5. **Q5. `--mode llm` for spec-to-code.** Default: unchanged in v1; later deprecated in favour of hybrid.
6. **Q6. TUI keys.** Default: `a` is the agent prompt, and `Ctrl+Space` on an unimplemented `planned fn` builds code instead of drafting the flow.
7. **Q7. Auto-import "needed" rule (§2).** Default: insert the line only when the package is declared, not imported and not yet planned, and the cursor is in a flow. After step 4 the line records intent; it does not change pass/fail.
8. **Q8. Classes after `step`/`trigger` in symbol completion** (constructor calls). Default: yes.
9. **Q9. Symbol subpaths.** Default: root entry only in v1. The MCP SDK then gets package level only.
10. **Q10. `CLAUDECODE` and `CLAUDE_CODE_*` variables when keylang runs inside Claude Code.** Default: pass them through and check in the manual smoke test. `KEYLANG_NESTED` covers recursion started by keylang itself.

---

## 5. Risks

- **CLI flag drift, and hypotheses that need a manual smoke check per version** (scratch repository with keylang's Stop hook installed):
  - Claude: `--safe-mode` together with `--tools`.
  - Codex: `mcp_servers={}` and `project_doc_max_bytes=0`.
  - opencode: rule order, `prompt` replacing the base prompt, and `--standalone` applying the env config.
  - Cursor: ask mode, stdin behaviour, and whether it works without `--trust`. Cursor was checked from docs only.
  - Versions are pinned in the docs and shown by doctor.
- **Isolation limits.** Presets rely on each vendor's read-only enforcement, and custom commands are not sandboxed. The worktree guard covers hybrid only and misses git-ignored paths. Nested agents can still read `AGENTS.md`, Cursor rules and secrets in the repository.
- **Latency and quota.** A CLI takes seconds per call, and a hybrid retry doubles it. Ghost through a CLI stays slow even with a single in-flight request, kill on cancel, and the 1500 ms default.
- **Orphaned processes.** A SIGKILLed keylang or a suspended TUI (SIGTSTP) leaves detached children running. Windows `.cmd` shims are unsupported in v1.
- **Incompatible verdict changes** (C9, C10): K001 for manifests outside the analysed tree, a one-time `snapshotId` and fact-cache rebuild, and colliding IDs changing.
- **Symbol index gaps.** Dotted nested namespaces, `typesVersions`, subpaths, and `export *` from another package (marked `partial`). The LSP can stall up to about 150 ms per large typings file on a cache miss, because it builds in-thread.
- **Hybrid validator blind spots.** Python exports and dependencies are not checked. An insertion inside a top-level non-declaration passes (it is visible in MERGE). Truncated answers above 32 k tokens fail.
- **Timing-sensitive tests** (process kill, progress, ghost). Assert on dead pids and regexes, not tight time bounds.
- **Shared-tree hazards.** `docs/design.md` and the untracked 0008 ADR are the user's WIP and must not be touched. Every step changes `keylang/map/*.md` through the generator, so the steps have to run strictly in order.