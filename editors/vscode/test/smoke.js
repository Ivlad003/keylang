// Runs inside the VS Code extension host (`--extensionTestsPath`): drives the
// thin client like a user and records what the server answered. The result
// goes to `.smoke-result.json` in the workspace; `run.mjs` reads it.

const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

async function until(what, find, ms = 30000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const found = await find();
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`timeout: ${what}`);
    await new Promise((done) => setTimeout(done, 100));
  }
}

const keylangDiagnostics = (uri) => vscode.languages.getDiagnostics(uri).filter((d) => d.source === "keylang");
const text = (contents) => contents.map((c) => (typeof c === "string" ? c : c.value)).join("\n");

async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const result = { steps: [] };
  const step = (name, ok, detail) => result.steps.push({ name, ok, detail });
  try {
    const rulesUri = vscode.Uri.file(path.join(root, "keylang/rules.md"));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(rulesUri));
    const rules = await until("rules diagnostics", () => (keylangDiagnostics(rulesUri).length > 0 ? keylangDiagnostics(rulesUri) : undefined));
    // Let a second copy (push beside pull) arrive if the server sent one.
    await new Promise((done) => setTimeout(done, 1500));
    const shown = keylangDiagnostics(rulesUri).map((d) => `${d.range.start.line + 1}: ${d.message}`);
    step("rules.md shows keylang diagnostics once", shown.length > 0 && new Set(shown).size === shown.length, shown);

    const flowPath = path.join(root, "keylang/flows/use.md");
    const flowUri = vscode.Uri.file(flowPath);
    const onDisk = fs.readFileSync(flowPath, "utf8");
    const flowDoc = await vscode.workspace.openTextDocument(flowUri);
    await vscode.window.showTextDocument(flowDoc);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(flowUri, new vscode.Position(flowDoc.lineCount, 0), "  - step domain.order.missingFn\n");
    await vscode.workspace.applyEdit(edit);
    const k001 = await until("K001 in the unsaved buffer", () => keylangDiagnostics(flowUri).find((d) => /missingFn/.test(d.message)));
    step("unsaved edit gives K001 without writing", String(k001.code?.value ?? k001.code) === "K001" && fs.readFileSync(flowPath, "utf8") === onDisk, k001.message);

    const lines = flowDoc.getText().split("\n");
    const line = lines.findIndex((l) => l.includes("domain.order.createOrder"));
    const at = new vscode.Position(line, lines[line].indexOf("createOrder"));
    const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", flowUri, at);
    const hoverText = hovers.map((h) => text(h.contents)).join("\n");
    step("hover shows the signature and evidence", /\(id: string, items: number\[\]\) → Order/.test(hoverText) && /static: ok/.test(hoverText), hoverText);

    const defs = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", flowUri, at);
    const def = defs[0];
    const target = def && (def.uri ?? def.targetUri);
    step("definition opens the code", Boolean(target && target.fsPath.endsWith(path.join("src", "domain", "order.ts"))), target && `${target.fsPath}:${(def.range ?? def.targetRange).start.line + 1}`);

    const edit2 = new vscode.WorkspaceEdit();
    edit2.insert(flowUri, new vscode.Position(flowDoc.lineCount, 0), "  - step ");
    await vscode.workspace.applyEdit(edit2);
    const last = flowDoc.lineCount - 1;
    const list = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", flowUri, new vscode.Position(last, flowDoc.lineAt(last).text.length));
    const labels = list.items.map((item) => (typeof item.label === "string" ? item.label : item.label.label));
    step("completion after step offers callables only", labels.includes("domain.order.createOrder") && !labels.includes("domain.order"), labels);

    const sourceUri = vscode.Uri.file(path.join(root, "src/domain/order.ts"));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(sourceUri));
    const lenses = await until("code lens", async () => {
      const found = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", sourceUri, 10);
      return found && found.length > 0 ? found : undefined;
    });
    step("code lens names the flow", lenses.some((lens) => lens.command && lens.command.title === "flows: use"), lenses.map((lens) => lens.command && lens.command.title));
  } catch (error) {
    step("error", false, String(error && error.stack ? error.stack : error));
  }
  fs.writeFileSync(path.join(root, ".smoke-result.json"), JSON.stringify(result, null, 2));
}

module.exports = { run };
