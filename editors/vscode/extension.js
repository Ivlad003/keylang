// Thin VS Code client: it only starts `keylang lsp` over stdio. Every feature
// (diagnostics, hover, definition, symbols, completion, references, code
// lenses, signature help) comes from the server.

const vscode = require("vscode");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");

let client;

function activate(context) {
  const config = vscode.workspace.getConfiguration("keylang");
  const server = { command: config.get("command", "keylang"), args: config.get("args", ["lsp"]), transport: TransportKind.stdio };
  client = new LanguageClient(
    "keylang",
    "keylang",
    { run: server, debug: server },
    {
      documentSelector: [
        { scheme: "file", language: "markdown", pattern: "**/keylang/**/*.md" },
        { scheme: "file", language: "typescript" },
        { scheme: "file", language: "javascript" },
      ],
      synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher("**/{keylang.json,*.ts,*.js,keylang/**/*.md}") },
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
