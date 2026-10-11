// `diagramOf` (business-flows/20): the diagram model of a flow, an entry
// point's call tree, the layers, and the views not available yet — a pure
// function of the snapshot, the SpecIR and the check results, laid out by a
// deterministic `layout`. Fixtures in TypeScript and Python.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { analyze, type Analysis } from "../src/analyze.ts";
import { checkResults } from "../src/check-results.ts";
import { diagramOf, layout, parseView, viewsOf, type Diagram, type DiagramView } from "../src/diagram.ts";

const TS_SHOP = {
  "keylang.json": JSON.stringify({ languages: ["typescript"], layers: { domain: ["src/domain/**"], infrastructure: ["src/infrastructure/**"], application: ["src/application/**"], presentation: ["src/presentation/**"] } }),
  "package.json": JSON.stringify({ name: "shop", bin: { shop: "src/presentation/cli.ts" } }),
  "src/domain/order.ts": 'import { save } from "../infrastructure/store.ts";\nexport function create(): void { save(); }\nexport function reject(): void {}\nexport function charge(): void {}\n',
  "src/infrastructure/store.ts": 'import { readFileSync } from "node:fs";\nexport function save(): void { readFileSync("x"); }\n',
  "src/application/purchase.ts": 'import { create, reject } from "../domain/order.ts";\nexport function buy(gateway: any): void {\n  create();\n  reject();\n  gateway.charge();\n}\n',
  "src/presentation/terminal.ts": 'import { buy } from "../application/purchase.ts";\nexport function checkout(): void {\n  buy(null);\n}\n',
  "src/presentation/cli.ts": 'import { checkout } from "./terminal.ts";\ncheckout();\n',
  "keylang/rules.md": "# rules\n\n- layers domain < infrastructure < application < presentation\n- deny domain infrastructure\n- allow presentation application\n",
  "keylang/flows/checkout.md": [
    "# flow checkout",
    "",
    "- planned fn domain.order.audit",
    "- trigger presentation.terminal.checkout",
    "- step application.purchase.buy",
    "  - step domain.order.create",
    "  - when the cart is empty",
    "    - then domain.order.reject",
    "    - then show an error",
    "  - step domain.order.charge",
    "- step domain.order.audit",
    "- emits event order.placed",
    "",
  ].join("\n"),
} satisfies Record<string, string>;

const PY_SHOP = {
  "keylang.json": JSON.stringify({ languages: ["python"], layers: { domain: ["shop/domain/**"], app: ["shop/app/**"] } }),
  "pyproject.toml": '[project]\nname = "shop"\nversion = "1.0"\n\n[project.scripts]\nshop = "shop.app.main:run"\n',
  "shop/__init__.py": "",
  "shop/domain/__init__.py": "",
  "shop/domain/order.py": "def create():\n    validate()\n\n\ndef validate():\n    pass\n",
  "shop/app/__init__.py": "",
  "shop/app/main.py": "from shop.domain.order import create\n\n\ndef run(handler):\n    create()\n    handler.notify()\n",
  "keylang/flows/order.md": "# flow order\n\n- trigger app.main.run\n- step domain.order.create\n  - step domain.order.validate\n",
} satisfies Record<string, string>;

