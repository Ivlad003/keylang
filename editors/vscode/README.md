# keylang for VS Code

A thin client: it starts `keylang lsp` over stdio and shows what the server
returns. It is not part of the `keylang` npm package. It sends the server the
Markdown specs under `dir` of each folder's `keylang.json` (`keylang/`
without one) and the TypeScript, JavaScript, Rust and Python sources; a new
`dir` takes effect after a window reload.

## Run from a checkout

```sh
cd editors/vscode
npm install                     # vscode-languageclient
code --extensionDevelopmentPath="$PWD" /path/to/a/repository/with/keylang.json
```

Without a global `keylang`, point the client at the checkout in the settings of
the opened repository:

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

`test/run.mjs` copies `tests/fixtures/repo` to a temp workspace whose
settings run this checkout's `keylang lsp`, starts VS Code with a throwaway
profile, this extension, and `test/smoke.js`, and prints one line per step
(exit 0 when all pass). It needs a display. The steps:

1. `keylang/rules.md` shows the rule verdicts, each once.
2. An unsaved edit adding `- step domain.order.missingFn` to a flow shows
   K001; the file on disk is unchanged.
3. Hover on a step shows the signature, `file:line`, and one line per kind of
   evidence.
4. Go to Definition on the step opens `src/domain/order.ts` at the function.
5. Completion after `- step ` offers functions, not modules.
6. Accepting the top suggestion after `- step domain.or` gives one whole id
   (`domain.order.createOrder`): the items replace the typed dotted prefix,
   which Markdown's word pattern splits at dots, and rank above Markdown's
   snippets.
7. `src/domain/order.ts` has the code lens `flows: use`.

Last run: 2026-09-28, VS Code 1.139.0 on Linux — all seven steps ok.

## By hand

On this repository (`code --extensionDevelopmentPath="$PWD/editors/vscode" .`,
after `npm test` so that tests and trace evidence exist): open
`keylang/rules.md`, add `- deny cli check` without saving — K102 appears on
imports in `src/cli.ts` once that file is open; hover `cli.cli.cmdCheck` in
`keylang/flows/check.md` for the four kinds of evidence; the code lens above
`cmdCheck` in `src/cli.ts` reads `flows: check`, and clicking it lists them.
