# Review of the agent-cli design

The design mostly holds, with defects that must be fixed before implementation: three high, eight medium, eight low. Code anchors, CLI flags and binaries were checked locally (claude 2.1.284, codex-cli 0.155.1, opencode v2.0.18, grok 1.0.41). No model was called. The Cursor stdin-pipe claim was checked against cc-connect PR #326. The design text contains no stray instructions; the "settings-json" pattern the harness flagged is only the `agents.json` example.

## High

**H1. The ADR number 0008 is already taken.**
- Evidence: `ls docs/adr` shows `0008-shared-workspace-operations.md`. It is untracked WIP (`?? docs/adr/0008-shared-workspace-operations.md` in the git status).
- Fix: the new ADR is `0009-agent-cli-provider.md`. ADR 0005's status note should say "п. 1 уточнено ADR 0009". Do not touch the 0008 file.

**H2. A cloned repository can make keylang start the user's agent CLI just by being opened in the TUI.**
- Ghost needs nothing but `analysis.config.agent` being set (`src/tui/assist.ts:124-129`), and `keylang.json` is a file the repository ships.
- With `"agent":"cli:cursor"`, the preset passes `--trust`. That trusts the workspace, so the repository's `.cursor/mcp.json` and project hooks can run. keylang's own `agents` command writes `.cursor/mcp.json` (`src/adapters/harness.ts:15`, `:192`).
- With any preset it spends the user's subscription quota without asking.
- The design uses exactly this argument ("code that runs just from opening the TUI") to keep custom commands out of `keylang.json`, but then lets `keylang.json` choose a preset.
- Fix:
  - A `cli:` agent takes effect only through user-level opt-in: the environment variable `KEYLANG_AGENT` (make open question 1 a decision), or `~/.config/keylang/agents.json` `"use": "cli:claude"`.
  - Otherwise `keylang.json` `cli:…` gives `{missing}` with the text "a cli: agent is chosen per user: set KEYLANG_AGENT or …".
  - Drop `--trust` from the Cursor preset. If the workspace is not trusted, the error says to run `agent` once in the repository.
  - The ADR records this, and `docs/tools.md` states the rule.

**H3. Hybrid spec-to-code lets the agent rewrite an existing code file in full.**
- Today `modelBody` accepts only the function ("the rest of its answer is dropped", `src/spec-to-code.ts:246-262`). keylang appends it to the unchanged `lf` (`:77-78`).
- The design asks for "the whole content of each file". The agent can then drop or change unrelated code in an existing module file. `introduced()` (`:91-97`) only sees architecture findings, so it would not catch this. The proposal and `--apply` would then carry that rewrite.
- Fix:
  - For the code file, ask only for the function that replaces the stub, check it with the existing `declares` regex (`:260`), and splice it the way `:78` does.
  - Accept whole-file blocks only for new test files (`before: null`, `:174`).
  - Add a check that `after` starts with the original `lf` prefix.
  - Add an e2e test: the fake answers with a rewritten whole file, and the extra changes are rejected or ignored.

## Medium

**M1. The signal anchor is wrong.**
- `src/cli.ts:292-309` holds the handlers of `keylang web`, not the TUI's. The TUI's handlers are in `src/tui/terminal.ts:92` (`SIGNALS`, including SIGTSTP and SIGCONT).
- The web server closes session apps at `src/tui/web.ts:285` and `:362`.
- The `listenerCount === 0` trick still works in both, but the design must cite the right files and state that web stop leads to `app.close()` and on to `assist.close()`, which aborts the requests.
- A suspended TUI (SIGTSTP) leaves its detached agents running. Document this.

**M2. The test PATH breaks the worktree guard.**
- Tests pass `PATH=<bin>` only, so there is no `git`. The guard then skips "with a note", and test 4's `write` case (`files changed while cli:claude answered`) cannot pass.
- Fix: `PATH=<bin>:<dirname(which git)>`, since git is at `/usr/bin/git` here.
- In the in-process TUI test, prepend to `process.env.PATH` and restore it in `t.after`, following the existing precedent at `tests/tui.test.ts:993-996`.

