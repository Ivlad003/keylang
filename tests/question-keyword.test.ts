// An open question in a flow (.scratch/c4-zoom/issues/04): `- ? <text>` at
// the top of a flow, under `trigger`/`step` and under `when`. No claim `check`
// judges; a feature with one is not done, and one removed since the base
// commit weakens the plan. Through the real CLI and language server.

import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

const SHOP = "export function buy(id: string): void {\n  pay(id);\n}\nexport function pay(id: string): void {}\n";
const REFUND = `# flow refund

- ? who starts a refund: the customer or an operator?
- trigger app.shop.buy
  - ? is an operator needed?
  - step app.shop.pay
  - when the order is paid
    - ? what about partial refunds?
    - step app.shop.pay
`;

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function git(dir: string, args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-question-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const all: Record<string, string> = {
    "keylang.json": `${JSON.stringify({ languages: ["typescript"], module: "file", layers: { app: ["src/app/**"] } })}\n`,
    "src/app/shop.ts": SHOP,
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

type Item = { kind: string; text?: { value: string }; span: { start: { line: number; col: number } }; children?: Item[] };

/** Every question of a parsed file: its text, line and column. */
function questions(dir: string, path: string): [string, number, number][] {
  const r = keylang(dir, ["parse", "--json", path]);
  const [doc] = JSON.parse(r.stdout) as { sections: { items: Item[] }[] }[];
  const out: [string, number, number][] = [];
  const walk = (item: Item): void => {
    if (item.kind === "question") out.push([item.text!.value, item.span.start.line, item.span.start.col]);
    for (const child of item.children ?? []) walk(child);
  };
  for (const section of doc!.sections) for (const item of section.items) walk(item);
  return out;
}

test("parse: `- ? <text>` is a question at the top of a flow, under trigger, step and when; under then or invariant it is K004", (t) => {
  const dir = repo(t, {
    "keylang/flows/refund.md": REFUND,
    "keylang/flows/step.md": "# flow step\n\n- step app.shop.buy\n  - ? does it pay?\n",
    "keylang/flows/elsewhere.md": "# flow elsewhere\n\n- invariant refunds add up\n  - ? to what?\n- when paid\n  - then app.shop.pay\n    - ? and then?\n",
  });
  assert.deepEqual(questions(dir, "keylang/flows/refund.md"), [
    ["who starts a refund: the customer or an operator?", 3, 1],
    ["is an operator needed?", 5, 3],
    ["what about partial refunds?", 8, 5],
  ]);
  assert.deepEqual(questions(dir, "keylang/flows/step.md"), [["does it pay?", 4, 3]]);
  const elsewhere = keylang(dir, ["check", "keylang/flows/elsewhere.md"]);
  assert.match(elsewhere.stdout, /^keylang\/flows\/elsewhere\.md:4:5: K004 unknown keyword `\?` here; expected one of: test; `\?` goes at the top of `# flow`, under `- step`, under `- trigger` or under `- when`$/m);
  assert.match(elsewhere.stdout, /^keylang\/flows\/elsewhere\.md:7:7: K004 unknown keyword `\?` here; expected one of: test; `\?` goes at the top of `# flow`, under `- step`, under `- trigger` or under `- when`$/m);
});

test("check: a question is no claim: no diagnostic and no verdict; fmt keeps it canonical and is idempotent", (t) => {
  const dir = repo(t, { "keylang/flows/refund.md": REFUND });
  const check = keylang(dir, ["check", "keylang/flows/refund.md"]);
  assert.equal(check.status, 0, check.stdout);
  assert.doesNotMatch(check.stdout, /:(3|5|8):\d+:/);
  assert.match(check.stderr + check.stdout, /0 fail, 0 unverified, 5 ok/);
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows/refund.md"]).status, 0);
  // Spaces inside the text are canonical as in any free text: one `fmt` settles them, a second changes nothing.
  writeFileSync(join(dir, "keylang/flows/refund.md"), REFUND.replace("- ? is an operator needed?", "- ?   is  an operator   needed?"));
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows/refund.md"]).status, 1);
  assert.equal(keylang(dir, ["fmt", "keylang/flows/refund.md"]).status, 0);
  assert.equal(readFileSync(join(dir, "keylang/flows/refund.md"), "utf8"), REFUND);
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/flows/refund.md"]).status, 0);
});

test("feature: each open question is a gap until a person answers it in a commit; deleting it is a weakened plan", (t) => {
  const dir = repo(t, { "keylang/features/refund.md": REFUND });
  const status = (): { status: number | null; body: { done: boolean; stage: string; gaps: { kind: string; id: string; line: number; col: number; reason: string; stage: string }[] } } => {
    const r = keylang(dir, ["feature", "refund", "--format", "json"]);
    return { status: r.status, body: JSON.parse(r.stdout) };
  };
  const open = status();
  assert.equal(open.status, 1);
  assert.equal(open.body.stage, "structure");
  assert.deepEqual(
    open.body.gaps.map((gap) => [gap.kind, gap.id, gap.line, gap.col, gap.reason, gap.stage]),
    [
      ["question", "refund", 3, 1, "open question: who starts a refund: the customer or an operator?", "structure"],
      ["question", "refund", 5, 3, "open question: is an operator needed?", "structure"],
      ["question", "refund", 8, 5, "open question: what about partial refunds?", "structure"],
    ],
  );
  assert.match(keylang(dir, ["feature", "refund"]).stdout, /^keylang\/features\/refund\.md:3:1: question refund: open question: who starts a refund: the customer or an operator\?$/m);

  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "plan"]);
  // An agent deletes the questions instead of asking: the plan is weaker than at HEAD.
  const answered = REFUND.split("\n").filter((line) => !line.trimStart().startsWith("- ?")).join("\n");
  writeFileSync(join(dir, "keylang/features/refund.md"), answered);
  const deleted = status();
  assert.equal(deleted.status, 1);
  assert.deepEqual(deleted.body.gaps.map((gap) => [gap.kind, gap.line]), [["spec", 3], ["spec", 5], ["spec", 8]]);
  assert.match(deleted.body.gaps[0]!.reason, /^question «who starts a refund: the customer or an operator\?» of flow `refund` \(line 3 at HEAD\) was removed; done is judged against the plan at HEAD: answer the question in a commit$/);
  // A person answers by committing the plan without them: the new base has none, and the feature is done.
  git(dir, ["commit", "-am", "answer the questions"]);
  const done = status();
  assert.deepEqual([done.status, done.body.done, done.body.stage], [0, true, "done"]);
});