async function analyzed(t: { after: (f: () => void) => void }, files: Record<string, string>): Promise<Analysis> {
  const dir = mkdtempSync(join(tmpdir(), "keylang-diagram-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }

  return analyze({ root: dir });
}

/** `parseView` answers a query it refuses with the reason text instead of a view. */
function isRefusal(view: DiagramView | string): view is string {
  return typeof view === "string";
}

function draw(analysis: Analysis, view: DiagramView): Diagram {
  const results = checkResults(analysis.verdicts, analysis.snapshot?.snapshotId ?? null, analysis.diagnostics);

  return diagramOf({ snapshot: analysis.snapshot, spec: analysis.spec, results, view });
}

const node = (diagram: Diagram, kind: string, label: string) => {
  const found = diagram.nodes.find((n) => n.kind === kind && n.label === label);
  assert.ok(found, `no ${kind} node "${label}" in ${JSON.stringify(diagram.nodes.map((n) => `${n.kind}:${n.label}`))}`);

  return found;
};

const edge = (diagram: Diagram, from: string, to: string) => diagram.edges.find((e) => e.from === from && e.to === to);

test("diagram: a flow is a start event, tasks, a gateway with its branch, a hole with its reason and an event, in lanes by layer", async (t) => {
  const analysis = await analyzed(t, TS_SHOP);
  const d = draw(analysis, { kind: "flow", name: "checkout" });
  assert.equal(d.reason, undefined);
  const start = node(d, "start", "presentation.terminal.checkout");
  assert.equal(start.verdict, "ok");
  assert.equal(start.group, "presentation");
  assert.deepEqual(start.ref, { id: "presentation.terminal.checkout", file: "src/presentation/terminal.ts", line: 2, specFile: "keylang/flows/checkout.md", specLine: 4 });
  const buy = node(d, "task", "application.purchase.buy");
  assert.equal(buy.verdict, "ok");
  assert.equal(buy.group, "application");
  const create = node(d, "task", "domain.order.create");
  const gateway = node(d, "gateway", "the cart is empty");
  const reject = node(d, "task", "domain.order.reject");
  const prose = node(d, "task", "show an error");
  const charge = node(d, "task", "domain.order.charge");
  assert.equal(charge.verdict, "unverified");
  const audit = node(d, "task", "domain.order.audit");
  assert.equal(audit.verdict, "planned");
  const event = node(d, "event", "order.placed");
  // The hole sits on the route into the step it leaves unverified, with the reason `check` gives.
  const hole = d.nodes.find((n) => n.kind === "hole");
  assert.ok(hole);
  assert.equal(hole.label, "?");
  assert.match(hole.reason ?? "", /call through a local value `gateway\.charge` at src\/application\/purchase\.ts:5:3 may reach it/);
  assert.equal(d.nodes.filter((n) => n.kind === "hole").length, 1, "an ok or planned step has no hole");
  // Execution order: trigger → buy → create → gateway; the branch under its condition; the default path on.
  assert.equal(edge(d, start.id, buy.id)?.kind, "sequence");
  assert.equal(edge(d, start.id, buy.id)?.verdict, "ok");
  assert.ok(edge(d, buy.id, create.id));
  assert.ok(edge(d, create.id, gateway.id));
  assert.equal(edge(d, gateway.id, reject.id)?.label, "the cart is empty");
  assert.ok(edge(d, reject.id, prose.id));
  assert.ok(edge(d, gateway.id, hole.id), "the default path goes on past the gateway");
  assert.equal(edge(d, hole.id, charge.id)?.verdict, "unverified");
  assert.ok(edge(d, charge.id, audit.id));
  assert.equal(edge(d, audit.id, event.id)?.kind, "emits");
  // Lanes: one per layer the flow touches, in the layers' order, the event in no lane.
  assert.deepEqual(
    d.groups.map((g) => g.id),
    ["domain", "application", "presentation"],
  );
  assert.equal(event.group, undefined);

  // Laid out: left to right by depth, every node sized.
  for (const n of d.nodes) assert.ok(n.w > 0 && n.h > 0 && Number.isFinite(n.x) && Number.isFinite(n.y), n.id);
  assert.ok(start.x < buy.x && buy.x < create.x && create.x < gateway.x && gateway.x < reject.x);

  for (const g of d.groups) for (const n of d.nodes.filter((m) => m.group === g.id)) assert.ok(n.y >= g.y && n.y + n.h <= g.y + g.h, `${n.id} inside lane ${g.id}`);
});

test("diagram: a flow in Python has the same shape", async (t) => {
  const analysis = await analyzed(t, PY_SHOP);
  const d = draw(analysis, { kind: "flow", name: "order" });
  const start = node(d, "start", "app.main.run");
  const create = node(d, "task", "domain.order.create");
  const validate = node(d, "task", "domain.order.validate");
  assert.equal(create.verdict, "ok");
  assert.equal(validate.verdict, "ok");
  assert.ok(edge(d, start.id, create.id) && edge(d, create.id, validate.id));
  assert.deepEqual(
    d.groups.map((g) => g.id),
    ["domain", "app"],
  );
});

test("diagram: an unknown flow, an unknown entry, events and processes give an empty diagram with the reason", async (t) => {
  const analysis = await analyzed(t, TS_SHOP);

  for (const [view, reason] of [
    [{ kind: "flow", name: "nope" }, /no flow named `nope`/],
    [{ kind: "entry", id: "nope.nope" }, /no entry point or fn `nope\.nope`/],
    [{ kind: "event", name: "order.placed" }, /no event `order\.placed` in the snapshot/],
    [{ kind: "process", domain: "sales" }, /processes/],
  ] as const) {
    const d = draw(analysis, view);
    assert.deepEqual([d.nodes, d.edges, d.groups], [[], [], []], view.kind);
    assert.match(d.reason ?? "", reason, view.kind);
  }

  // Without a snapshot (specs checked on their own) the code views say so.
  const bare = diagramOf({ snapshot: null, spec: analysis.spec, results: [], view: { kind: "layers" } });
  assert.match(bare.reason ?? "", /no snapshot/);
});

test("diagram: an entry point's call tree goes as deep as asked, with the holes of the fns it opens", async (t) => {
  const analysis = await analyzed(t, TS_SHOP);
  // A fn that is no entry point is a root too; depth 1 opens only the root.
  const shallow = draw(analysis, { kind: "entry", id: "presentation.terminal.checkout", depth: 1 });
  const root = node(shallow, "start", "presentation.terminal.checkout");
  assert.equal(root.ref?.file, "src/presentation/terminal.ts");
  const buy = node(shallow, "fn", "application.purchase.buy");
  assert.equal(edge(shallow, root.id, buy.id)?.kind, "call");
  assert.equal(shallow.nodes.find((n) => n.label === "domain.order.create"), undefined, "depth 1 stops at buy");
  assert.equal(shallow.nodes.find((n) => n.kind === "hole"), undefined, "buy is not opened, so its hole is not shown");
  const deeper = draw(analysis, { kind: "entry", id: "presentation.terminal.checkout", depth: 2 });
  const create = node(deeper, "fn", "domain.order.create");
  assert.ok(edge(deeper, node(deeper, "fn", "application.purchase.buy").id, create.id));
  assert.equal(deeper.nodes.find((n) => n.label === "infrastructure.store.save"), undefined, "depth 2 stops at create");
  const hole = deeper.nodes.find((n) => n.kind === "hole");
  assert.ok(hole);
  assert.match(hole.reason ?? "", /gateway\.charge/);
  assert.ok(edge(deeper, node(deeper, "fn", "application.purchase.buy").id, hole.id));
  assert.equal(create.group, "domain");
  // A script entry runs its module's top level, whose calls the snapshot does not have: its imports stand for them.
  const script = draw(analysis, { kind: "entry", id: "presentation.cli" });
  const start = node(script, "start", "shop");
  assert.equal(start.ref?.id, "presentation.cli");
  const terminal = node(script, "module", "presentation.terminal");
  assert.equal(edge(script, start.id, terminal.id)?.kind, "dependency");
  // Python: a `[project.scripts]` entry and an unresolved call on the route.
  const py = await analyzed(t, PY_SHOP);
  const pd = draw(py, { kind: "entry", id: "app.main.run" });
  node(pd, "start", "shop");
  node(pd, "fn", "domain.order.create");
  node(pd, "fn", "domain.order.validate");
  assert.match(pd.nodes.find((n) => n.kind === "hole")?.reason ?? "", /notify/);
});

test("diagram: layers with their dependencies, the allow and the deny with its verdict", async (t) => {
  const analysis = await analyzed(t, TS_SHOP);
  const d = draw(analysis, { kind: "layers" });
  assert.deepEqual(
    d.nodes.map((n) => `${n.kind}:${n.label}`),
    ["layer:domain", "layer:infrastructure", "layer:application", "layer:presentation", "layer:external"],
  );
  const id = (label: string): string => node(d, "layer", label).id;
  const deny = d.edges.find((e) => e.kind === "deny");
  assert.deepEqual(deny && { from: deny.from, to: deny.to, verdict: deny.verdict, label: deny.label }, { from: id("domain"), to: id("infrastructure"), verdict: "fail", label: "deny domain infrastructure" });
  const allow = d.edges.find((e) => e.kind === "allow");
  assert.deepEqual(allow && { from: allow.from, to: allow.to }, { from: id("presentation"), to: id("application") });
  const dep = edge(d, id("application"), id("domain"));
  assert.equal(dep?.kind, "dependency");
  assert.ok(d.edges.some((e) => e.kind === "dependency" && e.from === id("domain") && e.to === id("infrastructure")));
  assert.equal(node(d, "layer", "domain").verdict, "fail");
  // A stack in the declared order, one layer a row, like an architecture drawing: the canvas draws the edges as arcs beside it.
  assert.equal(d.direction, "down");
  assert.deepEqual(new Set(d.nodes.map((n) => n.x)).size, 1, "one column");
  assert.deepEqual(d.nodes.map((n) => n.y), d.nodes.map((n) => n.y).sort((a, b) => a - b), "rows in the declared order");
  assert.equal(new Set(d.nodes.map((n) => n.y)).size, d.nodes.length, "one layer a row");
});

test("diagram: the same inputs give the same diagram; layout is pure and manual positions win", async (t) => {
  const one = await analyzed(t, TS_SHOP);
  const two = await analyzed(t, TS_SHOP);

  for (const view of [{ kind: "flow", name: "checkout" }, { kind: "entry", id: "presentation.cli", depth: 3 }, { kind: "layers" }] as const) {
    assert.equal(JSON.stringify(draw(one, view)), JSON.stringify(draw(two, view)), view.kind);
  }

  const d = draw(one, { kind: "flow", name: "checkout" });
  assert.equal(JSON.stringify(layout(d)), JSON.stringify(d), "laying out again changes nothing");
  const start = d.nodes.find((n) => n.kind === "start")!;
  const moved = layout(d, { [start.id]: { x: 999, y: 7 } });
  const after = moved.nodes.find((n) => n.id === start.id)!;
  assert.deepEqual([after.x, after.y, after.w, after.h], [999, 7, start.w, start.h]);
  assert.equal(d.nodes.find((n) => n.id === start.id)!.x, start.x, "the input is not changed");

  for (const n of moved.nodes) if (n.id !== start.id) assert.deepEqual([n.x, n.y], [d.nodes.find((m) => m.id === n.id)!.x, d.nodes.find((m) => m.id === n.id)!.y]);
});

test("diagram: views list the flows, entries, layers and processes; a query names one view or is refused", async (t) => {
  const analysis = await analyzed(t, TS_SHOP);
  assert.deepEqual(viewsOf(analysis.snapshot, analysis.spec), {
    // With a snapshot there is always the system of the code: here one service, no stores.
    systems: [{ name: "@code", file: null, line: null, sequences: [], tables: 0, components: 1 }],
    flows: ["checkout"],
    entries: [{ id: "presentation.cli", kind: "cli", label: "shop" }],
    layers: ["domain", "infrastructure", "application", "presentation", "external"],
    domains: [],
    processes: [],
  });
  const q = (text: string) => parseView(new URLSearchParams(text));
  assert.deepEqual(q("view=flow&name=checkout"), { kind: "flow", name: "checkout" });
  assert.deepEqual(q("view=entry&id=a.b&depth=4"), { kind: "entry", id: "a.b", depth: 4 });
  assert.deepEqual(q("view=entry&id=a.b"), { kind: "entry", id: "a.b" });
  assert.deepEqual(q("view=layers"), { kind: "layers" });
  assert.deepEqual(q("view=event&name=order.placed"), { kind: "event", name: "order.placed" });
  assert.deepEqual(q("view=process&domain=sales"), { kind: "process", domain: "sales" });

  for (const bad of ["", "view=nope", "view=flow", "view=entry", "view=entry&id=a&depth=x", "view=entry&id=a&depth=0", "view=entry&id=a&depth=99"]) {
    assert.ok(isRefusal(q(bad)), bad);
  }
});

test("diagram: an entry point's tree draws one hole per fn in its lane, counted, with every reason; the default depth is 2", async (t) => {
  const analysis = await analyzed(t, {
    ...TS_SHOP,
    "src/application/purchase.ts": 'import { create, reject } from "../domain/order.ts";\nexport function buy(gateway: any, mail: any): void {\n  create();\n  reject();\n  gateway.charge();\n  mail.send();\n}\n',
  });

  const tree = draw(analysis, { kind: "entry", id: "presentation.terminal.checkout" });
  assert.deepEqual(tree, draw(analysis, { kind: "entry", id: "presentation.terminal.checkout", depth: 2 }), "depth 2 by default");
  const holes = tree.nodes.filter((n) => n.kind === "hole");
  assert.equal(holes.length, 1, "the two unresolved calls of buy are one shape");
  const [hole] = holes;
  assert.equal(hole!.label, "? 2");
  assert.match(hole!.reason ?? "", /gateway\.charge[\s\S]*\n[\s\S]*mail\.send/);
  assert.equal(hole!.group, "application", "in the lane of buy, not under the lanes");
  const lane = tree.groups.find((g) => g.id === "application")!;
  assert.ok(hole!.y >= lane.y && hole!.y + hole!.h <= lane.y + lane.h);
  assert.ok(edge(tree, node(tree, "fn", "application.purchase.buy").id, hole!.id));
});

test("diagram: layout wraps a lane's rank of many shapes into columns of at most 8, each next to what leads into it", () => {
  // A start calling twenty fns of one lane, and two callers whose callees come in the reverse order.
  const at = { x: 0, y: 0, w: 0, h: 0 };
  const fns = Array.from({ length: 20 }, (_, i) => ({ id: `fn:f${i}`, kind: "fn" as const, label: `f${i}`, group: "app", ...at }));

  const wide = layout({
    nodes: [{ id: "start", kind: "start", label: "start", group: "app", ...at }, ...fns],
    edges: fns.map((fn) => ({ from: "start", to: fn.id, kind: "call" as const })),
    groups: [{ id: "app", label: "app", kind: "lane", ...at }],
  });

  const placed = wide.nodes.filter((n) => n.kind === "fn");
  assert.equal(new Set(placed.map((n) => n.y)).size, 7, "twenty in three columns of seven, not a column of twenty");
  assert.equal(new Set(placed.map((n) => n.x)).size, 3);
  const lane = wide.groups[0]!;

  for (const n of placed) assert.ok(n.y + n.h <= lane.y + lane.h && n.x + n.w <= lane.x + lane.w, n.id);

  // Callees follow their callers: a comes first, so its callee does too, though the diagram lists it last.
  const pair = layout({
    nodes: [
      { id: "root", kind: "start", label: "root", group: "app", ...at },
      { id: "a", kind: "fn", label: "a", group: "app", ...at },
      { id: "b", kind: "fn", label: "b", group: "app", ...at },
      { id: "b1", kind: "fn", label: "b1", group: "app", ...at },
      { id: "a1", kind: "fn", label: "a1", group: "app", ...at },
    ],
    edges: [
      { from: "root", to: "a", kind: "call" },
      { from: "root", to: "b", kind: "call" },
      { from: "a", to: "a1", kind: "call" },
      { from: "b", to: "b1", kind: "call" },
    ],
    groups: [{ id: "app", label: "app", kind: "lane", ...at }],
  });

  const y = (id: string): number => pair.nodes.find((n) => n.id === id)!.y;
  assert.ok(y("a") < y("b"));
  assert.ok(y("a1") < y("b1"), "a's callee beside a, though the diagram lists it after b's");
});

test("diagram: the layers view keeps one rule edge per pair and effect — a baseline's allow for every package is one allow", async (t) => {
  const analysis = await analyzed(t, {
    ...TS_SHOP,
    "keylang/rules.md": "# rules\n\n- layers domain < infrastructure < application < presentation\n- deny domain infrastructure\n- allow presentation application\n- allow presentation application.purchase\n- allow presentation application.purchase.buy\n",
  });

  const d = draw(analysis, { kind: "layers" });
  const allows = d.edges.filter((e) => e.kind === "allow");
  assert.equal(allows.length, 1, "three allows of one pair are one edge");
  assert.equal(allows[0]!.label, "allow presentation → application (3 rules)");
});

test("diagram: a module's view is the map as a graph — who imports it on the left, what it imports on the right, in the lanes of their layers; any ID opens its module", async (t) => {
  const analysis = await analyzed(t, TS_SHOP);
  const d = draw(analysis, { kind: "module", id: "application.purchase.buy" });
  assert.equal(d.nodes[0]?.label, "application.purchase", "a fn opens the module it lies in");
  const id = (label: string): string => d.nodes.find((n) => n.label === label)!.id;
  assert.equal(edge(d, id("presentation.terminal"), id("application.purchase"))?.kind, "dependency");
  assert.equal(edge(d, id("application.purchase"), id("domain.order"))?.label, "1");
  assert.equal(d.nodes.find((n) => n.label === "infrastructure.store"), undefined, "one step each way");
  const x = (label: string): number => d.nodes.find((n) => n.label === label)!.x;
  assert.ok(x("presentation.terminal") < x("application.purchase") && x("application.purchase") < x("domain.order"));
  assert.deepEqual(d.groups.map((g) => g.id).sort(), ["application", "domain", "presentation"]);
  assert.match(draw(analysis, { kind: "module", id: "nope" }).reason ?? "", /no module `nope`/);
});
