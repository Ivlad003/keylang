# keylang for VS Code

A thin client: it starts `keylang lsp` over stdio and shows what the server
returns. It is not part of the `keylang` npm package.

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

## Manual check

On this repository (`code --extensionDevelopmentPath="$PWD/editors/vscode" .`):

1. Open `keylang/rules.md`. The Problems panel lists the rule verdicts (`ok`
   as hints); `deny lang map` shows no error.
2. Add `- deny cli check` and do not save. Within a second the line shows
   K102 errors pointing at imports in `src/cli.ts` — the buffer is checked
   without writing the file. Undo the line: the errors disappear.
3. Open `keylang/flows/check.md`, hover `cli.cli.cmdCheck`: the signature,
   `src/cli.ts:<line>`, and one line per kind of evidence (ID, static, tests,
   trace). F12 on the id opens `src/cli.ts` at the function.
4. Type `      - step ` on a new line under a step: completion offers only
   functions and `planned fn` ids.
5. Open `src/cli.ts`: a code lens `flows: check` stands above `cmdCheck`.

Last automated check of the server behind these steps: `tests/lsp.test.ts`.
The steps above need a desktop VS Code and were not run in CI.