/** A minimal language client: framing, requests, and the first answer to each. */
class Lsp {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private readonly answers = new Map<number, unknown>();
  private next = 1;

  constructor(cwd: string) {
    this.child = spawn(process.execPath, [bin, "lsp", "--stdio"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      for (;;) {
        const end = this.buffer.indexOf("\r\n\r\n");
        if (end === -1) return;
        const length = Number(/Content-Length: (\d+)/i.exec(this.buffer.subarray(0, end).toString())?.[1]);
        if (this.buffer.length < end + 4 + length) return;
        const message = JSON.parse(this.buffer.subarray(end + 4, end + 4 + length).toString()) as { id?: number; method?: string; result?: unknown };
        if (message.id !== undefined && message.method === undefined) this.answers.set(message.id, message.result);
        this.buffer = this.buffer.subarray(end + 4 + length);
      }
    });
  }

  notify(method: string, params: unknown): void {
    const json = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }

  async request<T>(method: string, params: unknown): Promise<T> {
    const id = this.next++;
    const json = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
    for (let waited = 0; !this.answers.has(id); waited += 25) {
      if (waited > 30000) throw new Error(`${method}: no answer`);
      await new Promise((done) => setTimeout(done, 25));
    }
    return this.answers.get(id) as T;
  }

  close(): void {
    this.child.kill();
  }
}

test("lsp: completion after `- ` offers `?` under a trigger and under when; hover names an open question", async (t) => {
  const dir = repo(t, { "keylang/flows/refund.md": REFUND });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const lsp = new Lsp(dir);
  t.after(() => lsp.close());
  await lsp.request("initialize", { rootUri: pathToFileURL(dir).href, capabilities: {} });
  lsp.notify("initialized", {});
  const uri = pathToFileURL(join(dir, "keylang/flows/refund.md")).href;
  const text = REFUND.replace("  - step app.shop.pay\n  - when", "  - step app.shop.pay\n  - \n  - when");
  lsp.notify("textDocument/didOpen", { textDocument: { uri, languageId: "markdown", version: 1, text } });
  const labels = async (line: number, character: number): Promise<string[]> => {
    const listed = await lsp.request<{ items: { label: string }[] } | { label: string }[]>("textDocument/completion", { textDocument: { uri }, position: { line, character } });
    return (Array.isArray(listed) ? listed : listed.items).map((item) => item.label);
  };
  // Line 6 (0-based) is the new `  - ` under the trigger.
  assert.ok((await labels(6, 4)).includes("?"), "a question under a trigger");
  const hover = await lsp.request<{ contents: { value: string } | string }>("textDocument/hover", { textDocument: { uri }, position: { line: 2, character: 2 } });
  const shown = typeof hover.contents === "string" ? hover.contents : hover.contents.value;
  assert.match(shown, /an open question/);
});
