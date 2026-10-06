// Thin VS Code client: it only starts `keylang lsp` over stdio. Every feature
// (diagnostics, hover, definition, symbols, completion, references, code
// lenses, signature help) comes from the server.

const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

let client;

/** The spec directory of each workspace folder: `dir` of its keylang.json, `keylang` without one. */
function specDirs() {
  const dirs = new Set();
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    let dir = "keylang";
    try {
      const config = JSON.parse(fs.readFileSync(path.join(folder.uri.fsPath, "keylang.json"), "utf8"));
      if (typeof config.dir === "string" && config.dir.trim() !== "") dir = config.dir.replace(/\\/g, "/").replace(/^\.\/+|\/+$/g, "");
    } catch {
      // No keylang.json, or one the server will report as invalid.
    }
    dirs.add(dir === "" || dir === "." ? "" : dir);
  }
  if (dirs.size === 0) dirs.add("keylang");
  return [...dirs];
}

function activate(context) {
  const config = vscode.workspace.getConfiguration("keylang");
  const server = { command: config.get("command", "keylang"), args: config.get("args", ["lsp"]), transport: TransportKind.stdio };
  const dirs = specDirs();
  const specs = dirs.map((dir) => (dir === "" ? "**/*.md" : `**/${dir}/**/*.md`));
  // Files the analysis reads: config, import resolution, sources, and the specs.
  const watched = ["keylang.json", "tsconfig.json", "jsconfig.json", "package.json", "Cargo.toml", "composer.json", "composer.lock", "*.ts", "*.tsx", "*.mts", "*.cts", "*.js", "*.jsx", "*.mjs", "*.cjs", "*.rs", "*.py", "*.php", ...dirs.map((dir) => (dir === "" ? "*.md" : `${dir}/**/*.md`))];
  client = new LanguageClient(
    "keylang",
    "keylang",
    { run: server, debug: server },
    {
      documentSelector: [
        ...specs.map((pattern) => ({ scheme: "file", language: "markdown", pattern })),
        // The languages keylang reads: code lenses and rule findings on the code itself.
        ...["typescript", "typescriptreact", "javascript", "javascriptreact", "rust", "python", "php"].map((language) => ({ scheme: "file", language })),
      ],
      synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher(`**/{${watched.join(",")}}`) },
    },
  );
  // Code lenses `flows: …` carry the flow names; clicking one lists them.
  context.subscriptions.push(vscode.commands.registerCommand("keylang.flows", (flows) => vscode.window.showInformationMessage(`keylang flows: ${(flows ?? []).join(", ")}`)));
  context.subscriptions.push(client);
  return client.start();
}

function deactivate() {
  return client ? client.stop() : undefined;
}

module.exports = { activate, deactivate };
