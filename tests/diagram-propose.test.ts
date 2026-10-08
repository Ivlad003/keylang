// «Запропонувати зміни» of the diagram editor without a browser
// (business-flows/24): the editor's model against the diagram of its view,
// through the operation `POST /api/diagram-proposal` and
// `keylang diagram propose` share — planned steps with signatures and
// tests, `when` and `parallel`, `emits`, a trigger's kind, a new flow that
// `continues` this one, a new lane as a `layers` line and keylang.json
// layers (printed only); the CLI with `--print` and without; and the layout
// file's keys (`src/diagram-layout.ts`).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { diagramKeys, layoutText, layoutToFile, viewSlug } from "../src/diagram-layout.ts";
import { diagramOf } from "../src/diagram.ts";
import { analyze } from "../src/analyze.ts";
import { runDiagramPropose, specHash } from "../src/operations/diagram-propose.ts";
import { bin } from "./cli-helpers.ts";
import { editorModelOf, type FixtureModel } from "./diagrams-fixture.ts";
import { checkoutRepo, CHECKOUT_FLOW } from "./tui-fixture.ts";

/** The editor's model of the checkout flow «з коду», and the specs' hash. */
async function opened(repo: string): Promise<{ model: FixtureModel; hash: string }> {
  const analysis = await analyze({ root: repo, withoutEvidence: true });
  const diagram = diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results: [], view: { kind: "flow", name: "checkout" } });
  return { model: editorModelOf("flow:checkout", diagram), hash: specHash(repo, analysis.docs) };
}

type Node = FixtureModel["nodes"][number];
function node(key: string, kind: string, id: string, label: string, extra: Partial<Node> = {}): Node {
  return { key, id, kind, label, layer: null, tests: [], x: 0, y: 0, w: 160, h: 60, ...extra };
}
function edge(key: string, kind: string, from: string, to: string, label?: string): FixtureModel["edges"][number] {
  return { key, kind, from, to, ...(label !== undefined ? { label } : {}) };
}

async function propose(repo: string, model: FixtureModel): Promise<Awaited<ReturnType<typeof runDiagramPropose>>> {
  return runDiagramPropose({ root: repo, view: model.view, model, print: true });
}

test("diagram propose: a planned step with its signature and test lands after the step it follows, its declaration at the end of the flow — one hunk, prose kept", async (t) => {
  const repo = checkoutRepo(t);
  const { model } = await opened(repo);
  const pay = node("draft:1", "task", "planned:application.pay", "pay", { signature: "(order: Order) => Receipt", tests: ['test tests/pay.test.ts "charges once"'] });
  const out = await propose(repo, { ...model, nodes: [...model.nodes, pay], edges: [...model.edges, edge("draft:2", "sequence", "step:8", "draft:1")] });
  assert.equal(out.status, "printed", out.error ?? "");
  assert.deepEqual(out.targets.map((x) => [x.target, x.hunks.length, x.proposal]), [["keylang/flows/checkout.md", 1, null]]);
  assert.equal(out.targets[0]!.text, CHECKOUT_FLOW.replace("  - step infrastructure.store.save\n", '  - step infrastructure.store.save\n  - step application.pay\n    - test tests/pay.test.ts "charges once"\n- planned fn application.pay (order: Order) => Receipt\n'));
  assert.deepEqual(out.weakenings, []);
  assert.equal(existsSync(join(repo, ".keylang")), false, "--print writes nothing");
});

