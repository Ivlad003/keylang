// «Студія» of `keylang web` (.scratch/studio) through the real CLI: the page
// and its link, `POST /api/projection` (keylang and TypeScript for a canvas
// with planned shapes, nothing written), `POST /api/chat` with a stand-in for
// the Messages API (a reply whose spec block becomes a proposal), «Прийняти»
// and «Відхилити» (`POST /api/proposal`), no model (409), and `--read-only`
// (no page, no writes).

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request, type Server } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { bin } from "./cli-helpers.ts";
import { editorModelOf, type FixtureModel } from "./diagrams-fixture.ts";
import { checkoutRepo, CHECKOUT_FLOW } from "./tui-fixture.ts";

/** The checkout flow with a planned type and its fields: the TypeScript projection has an interface to show. */
const FLOW_WITH_TYPE = `${CHECKOUT_FLOW}- planned type domain.Receipt\n  - id: string\n  - total?: number\n`;

interface Mock {
  url: string;
  prompts: string[];
  reply: string;
  /** Answer nothing: the request waits until its caller gives up. */
  hold: boolean;
  /** Requests whose connection closed before an answer. */
  dropped: number;
}

/** A local stand-in for the Messages API: no network, answers with `mock.reply`, keeps each prompt. */
async function mockAnthropic(t: TestContext): Promise<Mock> {
  const mock: Mock = { url: "", prompts: [], reply: "", hold: false, dropped: 0 };

  const server: Server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      // SAFETY: the SDK posts a Messages API body; the test reads the text of its one user message.
      const body = JSON.parse(data) as { messages: { content: string }[] };
      mock.prompts.push(body.messages[0]?.content ?? "");

      if (mock.hold) {
        res.on("close", () => mock.dropped++);

        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: mock.reply }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  // SAFETY: a server listening on a TCP port reports an AddressInfo.
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return mock;
}

/** A JSON body of the studio's API: the fields of `/api/projection`, `/api/chat` or `/api/proposal`, valid or not. */
interface RequestBody {
  model?: FixtureModel | null;
  specHash?: string | null;
  format?: string;
  history?: { role: string; text: string }[];
  view?: string;
  selection?: string[];
  target?: string;
  action?: string;
}

/** A chat request the page gives up on once the model has been asked: the socket is destroyed, no answer read. */
function abandonChat(url: URL, mock: Mock, body: RequestBody): Promise<void> {
  const text = JSON.stringify(body);
  const token = new URLSearchParams(url.hash.slice(1)).get("t") ?? "";
  const req = request({ host: url.hostname, port: url.port, path: "/api/chat", method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(text)) } });
  req.on("error", () => {});
  req.end(text);
  const asked = mock.prompts.length;

  return new Promise((resolve) => {
    const poll = setInterval(() => {
      if (mock.prompts.length > asked) {
        clearInterval(poll);
        req.destroy();
        resolve();
      }
    }, 20);
  });
}

/** `keylang web` on `cwd` (with `--read-only` when asked), and its printed URL. */
async function startWeb(t: TestContext, cwd: string, env: Record<string, string | undefined>, args: string[] = []): Promise<URL> {
  const child = spawn(process.execPath, [bin, "web", ...args, "--port", "0"], { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, KEYLANG_AGENT: undefined, ...env } });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((done) => child.once("exit", done));
    }
  });
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  const start = Date.now();

  while (!/keylang web: (\S+)/.test(out)) {
    if (child.exitCode !== null || Date.now() - start > 20000) throw new Error(`keylang web printed no URL: ${out}`);
    await new Promise((done) => setTimeout(done, 20));
  }

  return new URL(/keylang web: (\S+)/.exec(out)![1]!);
}

/** One HTTP request to the server, with the token as a Bearer unless `headers` say otherwise. */
function send(url: URL, method: string, path: string, body: RequestBody | undefined = undefined, headers: Record<string, string> | null = null): Promise<{ status: number; body: string }> {
  const text = body === undefined ? "" : JSON.stringify(body);
  const token = new URLSearchParams(url.hash.slice(1)).get("t") ?? "";
  let sent = headers;

  // By default the token, and the JSON type when there is a body.
  if (sent === null) {
    sent = { Authorization: `Bearer ${token}` };

    if (body !== undefined) sent["Content-Type"] = "application/json";
  }

  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, method, headers: { ...sent, "Content-Length": String(Buffer.byteLength(text)) } }, (res) => {
      let answer = "";
      res.on("data", (chunk: Buffer) => (answer += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: answer }));
    });

    req.on("error", reject);
    req.end(text);
  });
}

