// A project from a diagram (business-flows/29) without a browser: the
// drawing of an empty project — lanes, a process (trigger and three steps,
// one with a signature and a test, an event), a module and a deny line — as
// its first files through `runGreenfield`, the operation behind
// `POST /api/greenfield`. Then `check` exits 0 with the planned nodes
// unverified, and `feature <process>` lists the planned steps. A project with
// keylang.json, a target already there and a target that is a link are
// refused with nothing written; `keylang web --new <dir>` makes the directory
// and prints the URL of the editor, and refuses a directory with keylang.json.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";
import { readLayout } from "../src/diagram-layout.ts";
import { diagramOf } from "../src/diagram.ts";
import type { EditorModel } from "../src/diagram-proposal.ts";
import { greenfieldPlan } from "../src/greenfield.ts";
import { runGreenfield } from "../src/operations/greenfield.ts";
import { serveWeb } from "../src/tui/web.ts";
import { bin, keylang } from "./cli-helpers.ts";

function tempDir(t: { after: (f: () => void) => void }, name = "keylang-greenfield-"): string {
  const dir = mkdtempSync(join(tmpdir(), name));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

type Node = EditorModel["nodes"][number];
const lane = (key: string, name: string, y: number): EditorModel["lanes"][number] => ({ key, id: `planned:${name}`, label: name, x: 0, y, w: 720, h: 150 });
const node = (key: string, kind: string, id: string, label: string, x: number, y: number, extra: Partial<Node> = {}): Node => ({ key, kind, id, label, layer: null, tests: [], x, y, w: 160, h: 60, ...extra });
const edge = (key: string, kind: string, from: string, to: string): EditorModel["edges"][number] => ({ key, kind, from, to });

/** Two lanes and a process: a route trigger, three steps (one with a signature and a test), an event; a loose module; a deny between the lanes. */
function drawing(): EditorModel {
  return {
    view: "",
    mode: "draft",
    lanes: [lane("draft:1", "application", 0), lane("draft:2", "domain", 170)],
    nodes: [
      node("draft:3", "start", "planned:application.placeOrder", "placeOrder", 40, 50, { trigger: "route", description: "Покупець оформлює замовлення." }),
      node("draft:4", "task", "planned:application.validate", "validate", 140, 40, { signature: "(input: OrderInput) => Order", tests: ['test tests/validate.test.ts "rejects an empty cart"'] }),
      node("draft:5", "task", "planned:domain.price", "price", 140, 210),
      node("draft:6", "task", "planned:application.save", "save", 340, 40),
      node("draft:7", "event", "", "order.placed", 540, 50, { w: 36, h: 36 }),
      node("draft:8", "module", "planned:domain.pricing", "pricing", 400, 210),
    ],
    edges: [edge("draft:9", "sequence", "draft:3", "draft:4"), edge("draft:10", "sequence", "draft:4", "draft:5"), edge("draft:11", "sequence", "draft:5", "draft:6"), edge("draft:12", "emits", "draft:6", "draft:7"), edge("draft:13", "deny", "draft:2", "draft:1")],
  };
}

const FEATURE = `# flow placeOrder

Покупець оформлює замовлення.

- trigger route application.placeOrder
- step application.validate
  - test tests/validate.test.ts "rejects an empty cart"
- step domain.price
- step application.save
- emits event order.placed
- planned fn application.placeOrder
- planned fn application.validate (input: OrderInput) => Order
- planned fn domain.price
- planned fn application.save
`;

/** Every file under a directory, relative, sorted. */
function tree(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? tree(dir, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]))
    .sort();
}

