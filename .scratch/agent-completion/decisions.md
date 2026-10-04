# User decisions that override plan.md (2026-09-29)
- Q1: `cli:*` in keylang.json `agent` IS honoured like `anthropic:`/`openrouter:`. Precedence stays: env KEYLANG_AGENT > ~/.config/keylang/agents.json "use" > keylang.json `agent`. Drop the "blocked from keylang.json" behaviour and its test; instead test that keylang.json `agent: "cli:claude"` runs the fake claude. Document in ADR 0009 that the repo config can select a CLI and the security note (opening a cloned repo's TUI with ghost may start the CLI) — doctor shows the source.
- Q3: spec-to-code default stays `algo`; hybrid explicit (`--mode hybrid`, TUI Ctrl+Space on unimplemented planned fn).
- Q6: TUI keys: `a` (agent prompt in view mode), `Ctrl+Space` on unimplemented planned fn builds code, `Ctrl+X` cancels agent job.
- Q2, Q4, Q5, Q7-Q10: take plan defaults.
- Work happens in git worktree /home/kosmodev/pet_project/keylang-agent-completion on branch feat/agent-completion (node_modules is a symlink to the main repo's). Never touch /home/kosmodev/pet_project/keylang (user's WIP tree). docs/design.md edits are allowed in the worktree only if needed (branch is separate), but prefer leaving design.md notes to the final summary.
- ADR numbers: 0008 is taken by the user's untracked WIP in the main tree (docs/adr/0008-shared-workspace-operations.md) — use 0009-0012.