/** The checkout flow «з коду» plus a planned step `application.pay` drawn after `save`. */
async function drawnModel(url: URL): Promise<{ model: FixtureModel; specHash: string }> {
  const diagram = await send(url, "GET", "/api/diagram?view=flow&name=checkout");
  assert.equal(diagram.status, 200, diagram.body);
  const drawn = JSON.parse(diagram.body);
  const model = editorModelOf("flow:checkout", drawn);
  const save = model.nodes.find((n) => n.id === "infrastructure.store.save")!;
  const pay = { key: "draft:1", id: "planned:application.pay", kind: "task", label: "pay", layer: null, tests: [], signature: "(order: Order) => Receipt", x: 0, y: 0, w: 160, h: 60 };

  return { model: { ...model, nodes: [...model.nodes, pay], edges: [...model.edges, { key: "draft:2", kind: "sequence", from: save.key, to: "draft:1" }] }, specHash: drawn.specHash };
}

test("studio: the page and its link, the keylang and TypeScript projections of a canvas with planned shapes, nothing written; the guards of a write", async (t) => {
  const repo = checkoutRepo(t, { "keylang/flows/checkout.md": FLOW_WITH_TYPE });
  const url = await startWeb(t, repo, { HOME: repo });

  // The page: three panes, its script and styles; the diagram page links to it.
  const page = await send(url, "GET", "/studio", undefined, {});
  assert.equal(page.status, 200);

  for (const id of ["pane-diagram", "pane-projection", "pane-agent", "studio-view", "chat-form"]) assert.match(page.body, new RegExp(`id="${id}"`), id);
  assert.match(page.body, /src="assets\/studio\.js"/);
  assert.match((await send(url, "GET", "/diagrams", undefined, {})).body, /href="studio"/);
  assert.equal((await send(url, "GET", "/assets/studio.js", undefined, {})).status, 200);
  assert.equal((await send(url, "GET", "/assets/studio.css", undefined, {})).status, 200);

  const { model, specHash } = await drawnModel(url);

  // keylang: the flow's file with the planned step and its declaration as added lines.
  const keylang = await send(url, "POST", "/api/projection", { model, specHash, format: "keylang" });
  assert.equal(keylang.status, 200, keylang.body);
  const k = JSON.parse(keylang.body);
  assert.equal(k.status, "printed");
  assert.equal(k.files.length, 1);
  const file = k.files[0];
  assert.equal(file.path, "keylang/flows/checkout.md");
  assert.equal(file.changed, true);
  const lines: string[] = file.text.split("\n");
  assert.deepEqual(
    file.added.map((n: number) => lines[n - 1]),
    ["  - step application.pay", "- planned fn application.pay (order: Order) => Receipt"],
  );

  // TypeScript: the planned type of the flow (on disk) and the drawn planned fn (only on the canvas).
  const ts = await send(url, "POST", "/api/projection", { model, specHash, format: "ts" });
  assert.equal(ts.status, 200, ts.body);
  const p = JSON.parse(ts.body);
  assert.equal(p.status, "printed");
  assert.deepEqual(
    p.items.map((item: { id: string; form: string }) => [item.id, item.form]),
    [
      ["application", "interface"],
      ["domain.Receipt", "interface"],
    ],
  );
  assert.match(p.text, /export interface Receipt \{\n {2}id: string;\n {2}total\?: number;\n\}/);
  assert.match(p.text, /export interface Application \{\n  pay\(.*\(order: Order\) => Receipt\n\}/);
  // Each item's lines hold its text.
  const textLines: string[] = p.text.split("\n");

  for (const item of p.items) assert.equal(textLines.slice(item.from - 1, item.to).join("\n"), item.text.replace(/\n$/, ""), item.id);

  // The canvas «з коду» projects the flow's own file, unchanged.
  const same = JSON.parse((await send(url, "POST", "/api/projection", { model: { ...model, nodes: model.nodes.slice(0, -1), edges: model.edges.slice(0, -1) }, specHash, format: "keylang" })).body);
  assert.equal(same.status, "nothing");
  assert.deepEqual(same.files.map((f: { path: string; changed: boolean }) => [f.path, f.changed]), [["keylang/flows/checkout.md", false]]);

  // Stale specs: 409 with the reason, no text.
  const stale = await send(url, "POST", "/api/projection", { model, specHash: "0".repeat(64), format: "keylang" });
  assert.equal(stale.status, 409);
  assert.equal(JSON.parse(stale.body).status, "conflict");

  // The guards of every write: no token, another origin, no JSON; a bad format.
  assert.equal((await send(url, "POST", "/api/projection", { model, format: "ts" }, { "Content-Type": "application/json" })).status, 403);
  const token = new URLSearchParams(url.hash.slice(1)).get("t") ?? "";
  assert.equal((await send(url, "POST", "/api/projection", { model, format: "ts" }, { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: "http://evil.example" })).status, 403);
  assert.equal((await send(url, "POST", "/api/projection", { model, format: "ts" }, { "Content-Type": "text/plain", Authorization: `Bearer ${token}` })).status, 415);
  assert.equal((await send(url, "POST", "/api/projection", { model, format: "c" })).status, 400);
  assert.equal((await send(url, "GET", "/api/projection")).status, 405);
  assert.equal(existsSync(join(repo, ".keylang/proposals")), false, "a projection writes nothing");
  assert.equal(readFileSync(join(repo, "keylang/flows/checkout.md"), "utf8"), FLOW_WITH_TYPE);
});

test("studio: the chat answers with the studio's context and its spec block becomes a proposal; accept writes the spec, reject leaves it; no model is 409", async (t) => {
  const repo = checkoutRepo(t, { "keylang/flows/checkout.md": FLOW_WITH_TYPE });
  const config = join(repo, "keylang.json");
  const withAgent = `${JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), agent: "anthropic:claude-opus-5" }, null, 2)}\n`;
  const withoutAgent = readFileSync(config, "utf8");
  writeFileSync(config, withAgent);
  const mock = await mockAnthropic(t);
  const url = await startWeb(t, repo, { HOME: repo, ANTHROPIC_BASE_URL: mock.url, ANTHROPIC_API_KEY: "test-key", ANTHROPIC_AUTH_TOKEN: undefined });
  const flowFile = join(repo, "keylang/flows/checkout.md");
  const { model, specHash } = await drawnModel(url);
  const proposed = FLOW_WITH_TYPE.replace("Checkout from the terminal.", "Checkout from the terminal, paid by card.");
  mock.reply = `Додам оплату карткою в опис.\n\n\`\`\`\`keylang path=keylang/flows/checkout.md\n${proposed}\`\`\`\`\n`;
  const ask = (text: string) => send(url, "POST", "/api/chat", { history: [{ role: "you", text }], view: "flow:checkout", selection: ["planned:application.pay"], model, specHash });

  // The answer: the reply without the block, and the block as a proposal of one hunk.
  const first = await ask("додай оплату карткою");
  assert.equal(first.status, 200, first.body);
  const answer = JSON.parse(first.body);
  assert.equal(answer.status, "replied");
  assert.equal(answer.reply, "Додам оплату карткою в опис.");
  assert.equal(answer.refused, null);
  assert.equal(answer.proposal.target, "keylang/flows/checkout.md");
  assert.deepEqual(answer.proposal.hunks, [{ line: 3, removed: ["Checkout from the terminal."], added: ["Checkout from the terminal, paid by card."] }]);
  assert.equal(readFileSync(join(repo, ".keylang/proposals/keylang/flows/checkout.md"), "utf8"), proposed);
  assert.equal(readFileSync(flowFile, "utf8"), FLOW_WITH_TYPE, "the spec waits for a person");
  // The model saw the view, the selection, the spec and what the canvas adds.
  const prompt = mock.prompts.at(-1)!;
  assert.match(prompt, /studio/);
  assert.match(prompt, /`flow:checkout`/);
  assert.match(prompt, /Selected on the canvas: `planned:application\.pay`/);
  assert.match(prompt, /The open file keylang\/flows\/checkout\.md/);
  assert.match(prompt, /\+- planned fn application\.pay \(order: Order\) => Receipt/);

  // A second block for the same spec waits behind the first: refused, nothing overwritten.
  const again = JSON.parse((await ask("ще раз")).body);
  assert.match(again.refused, /already waiting/);
  assert.equal(again.proposal, null);

  // Accept: the spec is the proposal, the proposal is gone.
  const accepted = await send(url, "POST", "/api/proposal", { target: "keylang/flows/checkout.md", action: "accept" });
  assert.equal(accepted.status, 200, accepted.body);
  assert.equal(JSON.parse(accepted.body).status, "written");
  assert.equal(readFileSync(flowFile, "utf8"), proposed);
  assert.equal(existsSync(join(repo, ".keylang/proposals/keylang/flows/checkout.md")), false);
  assert.equal((await send(url, "POST", "/api/proposal", { target: "keylang/flows/checkout.md", action: "accept" })).status, 404, "nothing waits any more");

  // Reject: the proposal goes, the spec stays.
  mock.reply = `Інакше.\n\n\`\`\`\`keylang path=keylang/flows/checkout.md\n${proposed.replace("paid by card", "paid in cash")}\`\`\`\`\n`;
  const second = JSON.parse((await send(url, "POST", "/api/chat", { history: [{ role: "you", text: "готівкою" }], view: "flow:checkout", selection: [], model: null, specHash: null })).body);
  assert.equal(second.proposal.target, "keylang/flows/checkout.md");
  const rejected = await send(url, "POST", "/api/proposal", { target: "keylang/flows/checkout.md", action: "reject" });
  assert.equal(rejected.status, 200, rejected.body);
  assert.equal(JSON.parse(rejected.body).status, "removed");
  assert.equal(readFileSync(flowFile, "utf8"), proposed);
  assert.equal(existsSync(join(repo, ".keylang/proposals/keylang/flows/checkout.md")), false);

  // A block outside the specs is refused; a malformed request is 400.
  mock.reply = "Ось код.\n\n````keylang path=src/domain/order.ts\nexport {};\n````\n";
  assert.match(JSON.parse((await ask("напиши код")).body).refused, /not a spec/);
  assert.equal((await send(url, "POST", "/api/chat", { history: [{ role: "clip", text: "?" }] })).status, 400);
  assert.equal((await send(url, "POST", "/api/proposal", { target: "keylang/flows/checkout.md", action: "merge" })).status, 400);

  // The page gives up (Скасувати, a closed tab): the request to the model is cancelled too.
  mock.hold = true;
  await abandonChat(url, mock, { history: [{ role: "you", text: "довга відповідь" }], view: "flow:checkout", selection: [] });
  const start = Date.now();

  while (mock.dropped === 0 && Date.now() - start < 10000) await new Promise((done) => setTimeout(done, 20));
  assert.equal(mock.dropped, 1, "the call to the model was dropped with the page's request");
  mock.hold = false;

  // No model: 409 with what to configure, before any request to a provider.
  writeFileSync(config, withoutAgent);
  const asked = mock.prompts.length;
  const missing = await ask("привіт");
  assert.equal(missing.status, 409, missing.body);
  assert.match(JSON.parse(missing.body).error, /no model configured: set `agent` in keylang\.json/);
  assert.equal(mock.prompts.length, asked);
});

test("studio: --read-only has no studio — the page is 404, its API 403, the diagram page has no link", async (t) => {
  const repo = checkoutRepo(t);
  const url = await startWeb(t, repo, { HOME: repo }, ["--read-only"]);
  assert.equal((await send(url, "GET", "/studio", undefined, {})).status, 404);
  assert.doesNotMatch((await send(url, "GET", "/diagrams", undefined, {})).body, /href="studio"/);

  for (const path of ["/api/projection", "/api/chat", "/api/proposal"]) assert.equal((await send(url, "POST", path, { format: "ts" })).status, 403, path);
  assert.equal(existsSync(join(repo, ".keylang")), false);
});