test("diagram propose: `when` with its branch, a `parallel` group, `emits`, a timer and a trigger's kind", async (t) => {
  const repo = checkoutRepo(t);
  const { model } = await opened(repo);
  // A `when` after `save`: its first line out is the branch.
  const when = await propose(repo, {
    ...model,
    nodes: [...model.nodes, node("draft:1", "gateway", "", "paid by card"), node("draft:2", "task", "domain.order.create", "domain.order.create")],
    edges: [...model.edges, edge("draft:3", "sequence", "step:8", "draft:1"), edge("draft:4", "sequence", "draft:1", "draft:2")],
  });
  assert.equal(when.targets[0]!.text, CHECKOUT_FLOW.replace("  - step infrastructure.store.save\n", "  - step infrastructure.store.save\n  - when paid by card\n    - step domain.order.create\n"));
  // A parallel group right after the trigger: two steps in it, then the join, then what follows the group.
  const parallel = await propose(repo, {
    ...model,
    nodes: [...model.nodes, node("draft:1", "parallel", "", "parallel", { role: "split" }), node("draft:2", "task", "domain.order.create", "create"), node("draft:3", "task", "infrastructure.store.save", "save"), node("draft:4", "parallel", "", "parallel", { role: "join" }), node("draft:5", "event", "", "order.paid")],
    edges: [...model.edges, edge("e1", "sequence", "trigger:5", "draft:1"), edge("e2", "sequence", "draft:1", "draft:2"), edge("e3", "sequence", "draft:1", "draft:3"), edge("e4", "sequence", "draft:2", "draft:4"), edge("e5", "sequence", "draft:3", "draft:4"), edge("e6", "emits", "draft:4", "draft:5")],
  });
  assert.equal(parallel.targets[0]!.text, CHECKOUT_FLOW.replace("- trigger presentation.terminal.checkout\n", "- trigger presentation.terminal.checkout\n- parallel\n  - step domain.order.create\n  - step infrastructure.store.save\n- emits event order.paid\n"));
  // A timer beside a step, and the trigger now a cron job.
  const trigger = model.nodes.find((n) => n.key === "trigger:5")!;
  const timed = await propose(repo, {
    ...model,
    nodes: [...model.nodes.filter((n) => n !== trigger), { ...trigger, trigger: "cron" }, node("draft:1", "timer", "", "every @daily")],
    edges: [...model.edges, edge("e1", "sequence", "step:7", "draft:1")],
  });
  assert.equal(timed.targets[0]!.text, CHECKOUT_FLOW.replace("- trigger presentation.terminal.checkout", "- trigger cron presentation.terminal.checkout").replace("  - step domain.order.create\n", "  - step domain.order.create\n  - every @daily\n"));
  // The trigger kind the code already has is no change.
  const same = await propose(repo, { ...model, nodes: [...model.nodes.filter((n) => n !== trigger), { ...trigger, trigger: "fn" }] });
  assert.deepEqual(same.targets, []);
});

test("diagram propose: a new trigger starts a new flow that `continues` this one; a removed step comes back with K108", async (t) => {
  const repo = checkoutRepo(t);
  const { model } = await opened(repo);
  const out = await propose(repo, {
    ...model,
    nodes: [...model.nodes, node("draft:1", "start", "planned:presentation.webhook.paid", "paid", { trigger: "webhook" }), node("draft:2", "task", "domain.order.create", "create")],
    edges: [...model.edges, edge("draft:3", "sequence", "draft:1", "draft:2"), edge("draft:4", "continues", "step:8", "draft:1")],
  });
  assert.deepEqual(out.targets.map((x) => x.target), ["keylang/flows/paid.md"]);
  assert.equal(out.targets[0]!.text, "# flow paid\n\n- continues checkout\n- trigger webhook presentation.webhook.paid\n- step domain.order.create\n- planned fn presentation.webhook.paid\n");
  // `save` taken off the canvas: its line goes, and the answer says the spec got weaker.
  const removed = await propose(repo, { ...model, nodes: model.nodes.filter((n) => n.key !== "step:8"), edges: model.edges.filter((e) => e.to !== "step:8" && e.from !== "step:8") });
  assert.equal(removed.targets[0]!.text, CHECKOUT_FLOW.replace("  - step infrastructure.store.save\n", ""));
  assert.deepEqual(
    removed.weakenings.map((w) => w.message),
    ["K108 spec weakened: step `infrastructure.store.save` of flow `checkout` (keylang/flows/checkout.md:8 at the specs on disk) was removed"],
  );
});