**M3. Duplicating `timeoutMs` is unnecessary.**
- `timeoutMs` is private to `src/llm.ts:67-71`, and `agent-cli.ts` cannot import `llm.ts` without a cycle.
- `llmClient` already validates the timeout before choosing a provider (`:42-43`). Pass it in: `cliClient(agent, {root, env, home, timeout})`. This avoids a second parser.

**M4. A Grok `agent` found at request time gives an exit code that differs from a missing binary.**
- The design runs the Cursor/Grok probe inside `complete()`.
- If `agent` turns out to be Grok, `explain --llm` exits 2. A missing binary falls back offline with exit 0 (`src/cli.ts:385-393`).
- Fix: run the probe synchronously in `cliClient` (`spawnSync`, 5 s cap, memoized per process), and only when falling back to `agent`. A mismatch is then `{missing}`.

**M5. The worktree guard has blind spots and an unclear scope.**
- `--untracked-files=all` skips ignored paths such as `.env`, `.keylang/`, `dist/` and `node_modules/`.
- The guard is keyed on `tools:"read"`, but custom agents ignore `tools`, and they are the only ones keylang does not restrict.
- Fix: run the guard on every hybrid run, whatever the preset, and document the ignored-path blind spot.

**M6. opencode still loads user-level config.**
- `OPENCODE_DISABLE_PROJECT_CONFIG` covers the project only. The binary reads `project:!l(process.env.OPENCODE_CONFIG_PROJECT_DISABLE??process.env.OPENCODE_DISABLE_PROJECT_CONFIG)`, so both names work.
- Global plugins (JS code), MCP servers and instructions still load on every call.
- `opencode run --help` has no ephemeral option, so every ghost request persists a session.
- Fix:
  - Add `OPENCODE_DISABLE_AUTOUPDATE=1`.
  - Document the user-global plugins and the session growth.
  - Consider not using opencode for ghost by default, since `--standalone` boots a server on every call.

**M7. Codex leaves apps and plugins on.**
- `codex features list` shows `apps  stable true` and `plugins  stable true`. The preset does not turn them off.
- Fix: add `-c features.apps=false -c features.plugins=false`.

**M8. Ghost cancellation covers only one path, and two workspace points need a decision.**
- **Cancellation.** It is wired only at `src/tui/app.ts:979`, the edit-key path. Switching buffers, panel keys, Ctrl+Space and opening a merge leave the child running until the staleness drop at `assist.ts:139`. Fix: cancel where the mode or buffer changes, not only in the key handler.
- **Existing WIP.** `docs/design.md` has the user's uncommitted changes (`M docs/design.md`). The §7.3 note has to go on top of that WIP, or wait.
- **Name clash.** `spec-to-code --mode hybrid` clashes with `draft` and `code-to-spec` hybrid, where it means the model reconciled with the snapshot (`src/cli.ts:92-94`). It also overlaps the existing `--mode llm`, which already gives a model body and tests (`spec-to-code.ts:77`, `:172`). This is a public CLI decision; put it in the open questions.

## Low

- **L1. Stale anchors.**
  - `Config.agent` is at `src/config.ts:55`, not `:54`.
  - `docs/format.md` does not mention `agent`; config is documented in `docs/tools.md:35`. So no format.md change is needed, which the design already implies.
- **L2. `-->` in a model name breaks the headers.** The model regex `[^\s-]\S*` allows it, which breaks `<!-- keylang:explain agent=… -->` (`src/explanations.ts:28`, `:43`) and the draft provenance comment (`src/draft-llm.ts:118`, `:303`). Forbid `--`, `<` and `>`.
- **L3. Claude preset additions.**
  - Add `--disable-slash-commands`; a prompt starting with `/` would otherwise be read as a command.
  - Set `DISABLE_AUTOUPDATER=1`.
  - `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`, which tests and users set for keylang's own provider, are passed through and redirect the nested `claude`. Document this.
