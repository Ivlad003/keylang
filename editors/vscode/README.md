# keylang for VS Code

This extension is a thin client: it starts `keylang lsp` over stdio and shows
whatever the server returns, so all the analysis happens in keylang itself. It
is not part of the `keylang` npm package. For each workspace folder, it sends
the server the Markdown specs under the `dir` set in that folder's
`keylang.json` (or under `keylang/` when there is no such file), along with the
TypeScript, JavaScript, Rust, Python and PHP sources. If you change `dir`, reload
the window for the new value to take effect.

## Run from a checkout

```sh
cd editors/vscode
npm install                     # vscode-languageclient
code --extensionDevelopmentPath="$PWD" /path/to/a/repository/with/keylang.json
```

If `keylang` is not installed globally, point the client at your clone of
keylang in the settings of the repository you opened:

```json
{
  "keylang.command": "node",
  "keylang.args": ["/path/to/keylang/bin/keylang.js", "lsp"]
}
```

## Automated check in a real VS Code

```sh
cd editors/vscode && npm install && cd ../..
node editors/vscode/test/run.mjs            # or: … run.mjs /path/to/code
```

`test/run.mjs` copies `tests/fixtures/repo` into a temporary workspace whose
settings run `keylang lsp` from this clone. It then starts VS Code with a
throwaway profile, this extension and `test/smoke.js`, and prints one line per
step; the exit code is 0 when every step passes. Because it opens a real
VS Code window, it needs a display. The steps are:

1. `keylang/rules.md` shows the verdict for each rule, exactly once.
2. An unsaved edit that adds `- step domain.order.missingFn` to a flow shows
   K001, while the file on disk stays unchanged.
3. Hovering over a step shows the signature, `file:line` and one line for each
   kind of evidence.
4. Go to Definition on the step opens `src/domain/order.ts` at the function.
5. Completion after `- step ` offers functions, not modules.
6. Accepting the top suggestion after `- step domain.or` inserts one whole id
   (`domain.order.createOrder`). This works because the items replace the whole
   typed dotted prefix, which Markdown's word pattern would otherwise split at
   the dots, and because they rank above Markdown's own snippets.
7. `src/domain/order.ts` shows the code lens `flows: use`.

Last run: 2026-09-28, VS Code 1.139.0 on Linux — all seven steps passed.

## By hand

You can also try the extension by hand on this repository. First run
`npm test`, so that test and trace evidence exist, and then open the
repository with `code --extensionDevelopmentPath="$PWD/editors/vscode" .`.
Now try the following:

- Open `keylang/rules.md` and add `- deny cli check` without saving. Once
  `src/cli.ts` is open too, K102 appears on its imports.
- In `keylang/flows/check.md`, hover over `cli.cli.cmdCheck` to see all four
  kinds of evidence.
- In `src/cli.ts`, the code lens above `cmdCheck` reads `flows: check`;
  clicking it lists those flows.