test("greenfield: an empty project's drawing becomes keylang.json, rules, a feature per process, the idea, the layout and layer folders; check exits 0 with the planned steps unverified; feature lists them planned", async (t) => {
  const root = tempDir(t);
  const out = runGreenfield({ root, model: drawing(), languages: ["typescript"], idea: "Книжкова крамниця.\n\n- кошик\n# не заголовок" });
  assert.equal(out.status, "written", out.error ?? "");
  assert.deepEqual(tree(root), [
    "keylang.json",
    "keylang/README.md",
    "keylang/diagrams/flow--placeOrder.layout.json",
    "keylang/diagrams/layers.layout.json",
    "keylang/features/placeOrder.md",
    "keylang/features/structure.md",
    "keylang/rules.md",
    "src/application/.gitkeep",
    "src/domain/.gitkeep",
  ]);
  assert.deepEqual(JSON.parse(readFileSync(join(root, "keylang.json"), "utf8")), { format: 1, languages: ["typescript"], layers: { application: ["src/application/**"], domain: ["src/domain/**"] } });
  assert.equal(readFileSync(join(root, "keylang/rules.md"), "utf8"), "# rules\n\n- layers domain < application\n- deny domain application\n");
  assert.equal(readFileSync(join(root, "keylang/features/placeOrder.md"), "utf8"), FEATURE);
  assert.equal(readFileSync(join(root, "keylang/features/structure.md"), "utf8"), "# flow structure\n\nМодулі, функції й типи з діаграми, яких не досягає жоден процес: їхні рядки `- trigger` і `- step` ще треба написати.\n\n- planned module domain.pricing\n");
  const readme = readFileSync(join(root, "keylang/README.md"), "utf8");
  assert.match(readme, /^> Книжкова крамниця\.\n>\n> - кошик\n> # не заголовок$/m, "the idea is quoted: a list line or a heading in it is no spec");
  assert.deepEqual(out.features.map((f) => [f.slug, f.planned]), [
    ["placeOrder", ["application.placeOrder", "application.validate", "domain.price", "application.save"]],
    ["structure", ["domain.pricing"]],
  ]);
  assert.deepEqual(out.next, ["keylang agents --agents=claude", "keylang feature placeOrder", "keylang feature structure", "keylang map", "keylang check"]);

  // `check`: no fail — every step planned, unverified until the agent writes it.
  const check = keylang(root, ["check"]);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  for (const id of ["application.validate", "domain.price", "application.save"]) assert.match(check.stdout, new RegExp(`static unverified ${id.replace(".", "\\.")}: planned fn, not implemented`));
  assert.doesNotMatch(check.stdout, /K00\d/);
  // `feature`: the three steps (and the trigger's fn) planned, not implemented.
  const feature = keylang(root, ["feature", "placeOrder", "--format", "json"]);
  assert.equal(feature.status, 1, feature.stderr);
  const report = JSON.parse(feature.stdout) as { gaps: { kind: string; id: string }[] };
  const planned = report.gaps.filter((gap) => gap.kind === "planned").map((gap) => gap.id);
  assert.deepEqual(planned.filter((id) => id !== "application.placeOrder"), ["application.validate", "domain.price", "application.save"]);
  assert.ok(planned.includes("application.placeOrder"), "the trigger's fn is planned too");

  // The layout: the process view opens with the shapes where they were drawn.
  const analysis = await analyze({ root, withoutEvidence: true });
  const saved = readLayout(root, "keylang", "flow:placeOrder").file;
  const view = diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results: [], view: { kind: "flow", name: "placeOrder" }, saved });
  const price = view.nodes.find((n) => n.ref?.id === "domain.price");
  assert.deepEqual([price?.x, price?.y], [140, 210]);
});

test("greenfield: a project with keylang.json, a target already there, a target that is a link, a link out of the project — 409 and nothing written", async (t) => {
  // keylang.json: the project exists.
  const existing = tempDir(t);
  writeFileSync(join(existing, "keylang.json"), "{}\n");
  const refused = runGreenfield({ root: existing, model: drawing(), languages: ["typescript"], idea: "" });
  assert.deepEqual([refused.status, refused.exitCode], ["conflict", 1]);
  assert.match(refused.error!, /keylang\.json is there/);
  assert.deepEqual(tree(existing), ["keylang.json"]);

  // A target already there: nothing written, keylang.json included.
  const taken = tempDir(t);
  mkdirSync(join(taken, "keylang"));
  writeFileSync(join(taken, "keylang/rules.md"), "# rules\n");
  const blocked = runGreenfield({ root: taken, model: drawing(), languages: ["typescript"], idea: "" });
  assert.deepEqual([blocked.status, blocked.exitCode, blocked.files], ["conflict", 1, ["keylang/rules.md"]]);
  assert.match(blocked.error!, /nothing written: keylang\/rules\.md: already exists/);
  assert.deepEqual(tree(taken), ["keylang/rules.md"]);

  // A target that is a link — even one whose target does not exist.
  const linked = tempDir(t);
  const outside = tempDir(t, "keylang-greenfield-outside-");
  mkdirSync(join(linked, "keylang"));
  symlinkSync(join(outside, "readme.md"), join(linked, "keylang/README.md"));
  const link = runGreenfield({ root: linked, model: drawing(), languages: ["typescript"], idea: "an idea" });
  assert.deepEqual([link.status, link.files], ["conflict", ["keylang/README.md"]]);
  assert.equal(existsSync(join(outside, "readme.md")), false, "nothing written through the link");
  assert.equal(existsSync(join(linked, "keylang.json")), false);

  // A directory on the way that leads out of the project.
  const out = tempDir(t);
  symlinkSync(outside, join(out, "src"));
  const away = runGreenfield({ root: out, model: drawing(), languages: ["typescript"], idea: "" });
  assert.equal(away.status, "conflict");
  assert.match(away.error!, /src\/application\/\.gitkeep: leads out of the repository through a link/);
  assert.deepEqual(readdirSync(outside), []);
  assert.equal(existsSync(join(out, "keylang.json")), false);
});