- **L4. `--tools` is variadic (`--tools <tools...>`).** It must always be followed by another option, never a positional argument. Pin the argv order in the exact-argv test.
- **L5. The existing doctor test runs real binaries.** With the new `agent CLIs:` line it probes whatever is on the developer's PATH (`tests/explain.test.ts:244`). Match that line loosely, or run doctor with PATH set to the fake directory.
- **L6. Timing assertions are flaky.** The "< 2.5 s" and "< 2 s" bounds will fail on a loaded CI machine. Use wide bounds and rely on the "pid is dead" checks.
- **L7. Codex `developer_instructions`.** `JSON.stringify` can emit a lone `\udXXX` escape, which is not valid TOML, and Codex then silently takes the raw string, quotes included. Apply `toWellFormed()` first.
- **L8. Fence parsing and Cursor argv size.**
  - The fence regex stops at the first ``` inside file content. Match the opening fence length instead.
  - The 120 KiB argv limit for Cursor also hits `draft flow`, whose prompt includes `compactMap` (`src/draft-llm.ts:55`), not just spec-to-code.

## Verified as fine

- **Blocker 1 (Stop hook).** `hookCommand` is `npx -y keylang@… hook stop` (`src/adapters/harness.ts:146-148`), it is written to both hook files (`:220-229`), and `hookDecision` blocks (`src/changed.ts:71-75`).
- **Ghost timing.** The request counter and the late staleness check are at `src/tui/assist.ts:129` and `:139`. `src/llm.ts` builds only timeout signals (`:76`, `:105`).
- **Anchors.** `src/ghost.ts` has 57 lines, with `ghostSignal` at `:16-26`. The `llmClient` call sites match the list, and nothing in `tests/` calls `llmClient` directly, so changing its signature is safe.
- **CLI flags exist as claimed:**
  - Claude: `--safe-mode`, `--permission-prompts none`, `--tools ""`, `--no-session-persistence`, `--strict-mcp-config`, `--system-prompt`; `--bare` really does ignore OAuth.
  - Codex: `exec -`, `--sandbox read-only`, `--ephemeral`, `--skip-git-repo-check`, `--color`, `-o`, `-C`; the `-c` values are parsed as TOML; `hooks`, `shell_tool`, `unified_exec` and `multi_agent` are features.
  - opencode: `run --standalone`, `--format json`, `--agent`, `--model`; `OPENCODE_CONFIG_CONTENT` exists.
  - Grok: `-p/--single`, `--prompt-file`, `--system-prompt-override`, `--tools`, `--permission-mode plan`, and the `grok 1.0.41` version string.
- **Cursor stdin.** A pipe kept open matches the fix in cc-connect PR #326.
- **Layers.** Putting `agent-cli.ts` in features and importing only `node:*` and `config.ts` is valid under `layers base < … < features`. Keeping `llm.ts` out of it avoids a cycle under `no-cycles`. Putting `isCliAgent` in base is valid.
- **Process handling.** Spawning with argument arrays and a detached process group (setsid gives no controlling TTY), sending the prompt on stdin, rejecting a model that starts with `-`, and writing temp files outside the repository all hold.
- **Unchanged contracts.** No new npm or native dependency. MCP and LSP stay unchanged; `scaffold` at `src/mcp.ts:258` stays algo. Exit codes stay 2. The explanation header parses `cli:claude:opus`, because its field is `\S+`.
- **Existing ghost test.** "two ghost requests…" (`tests/tui.test.ts:1398-1417`) still passes with abort-on-supersede: the mock logs the prompt when it arrives.
- **Existing write safety.** `--apply` already writes with `expect: before` (`src/cli.ts:546`), so an edit made during the model call is never overwritten.
- **Draft fallback.** Falling back from hybrid to algo matches `src/cli.ts:478-479`.