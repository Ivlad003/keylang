// `keylang lsp` over stdio: one session per test, driven like an editor would.

import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Message {
  id?: number;
  method?: string;
  params?: { uri?: string; diagnostics?: Item[] };
  result?: unknown;
  error?: { code: number; message: string };
}

interface Item {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: number;
  code?: string;
  message: string;
  data?: { verdict: string };
}

class Session {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  readonly messages: Message[] = [];
  private next = 1;
  readonly exited: Promise<number | null>;

  constructor(cwd: string) {
    this.child = spawn(process.execPath, [bin, "lsp"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.exited = new Promise((done) => this.child.on("exit", (code) => done(code)));
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      for (;;) {
        const end = this.buffer.indexOf("\r\n\r\n");
        if (end === -1) return;
        const length = Number(/Content-Length: (\d+)/i.exec(this.buffer.subarray(0, end).toString())?.[1]);
        if (this.buffer.length < end + 4 + length) return;
        this.messages.push(JSON.parse(this.buffer.subarray(end + 4, end + 4 + length).toString()) as Message);
        this.buffer = this.buffer.subarray(end + 4 + length);
      }
    });
  }

  notify(method: string, params: unknown): void {
    const json = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }

  send(method: string, params: unknown): number {
    const id = this.next++;
    const json = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
    return id;
  }

  /** A request and its cancellation in one write, so the server sees both before answering. */
  sendThenCancel(method: string, params: unknown): number {
    const id = this.next++;
    const frame = (message: unknown): string => {
      const json = JSON.stringify(message);
      return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
    };
    this.child.stdin.write(frame({ jsonrpc: "2.0", id, method, params }) + frame({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } }));
    return id;
  }

  async request<T>(method: string, params: unknown): Promise<T> {
    const response = await this.response(this.send(method, params));
    if (response.error) throw new Error(`${method}: ${response.error.message}`);
    return response.result as T;
  }

  async response(id: number): Promise<Message> {
    return this.until(() => this.messages.find((m) => m.id === id && m.method === undefined));
  }

  async until<T>(find: () => T | undefined, ms = 30000): Promise<T> {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = find();
      if (found !== undefined) return found;
      if (Date.now() > deadline) throw new Error(`timeout; got ${JSON.stringify(this.messages).slice(0, 2000)}`);
      await new Promise((done) => setTimeout(done, 25));
    }
  }

  close(): void {
    this.child.kill();
  }
}

async function open(t: { after: (f: () => void) => void }, dir: string): Promise<Session> {
  const session = new Session(dir);
  t.after(() => session.close());
  await session.request("initialize", { rootUri: pathToFileURL(dir).href, capabilities: {} });
  session.notify("initialized", {});
  return session;
}