test("greenfield: what is not a project yet — no lane, no language, a shape outside every lane, a process name a feature cannot have", (t) => {
  const root = tempDir(t);
  const model = drawing();
  assert.match(runGreenfield({ root, model: { ...model, lanes: [] }, languages: ["typescript"] }).error!, /draw at least one lane/);
  assert.match(runGreenfield({ root, model, languages: [] }).error!, /pick a language/);
  assert.match(runGreenfield({ root, model, languages: ["cobol"] }).error!, /languages: `cobol`/);
  const loose = { ...model, nodes: [...model.nodes, node("draft:20", "task", "planned:step", "step", 900, 600)] };
  assert.match(runGreenfield({ root, model: loose, languages: ["typescript"] }).error!, /task `step` is in no lane/);
  const reserved = { ...model, lanes: [...model.lanes, lane("draft:21", "external", 340)] };
  assert.match(runGreenfield({ root, model: reserved, languages: ["typescript"] }).error!, /lane `external`: a reserved name/);
  const named = { ...model, nodes: model.nodes.map((n) => (n.key === "draft:3" ? { ...n, id: "planned:application.оформити" } : n)) };
  assert.match(runGreenfield({ root, model: named, languages: ["typescript"] }).error!, /process `оформити`: a feature's name is Latin letters/);
  assert.deepEqual(readdirSync(root), [], "nothing written");
  // The plan alone: hexagonal lanes, an external system as a planned fn of its lane, a dependency line as an allow.
  const plan = greenfieldPlan({
    specDir: "keylang",
    languages: ["python", "php"],
    idea: "",
    model: {
      view: "",
      lanes: [lane("l1", "adapters", 0), lane("l2", "ports", 170), lane("l3", "domain", 340)],
      nodes: [node("n1", "start", "planned:adapters.webhook", "webhook", 20, 20, { trigger: "webhook" }), node("n2", "external", "planned:adapters.stripe", "Stripe", 200, 20), node("n3", "module", "planned:ports.billing", "billing", 20, 190), node("n4", "module", "planned:domain.money", "money", 20, 360)],
      edges: [edge("e1", "sequence", "n1", "n2"), edge("e2", "dependency", "n3", "n4")],
    },
  });
  assert.ok(typeof plan !== "string", String(plan));
  const files = new Map(plan.files.map((f) => [f.path, f.text]));
  assert.equal(files.get("keylang/features/webhook.md"), "# flow webhook\n\n- trigger webhook adapters.webhook\n- step adapters.stripe\n- planned fn adapters.webhook\n- planned fn adapters.stripe\n");
  assert.equal(files.get("keylang/rules.md"), "# rules\n\n- layers domain < ports < adapters\n- allow ports.billing domain.money\n");
  assert.deepEqual(JSON.parse(files.get("keylang.json")!).languages, ["python", "php"]);
});

function send(url: URL, method: string, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, method, headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) } }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("web: GET /api/greenfield says whether a new project may be drawn; POST writes it once — the guards of every write, then 409 with nothing written (business-flows/29)", async (t) => {
  const root = tempDir(t);
  const server = await serveWeb({ root, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const bearer = { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("t")}` };
  const json = { "Content-Type": "application/json" };
  const body = JSON.stringify({ model: drawing(), languages: ["typescript"], idea: "Книжкова крамниця." });
  const before = JSON.parse((await send(url, "GET", "/api/greenfield", bearer, "")).body) as { available: boolean; languages: string[] };
  assert.deepEqual([before.available, before.languages], [true, ["typescript", "python", "php", "rust"]]);

  assert.equal((await send(url, "POST", "/api/greenfield", json, body)).status, 403);
  assert.equal((await send(url, "POST", "/api/greenfield", { ...json, ...bearer, Origin: "http://evil.example" }, body)).status, 403);
  assert.equal((await send(url, "POST", "/api/greenfield", { ...json, ...bearer, "Sec-Fetch-Site": "cross-site" }, body)).status, 403);
  assert.equal((await send(url, "POST", "/api/greenfield", { ...bearer, "Content-Type": "text/plain" }, body)).status, 415);
  assert.equal((await send(url, "PUT", "/api/greenfield", { ...json, ...bearer }, body)).status, 405);
  assert.equal((await send(url, "POST", "/api/greenfield", { ...json, ...bearer }, JSON.stringify({ model: { view: "" }, languages: ["typescript"] }))).status, 400);
  assert.deepEqual(readdirSync(root), []);

  const made = await send(url, "POST", "/api/greenfield", { ...json, ...bearer }, body);
  assert.equal(made.status, 200, made.body);
  const answer = JSON.parse(made.body) as { status: string; files: string[]; features: { slug: string }[] };
  assert.equal(answer.status, "written");
  assert.ok(answer.files.includes("keylang.json"));
  assert.equal(readFileSync(join(root, "keylang/features/placeOrder.md"), "utf8"), FEATURE);
  // The project exists now: no more drawing it from scratch, and its flow is a view.
  assert.equal((JSON.parse((await send(url, "GET", "/api/greenfield", bearer, "")).body) as { available: boolean }).available, false);
  const again = await send(url, "POST", "/api/greenfield", { ...json, ...bearer }, body);
  assert.equal(again.status, 409);
  assert.match(JSON.parse(again.body).error, /keylang\.json is there/);
  const views = JSON.parse((await send(url, "GET", "/api/views", bearer, "")).body) as { flows: string[] };
  assert.deepEqual(views.flows.sort(), ["placeOrder", "structure"]);
  const diagram = JSON.parse((await send(url, "GET", "/api/diagram?view=flow&name=placeOrder", bearer, "")).body) as { nodes: { ref?: { id?: string }; verdict?: string | null }[] };
  assert.equal(diagram.nodes.find((n) => n.ref?.id === "domain.price")?.verdict, "planned");
});

/** `keylang web --new <dir>` until it prints its URL; the child stops with the test. */
async function webNew(t: { after: (f: () => void | Promise<void>) => void }, cwd: string, dir: string): Promise<{ url: string | null; code: number | null; stderr: string }> {
  const child = spawn(process.execPath, [bin, "web", "--new", dir, "--port", "0"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((done) => child.once("exit", done));
    }
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
  const exited = new Promise<number | null>((done) => child.once("exit", (code) => done(code)));
  const start = Date.now();
  while (!/keylang web: (\S+)/.test(out)) {
    if (child.exitCode !== null) return { url: null, code: await exited, stderr: err };
    if (Date.now() - start > 20000) throw new Error(`keylang web --new printed no URL: ${out}${err}`);
    await new Promise((done) => setTimeout(done, 50));
  }
  return { url: /keylang web: (\S+)/.exec(out)![1]!, code: null, stderr: err };
}

test("keylang web --new <dir>: makes the directory and prints the URL of the editor with the new project open; a directory with keylang.json is refused (2)", async (t) => {
  const cwd = tempDir(t);
  const started = await webNew(t, cwd, "shop");
  assert.match(started.url!, /^http:\/\/localhost:\d+\/diagrams#t=[0-9a-f]{32}&new=1$/);
  assert.ok(existsSync(join(cwd, "shop")));
  const page = await send(new URL(started.url!), "GET", "/diagrams", {}, "");
  assert.equal(page.status, 200);

  writeFileSync(join(cwd, "shop/keylang.json"), "{}\n");
  const refused = await webNew(t, cwd, "shop");
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /shop\/keylang\.json exists: the project is there already/);
});