test("diagram propose: a new lane between two others is a `layers` line that agrees with the order, keylang.json gets the layer printed only, a deny to it is a rule", async (t) => {
  const repo = checkoutRepo(t);
  const { model } = await opened(repo);
  const application = model.lanes.find((l) => l.id === "application")!;
  const infrastructure = model.lanes.find((l) => l.id === "infrastructure")!;
  const lane = { key: "draft:1", id: "planned:payments", label: "payments", x: 0, y: (application.y + infrastructure.y) / 2, w: 600, h: 10 };
  const out = await propose(repo, { ...model, lanes: [...model.lanes, lane], edges: [...model.edges, edge("draft:2", "deny", "lane:domain", "draft:1")] });
  assert.deepEqual(out.targets.map((x) => x.target), ["keylang/rules.md"]);
  assert.equal(out.targets[0]!.text, "# rules\n\n- layers domain < infrastructure < application < presentation\n- layers application < payments < presentation\n- deny domain payments\n");
  assert.deepEqual(out.weakenings, []);
  assert.match(out.config!.diff, /\+ {4}"payments": \[\n\+ {6}"src\/payments\/\*\*"/);
  assert.match(out.config!.note, /printed only/i);
  assert.equal(readFileSync(join(repo, "keylang.json"), "utf8").includes("payments"), false);
});

test("diagram propose: a drawing opened before the specs changed is refused; nothing is computed against the new text", async (t) => {
  const repo = checkoutRepo(t);
  const { model, hash } = await opened(repo);
  writeFileSync(join(repo, "keylang/flows/checkout.md"), CHECKOUT_FLOW.replace("Checkout from the terminal.", "Checkout from the terminal, once."));
  const out = await runDiagramPropose({ root: repo, view: "flow:checkout", model, specHash: hash });
  assert.deepEqual([out.status, out.exitCode], ["conflict", 1]);
  assert.match(out.error!, /specs changed since this diagram was opened/);
});

test("keylang diagram propose: --print shows the change and writes nothing; without it, one proposal that `proposals` lists; a bad invocation is 2", async (t) => {
  const repo = checkoutRepo(t);
  const { model, hash } = await opened(repo);
  const drawn = { ...model, nodes: [...model.nodes, node("draft:1", "task", "domain.order.create", "create")], edges: [...model.edges, edge("draft:2", "sequence", "step:8", "draft:1")] };
  writeFileSync(join(repo, "model.json"), JSON.stringify({ model: drawn, specHash: hash }));
  const printed = spawnSync(process.execPath, [bin, "diagram", "propose", "flow:checkout", "--from", "model.json", "--print"], { cwd: repo, encoding: "utf8" });
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout, "keylang/flows/checkout.md\n@@ line 9 @@\n+  - step domain.order.create\n");
  assert.equal(existsSync(join(repo, ".keylang/proposals")), false);
  const made = spawnSync(process.execPath, [bin, "diagram", "propose", "flow:checkout", "--from", "model.json"], { cwd: repo, encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr);
  assert.match(made.stderr, /\.keylang\/proposals\/keylang\/flows\/checkout\.md: proposed for keylang\/flows\/checkout\.md \(1 hunk\)/);
  assert.equal(spawnSync(process.execPath, [bin, "proposals"], { cwd: repo, encoding: "utf8" }).stdout, "keylang/flows/checkout.md: +1 -0\n");
  // Again while it waits: 1.
  assert.equal(spawnSync(process.execPath, [bin, "diagram", "propose", "flow:checkout", "--from", "model.json"], { cwd: repo, encoding: "utf8" }).status, 1);
  assert.equal(spawnSync(process.execPath, [bin, "diagram", "propose", "flow:checkout"], { cwd: repo, encoding: "utf8" }).status, 2);
  assert.equal(spawnSync(process.execPath, [bin, "diagram", "propose", "layers", "--from", "model.json"], { cwd: repo, encoding: "utf8" }).status, 2, "the model draws another view");
});

test("layout file keys: a flow's shapes by what they say, twins apart, parallel gateways by their branches; the text is the same for the same layout", () => {
  const diagram = {
    nodes: [
      { id: "trigger:3", kind: "start", label: "a.b.t", ref: { id: "a.b.t" } },
      { id: "step:4", kind: "task", label: "a.b.s", ref: { id: "a.b.s" } },
      { id: "step:9", kind: "task", label: "a.b.s", ref: { id: "a.b.s" } },
      { id: "when:5", kind: "gateway", label: "paid" },
      { id: "parallel:6", kind: "parallel", label: "parallel" },
      { id: "step:7", kind: "task", label: "a.c.x", ref: { id: "a.c.x" } },
      { id: "parallel:6:join", kind: "parallel", label: "parallel" },
      { id: "hole:8", kind: "hole", label: "?" },
      { id: "fn:a.c.y", kind: "fn", label: "a.c.y", ref: { id: "a.c.y" } },
    ],
    edges: [
      { from: "parallel:6", to: "step:7", kind: "sequence" },
      { from: "step:7", to: "parallel:6:join", kind: "sequence" },
      { from: "hole:8", to: "step:9", kind: "sequence" },
    ],
    groups: [{ id: "a" }],
  };
  assert.deepEqual(Object.fromEntries(diagramKeys(diagram)), {
    "trigger:3": "trigger:a.b.t",
    "step:4": "step:a.b.s",
    "step:9": "step:a.b.s#2",
    "when:5": "when:paid",
    "parallel:6": "parallel:step:a.c.x",
    "step:7": "step:a.c.x",
    "parallel:6:join": "parallel-join:step:a.c.x",
    "hole:8": "hole:step:a.b.s#2",
    "fn:a.c.y": "fn:a.c.y",
  });
  assert.equal(viewSlug("flow:checkout"), "flow--checkout");
  assert.equal(viewSlug("entry:app.handlers/pay"), "entry--app.handlers_2fpay");
  const one = layoutText(layoutToFile("flow:x", { "step:9": { x: 1.234, y: 2 }, "step:4": { x: 3, y: 4, w: 5, h: 6 } }, diagram));
  const two = layoutText(layoutToFile("flow:x", { "step:4": { x: 3, y: 4, w: 5, h: 6 }, "step:9": { x: 1.2349, y: 2 } }, diagram));
  assert.equal(one, two);
  assert.equal(one, '{\n  "format": 1,\n  "view": "flow:x",\n  "shapes": {\n    "step:a.b.s": {\n      "h": 6,\n      "w": 5,\n      "x": 3,\n      "y": 4\n    },\n    "step:a.b.s#2": {\n      "x": 1.23,\n      "y": 2\n    }\n  },\n  "edges": {}\n}\n');
});