function fixture(t: { after: (f: () => void) => void }, extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-lsp-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  for (const [path, text] of Object.entries(extra)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  assert.equal(spawnSync(process.execPath, [bin, "map"], { cwd: dir }).status, 0);
  return dir;
}

const uri = (dir: string, path: string): string => pathToFileURL(join(dir, path)).href;
const lineOf = (text: string, needle: string): number => text.split("\n").findIndex((line) => line.includes(needle));
const charOf = (text: string, line: number, needle: string): number => (text.split("\n")[line] ?? "").indexOf(needle);

interface CheckRow {
  file: string;
  line: number;
  col: number;
  code: string | null;
  verdict: string;
  evidence: string;
}

function checkRows(dir: string, file: string): CheckRow[] {
  const o = spawnSync(process.execPath, [bin, "check", "--format", "json"], { cwd: dir, encoding: "utf8" });
  return (JSON.parse(o.stdout) as { results: CheckRow[] }).results.filter((row) => row.file === file);
}

const sameAs = (row: CheckRow, item: Item): boolean =>
  (item.code ?? null) === (row.code ?? null) && item.message === row.evidence && item.range.start.line === row.line - 1 && item.range.start.character === row.col - 1 && item.data?.verdict === row.verdict;

// ---------- 25 ----------

const RULES = "# rules\n\n- layers domain < app\n  - infra\n- deny domain infra\n- module domain.order\n  - exports Order, total, createOrder, extra\n- entry\n  - app.checkout\n- no-cycles\n";
const FLOW = "# flow buy\n\n- planned fn domain.order.later (order: Order) → void\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n  - step domain.order.later\n";

test("lsp: diagnostics of an open rules.md equal check --format json, pushed and pulled", async (t) => {
  const dir = fixture(t, { "keylang/rules.md": RULES, "keylang/flows/buy.md": FLOW, "src/domain/order.ts": `${readFileSync(join(root, "tests/fixtures/repo/src/domain/order.ts"), "utf8")}import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n` });
  const rows = checkRows(dir, "keylang/rules.md");
  assert.ok(rows.some((row) => row.code === "K104"), JSON.stringify(rows));
  const s = await open(t, dir);
  const rulesUri = uri(dir, "keylang/rules.md");
  s.notify("textDocument/didOpen", { textDocument: { uri: rulesUri, languageId: "markdown", version: 1, text: RULES } });
  const pushed = await s.until(() => s.messages.find((m) => m.method === "textDocument/publishDiagnostics" && m.params?.uri === rulesUri));
  const pulled = (await s.request<{ items: Item[] }>("textDocument/diagnostic", { textDocument: { uri: rulesUri } })).items;
  for (const items of [pushed.params!.diagnostics!, pulled]) {
    for (const row of rows) assert.ok(items.some((item) => sameAs(row, item)), JSON.stringify({ row, items }));
    assert.equal(items.length, rows.length);
  }
});

test("lsp: open buffers are checked without writing, a new generation replaces the old", async (t) => {
  const dir = fixture(t);
  const s = await open(t, dir);
  const flowUri = uri(dir, "keylang/flows/draft.md");
  s.notify("textDocument/didOpen", { textDocument: { uri: flowUri, languageId: "markdown", version: 1, text: "# flow draft\n\n- step domain.order.total\n" } });
  s.notify("textDocument/didChange", { textDocument: { uri: flowUri, version: 2 }, contentChanges: [{ text: "# flow draft\n\n- step domain.order.missingFn\n" }] });
  const pushed = await s.until(() => s.messages.find((m) => m.method === "textDocument/publishDiagnostics" && m.params?.uri === flowUri));
  // Only the second version is published; the first generation never is.
  assert.equal(s.messages.filter((m) => m.method === "textDocument/publishDiagnostics" && m.params?.uri === flowUri).length, 1);
  assert.ok(pushed.params!.diagnostics!.some((d) => d.code === "K001" && /missingFn/.test(d.message)));
  assert.equal(existsSync(join(dir, "keylang/flows/draft.md")), false);
  const sourceUri = uri(dir, "src/domain/order.ts");
  const source = readFileSync(join(dir, "src/domain/order.ts"), "utf8");
  s.notify("textDocument/didOpen", { textDocument: { uri: sourceUri, languageId: "typescript", version: 1, text: `${source}import { save } from "../infra/db.ts";\nexport function again(): void { save({ id: "", total: 0 }); }\n` } });
  const items = (await s.request<{ items: Item[] }>("textDocument/diagnostic", { textDocument: { uri: sourceUri } })).items;
  assert.ok(items.some((d) => d.code === "K102"), JSON.stringify(items));
  assert.equal(readFileSync(join(dir, "src/domain/order.ts"), "utf8"), source);
  s.notify("textDocument/didClose", { textDocument: { uri: sourceUri } });
  const after = (await s.request<{ items: Item[] }>("textDocument/diagnostic", { textDocument: { uri: sourceUri } })).items;
  assert.equal(after.some((d) => d.code === "K102"), false);
});

test("lsp: hover on a flow step shows the signature and each kind of evidence; planned says so", async (t) => {
  const dir = fixture(t, { "keylang/flows/buy.md": FLOW });
  const s = await open(t, dir);
  const flowUri = uri(dir, "keylang/flows/buy.md");
  const step = lineOf(FLOW, "step domain.order.createOrder");
  const shown = await s.request<{ contents: { value: string } }>("textDocument/hover", { textDocument: { uri: flowUri }, position: { line: step, character: charOf(FLOW, step, "createOrder") } });
  assert.match(shown.contents.value, /\*\*fn\*\* `domain\.order\.createOrder` `\(id: string, items: number\[\]\) → Order`/);
  assert.match(shown.contents.value, /src\/domain\/order\.ts:10/);
  assert.match(shown.contents.value, /- ID: ok domain\.order\.createOrder: exact/);
  assert.match(shown.contents.value, /- static: ok domain\.order\.createOrder: called from app\.checkout\.checkout/);
  assert.match(shown.contents.value, /flows: buy/);
  const planned = lineOf(FLOW, "step domain.order.later");
  const later = await s.request<{ contents: { value: string } }>("textDocument/hover", { textDocument: { uri: flowUri }, position: { line: planned, character: charOf(FLOW, planned, "later") } });
  assert.match(later.contents.value, /\*\*planned fn\*\* `domain\.order\.later` `\(order: Order\) → void`/);
  assert.match(later.contents.value, /planned, not implemented/);
  assert.match(later.contents.value, /- static: unverified domain\.order\.later: planned fn, not implemented/);
});

test("lsp: definition from the map opens the decoded file at the code position", async (t) => {
  const dir = fixture(t, { "src/app/my shop (x)/cart.ts": 'import { total } from "../../domain/order.ts";\n\nexport   function pay(): number {\n  return total([1]);\n}\n' });
  const s = await open(t, dir);
  const map = readFileSync(join(dir, "keylang/map/app.md"), "utf8");
  const line = lineOf(map, "fn [pay]");
  assert.ok(line >= 0, map);
  const mapUri = uri(dir, "keylang/map/app.md");
  const expected = pathToFileURL(join(dir, "src/app/my shop (x)/cart.ts")).href;
  // On the declared name: the node itself, at the code's line and column.
  const byName = await s.request<{ uri: string; range: { start: { line: number; character: number } } }>("textDocument/definition", { textDocument: { uri: mapUri }, position: { line, character: charOf(map, line, "pay") } });
  assert.equal(byName.uri, expected);
  assert.deepEqual(byName.range.start, { line: 2, character: 9 });
  // On the link target: the file and line of the link.
  const byLink = await s.request<{ uri: string; range: { start: { line: number } } }>("textDocument/definition", { textDocument: { uri: mapUri }, position: { line, character: charOf(map, line, "cart.ts") } });
  assert.equal(byLink.uri, expected);
  assert.equal(byLink.range.start.line, 2);
  const flow = "# flow pay\n\n- step app.my_shop__x_.cart.pay\n";
  const flowUri = uri(dir, "keylang/flows/pay.md");
  s.notify("textDocument/didOpen", { textDocument: { uri: flowUri, languageId: "markdown", version: 1, text: flow } });
  const fromFlow = await s.request<{ uri: string; range: { start: { line: number; character: number } } }>("textDocument/definition", { textDocument: { uri: flowUri }, position: { line: 2, character: charOf(flow, 2, "pay") } });
  assert.equal(fromFlow.uri, expected);
  assert.deepEqual(fromFlow.range.start, { line: 2, character: 9 });
});

test("lsp: document symbols are a tree per document, flows and rules with their status", async (t) => {
  const dir = fixture(t, { "keylang/rules.md": RULES, "keylang/flows/buy.md": FLOW });
  const s = await open(t, dir);
  type Sym = { name: string; detail?: string; children: Sym[] };
  const map = await s.request<Sym[]>("textDocument/documentSymbol", { textDocument: { uri: uri(dir, "keylang/map/domain.md") } });
  assert.deepEqual(map.map((sym) => sym.name), ["domain"]);
  const order = map[0]!.children.find((sym) => sym.name === "order");
  assert.ok(order, JSON.stringify(map));
  assert.deepEqual(order.children.map((sym) => sym.name).sort(), ["Order", "createOrder", "total"]);
  const flows = await s.request<Sym[]>("textDocument/documentSymbol", { textDocument: { uri: uri(dir, "keylang/flows/buy.md") } });
  assert.equal(flows[0]?.name, "flow buy");
  const trigger = flows[0]!.children.find((sym) => sym.name === "trigger app.checkout.checkout");
  assert.ok(trigger?.children.some((sym) => sym.name === "step domain.order.createOrder" && sym.detail === "ok"), JSON.stringify(flows));
  assert.ok(trigger?.children.some((sym) => sym.name === "step domain.order.later" && sym.detail === "unverified"));
  const rules = await s.request<Sym[]>("textDocument/documentSymbol", { textDocument: { uri: uri(dir, "keylang/rules.md") } });
  const names = rules[0]!.children.map((sym) => `${sym.name} [${sym.detail ?? ""}]`);
  assert.ok(names.includes("deny domain infra [ok]"), names.join("\n"));
  assert.ok(names.some((name) => name.startsWith("module domain.order [fail]")), names.join("\n"));
});

test("lsp: shutdown and exit end the server with code 0; exit alone with 1; unknown methods are errors", async (t) => {
  const dir = fixture(t);
  const s = await open(t, dir);
  const unknown = await s.response(s.send("textDocument/rename", {}));
  assert.equal(unknown.error?.code, -32601);
  assert.equal(await s.request("shutdown", null), null);
  s.notify("exit", null);
  assert.equal(await s.exited, 0);
  const rude = await open(t, dir);
  rude.notify("exit", null);
  assert.equal(await rude.exited, 1);
});

test("lsp: a cancelled request answers RequestCancelled", async (t) => {
  const dir = fixture(t);
  const s = await open(t, dir);
  const id = s.sendThenCancel("textDocument/documentSymbol", { textDocument: { uri: uri(dir, "keylang/map/domain.md") } });
  const response = await s.response(id);
  assert.equal(response.error?.code, -32800);
  // No second answer arrives for the same id.
  await new Promise((done) => setTimeout(done, 800));
  assert.equal(s.messages.filter((m) => m.id === id).length, 1);
});

// ---------- 26 ----------

test("lsp: completion under a module leaves out what deny forbids; after step only callables", async (t) => {
  const dir = fixture(t, { "keylang/rules.md": RULES, "keylang/flows/buy.md": FLOW, "keylang/flows/more.md": "# flow more\n\n- planned type domain.order.Later\n- planned module domain.future\n" });
  const s = await open(t, dir);
  type Completion = { items: { label: string; kind: number; detail?: string; labelDetails?: { description: string } }[] };
  const mapUri = uri(dir, "keylang/map/domain.md");
  const map = readFileSync(join(dir, "keylang/map/domain.md"), "utf8");
  const moduleLine = lineOf(map, "module [order]");
  const lines = map.split("\n");
  lines.splice(moduleLine + 1, 0, "    - calls ");
  const edited = lines.join("\n");
  s.notify("textDocument/didOpen", { textDocument: { uri: mapUri, languageId: "markdown", version: 1, text: edited } });
  const underModule = await s.request<Completion>("textDocument/completion", { textDocument: { uri: mapUri }, position: { line: moduleLine + 1, character: "    - calls ".length } });
  const labels = underModule.items.map((item) => item.label);
  assert.ok(labels.includes("domain.order.total"), labels.join(" "));
  assert.equal(labels.some((label) => label.startsWith("infra.")), false, labels.join(" "));
  const planned = underModule.items.find((item) => item.label === "domain.order.later");
  assert.equal(planned?.labelDetails?.description, "planned");
  const flowUri = uri(dir, "keylang/flows/buy.md");
  const flow = `${FLOW}  - step `;
  s.notify("textDocument/didChange", { textDocument: { uri: flowUri, version: 2 }, contentChanges: [{ text: flow }] });
  s.notify("textDocument/didOpen", { textDocument: { uri: flowUri, languageId: "markdown", version: 2, text: flow } });
  const afterStep = await s.request<Completion>("textDocument/completion", { textDocument: { uri: flowUri }, position: { line: flow.split("\n").length - 1, character: "  - step ".length } });
  const stepLabels = afterStep.items.map((item) => item.label);
  assert.ok(stepLabels.includes("domain.order.createOrder") && stepLabels.includes("domain.order.later"), stepLabels.join(" "));
  assert.equal(afterStep.items.every((item) => item.kind === 3), true, JSON.stringify(afterStep.items.filter((item) => item.kind !== 3)));
  assert.equal(stepLabels.some((label) => label === "domain.order" || label === "domain.future" || label === "domain.order.Later"), false);
  const keywordText = `${FLOW}- `;
  s.notify("textDocument/didChange", { textDocument: { uri: flowUri, version: 3 }, contentChanges: [{ text: keywordText }] });
  const keywords = await s.request<Completion>("textDocument/completion", { textDocument: { uri: flowUri }, position: { line: keywordText.split("\n").length - 1, character: 2 } });
  assert.deepEqual(keywords.items.map((item) => item.label).sort(), ["calls", "emits", "invariant", "kind", "planned", "reads", "step", "test", "trigger", "when"]);
});

test("lsp: references find the flow and rules lines; code lens names the flows; signature help", async (t) => {
  const dir = fixture(t, { "keylang/rules.md": RULES, "keylang/flows/buy.md": FLOW });
  const s = await open(t, dir);
  const flowUri = uri(dir, "keylang/flows/buy.md");
  const step = lineOf(FLOW, "step domain.order.createOrder");
  const refs = await s.request<{ uri: string; range: { start: { line: number; character: number } } }[]>("textDocument/references", { textDocument: { uri: flowUri }, position: { line: step, character: charOf(FLOW, step, "createOrder") } });
  const where = refs.map((ref) => `${ref.uri.slice(pathToFileURL(dir).href.length + 1)}:${ref.range.start.line + 1}:${ref.range.start.character + 1}`).sort();
  assert.ok(where.includes(`keylang/flows/buy.md:${step + 1}:${charOf(FLOW, step, "domain") + 1}`), where.join("\n"));
  assert.ok(where.some((w) => w.startsWith("keylang/rules.md:7:")), where.join("\n"));
  assert.ok(where.some((w) => w.startsWith("keylang/map/domain.md:")), where.join("\n"));
  assert.ok(where.some((w) => w.startsWith("keylang/map/app.md:")), where.join("\n"));
  const lenses = await s.request<{ range: { start: { line: number } }; command: { title: string } }[]>("textDocument/codeLens", { textDocument: { uri: uri(dir, "src/domain/order.ts") } });
  assert.deepEqual(lenses.map((lens) => [lens.range.start.line, lens.command.title]), [[9, "flows: buy"]]);
  const text = "# flow sig\n\n- step domain.order.createOrder ";
  const sigUri = uri(dir, "keylang/flows/sig.md");
  s.notify("textDocument/didOpen", { textDocument: { uri: sigUri, languageId: "markdown", version: 1, text } });
  const help = await s.request<{ signatures: { label: string }[] }>("textDocument/signatureHelp", { textDocument: { uri: sigUri }, position: { line: 2, character: text.split("\n")[2]!.length } });
  assert.equal(help.signatures[0]?.label, "domain.order.createOrder (id: string, items: number[]) → Order");
});
