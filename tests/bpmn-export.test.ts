// `keylang export bpmn|drawio` and `keylang import drawio`
// (business-flows/28): the diagram of `/diagrams` as BPMN 2.0 — validated
// against the OMG BPMN 2.0 XSD that `bpmn-moddle` ships, by libxml2 compiled
// to WebAssembly (`xmllint-wasm`, no native build) — and as draw.io, read back
// as one proposal: an unchanged drawing proposes nothing, an added task one
// hunk. `GET /api/export` serves the same bytes behind the token.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { test } from "node:test";
import { validateXML } from "xmllint-wasm";
import { renderBpmn } from "../src/bpmn-export.ts";
import { parseDrawio, parseXml, renderDrawio, type XmlElement } from "../src/drawio.ts";
import { parse } from "../src/parser.ts";
import { compileSpec } from "../src/spec-ir.ts";
import { serveWeb } from "../src/tui/web.ts";
import { keylang, root } from "./cli-helpers.ts";
import { checkoutRepo, CHECKOUT_FLOW } from "./tui-fixture.ts";

const XSD_DIR = join(root, "node_modules/bpmn-moddle/resources/bpmn/xsd");
const xsd = (name: string): { fileName: string; contents: string } => ({ fileName: name, contents: readFileSync(join(XSD_DIR, name), "utf8") });

/** Errors of the BPMN 2.0 XSD (BPMN20.xsd with Semantic, BPMNDI, DI and DC) for a document; empty when it validates. */
async function xsdErrors(xml: string): Promise<string[]> {
  const result = await validateXML({ xml: { fileName: "export.bpmn", contents: xml }, schema: xsd("BPMN20.xsd"), preload: ["Semantic.xsd", "BPMNDI.xsd", "DC.xsd", "DI.xsd"].map(xsd) });
  return result.errors.map((error) => error.message);
}

function all(element: XmlElement, out: XmlElement[] = []): XmlElement[] {
  for (const child of element.children) {
    out.push(child);
    all(child, out);
  }
  return out;
}

/** What the XSD does not check: references between elements, and the keylang attributes on every flow node. */
function referenceProblems(xml: string): string[] {
  const elements = all(parseXml(xml));
  const ids = new Set(elements.flatMap((e) => (e.attrs.id ? [e.attrs.id] : [])));
  const problems: string[] = [];
  for (const e of elements) {
    for (const attr of ["sourceRef", "targetRef", "bpmnElement", "processRef", "signalRef"]) if (e.attrs[attr] !== undefined && !ids.has(e.attrs[attr]!)) problems.push(`${e.name} ${e.attrs.id}: ${attr} ${e.attrs[attr]} is no element`);
    if (e.name === "bpmn:flowNodeRef" && !ids.has(e.text)) problems.push(`flowNodeRef ${e.text} is no element`);
    const flowNode = /^bpmn:(?:task|startEvent|exclusiveGateway|parallelGateway|intermediateThrowEvent|intermediateCatchEvent|participant|lane)$/.test(e.name);
    if (flowNode && (e.attrs["keylang:id"] === undefined || e.attrs["keylang:verdict"] === undefined)) problems.push(`${e.name} ${e.attrs.id}: no keylang:id / keylang:verdict`);
  }
  for (const e of elements.filter((x) => x.name === "bpmn:sequenceFlow" || x.name === "bpmn:messageFlow" || /^bpmn:(?:task|startEvent|exclusiveGateway|parallelGateway|intermediateThrowEvent|intermediateCatchEvent|participant|lane)$/.test(x.name))) {
    if (!elements.some((d) => (d.name === "bpmndi:BPMNShape" || d.name === "bpmndi:BPMNEdge") && d.attrs.bpmnElement === e.attrs.id)) problems.push(`${e.name} ${e.attrs.id}: not drawn`);
  }
  return problems;
}

const REFUND = [
  "# flow refund",
  "",
  "- trigger route presentation.terminal.checkout",
  "- continues checkout",
  "- step application.purchase.buy",
  "  - when the order is paid",
  "    - step domain.order.create",
  "  - parallel",
  "    - step domain.order.create",
  "    - step infrastructure.store.save",
  "  - step external.stripe.refunds.create",
  "  - step infrastructure.store.save",
  "  - emits event order.refunded",
  "  - after 30m",
  "",
  "# flow nightly",
  "",
  "- trigger cron infrastructure.store.save",
  "- step domain.order.create",
  "",
].join("\n");

const specOf = (text: string) => compileSpec([parse("keylang/flows/refund.md", text), parse("keylang/flows/checkout.md", CHECKOUT_FLOW)]).spec;

test("export bpmn: every form of ADR 0023 maps to its BPMN element, and the document validates against the BPMN 2.0 XSD", async () => {
  const spec = specOf(REFUND);
  // `check` left the route into `create` (line 7) unproven: a hole before it.
  const results = [{ file: "keylang/flows/refund.md", line: 7, verdict: "unverified", criterion: "static", evidence: "unverified domain.order.create: no call edge from application.purchase.buy" }];
  const xml = renderBpmn({ snapshot: null, spec, results, view: { kind: "flow", name: "refund" } }, "refund");
  assert.deepEqual(await xsdErrors(xml), []);
  assert.deepEqual(referenceProblems(xml), []);
  const elements = all(parseXml(xml));
  const named = (name: string): XmlElement[] => elements.filter((e) => e.name === name);
  // A route trigger waits for a message.
  const start = named("bpmn:startEvent")[0]!;
  assert.equal(start.attrs["keylang:id"], "presentation.terminal.checkout");
  assert.ok(start.children.some((c) => c.name === "bpmn:messageEventDefinition"));
  // Lanes per layer, inside one pool.
  assert.deepEqual(
    named("bpmn:lane").map((l) => l.attrs.name),
    ["application", "domain", "infrastructure", "presentation", "—"],
  );
  // when → an exclusive gateway whose branch carries the condition.
  assert.equal(named("bpmn:exclusiveGateway").length, 1);
  assert.deepEqual(
    named("bpmn:conditionExpression").map((c) => c.text),
    ["the order is paid"],
  );
  // parallel → a diverging and a converging parallel gateway.
  assert.deepEqual(named("bpmn:parallelGateway").map((g) => g.attrs.gatewayDirection).sort(), ["Converging", "Diverging"]);
  // emits → a signal throw event; after → a timer catch event.
  const thrown = named("bpmn:intermediateThrowEvent")[0]!;
  assert.equal(thrown.attrs.name, "order.refunded");
  assert.ok(thrown.children.some((c) => c.name === "bpmn:signalEventDefinition"));
  assert.ok(named("bpmn:timeDuration").some((t) => t.text === "30m"));
  // The hole: a `?` task with its reason.
  const hole = named("bpmn:task").find((t) => t.attrs.name === "?")!;
  assert.equal(hole.children.find((c) => c.name === "bpmn:documentation")?.text, "keylang: no call edge from application.purchase.buy");
  assert.equal(hole.attrs["keylang:verdict"], "unverified");
  // The package and the continued flow are collapsed pools, reached by message flows.
  const pools = named("bpmn:participant");
  assert.deepEqual(
    pools.map((p) => [p.attrs.name, p.attrs.processRef !== undefined]),
    [
      ["refund", true],
      ["external.stripe.refunds.create", false],
      ["checkout", false],
    ],
  );
  // Into the package and back out of it, and from the continued flow into the start.
  assert.equal(named("bpmn:messageFlow").length, 3);
  // The sequence goes around the package: buy's lane keeps a path to the next step.
  assert.ok(named("bpmn:task").every((t) => t.attrs.name !== "external.stripe.refunds.create"));

  // A cron trigger waits for a timer.
  const nightly = renderBpmn({ snapshot: null, spec, results: [], view: { kind: "flow", name: "nightly" } }, "nightly");
  assert.deepEqual(await xsdErrors(nightly), []);
  assert.ok(all(parseXml(nightly)).some((e) => e.name === "bpmn:startEvent" && e.children.some((c) => c.name === "bpmn:timerEventDefinition")));
  assert.throws(() => renderBpmn({ snapshot: null, spec, results: [], view: { kind: "layers" } }, "layers"), /no process/);
  assert.throws(() => renderBpmn({ snapshot: null, spec, results: [], view: { kind: "flow", name: "nope" } }, "nope"), /no flow named `nope`/);
});

test("export drawio: an <mxfile> of <object> cells with keylang_id and keylang_kind; the parser reads its own export and a compressed page", () => {
  const spec = specOf(REFUND);
  const text = renderDrawio({ snapshot: null, spec, results: [], view: { kind: "flow", name: "refund" } }, "flow:refund");
  assert.match(text, /^<mxfile host="keylang"/);
  const model = parseDrawio(text);
  assert.equal(model.view, "flow:refund");
  const shapes = model.cells.filter((c) => c.vertex && c.attrs.keylang_kind !== "lane");
  assert.ok(shapes.every((c) => c.attrs.keylang_kind !== undefined));
  assert.ok(shapes.filter((c) => c.attrs.keylang_kind === "task").every((c) => c.attrs.keylang_id !== undefined));
  assert.ok(shapes.some((c) => c.attrs.keylang_kind === "gateway" && c.label === "the order is paid" && /rhombus/.test(c.style)));
  assert.ok(model.cells.filter((c) => c.edge).every((c) => c.source !== null && c.target !== null));
  // draw.io's older default: the page's model URI-encoded, raw-deflated and in base64.
  const inner = /<mxGraphModel[\s\S]*<\/mxGraphModel>/.exec(text)![0];
  const packed = text.replace(inner, deflateRawSync(Buffer.from(encodeURIComponent(inner), "latin1")).toString("base64"));
  assert.deepEqual(parseDrawio(packed), model);
});

/** A drawing with one more task after `infrastructure.store.save` (line 8 of the checkout flow). */
function withAddedTask(drawio: string, extra = ""): string {
  const cell = [
    '        <object id="new-task" label="infrastructure.store.audit" keylang_id="infrastructure.store.audit" keylang_kind="task">',
    '          <mxCell style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="900" y="100" width="160" height="60" as="geometry" /></mxCell>',
    "        </object>",
    '        <mxCell id="new-edge" edge="1" parent="1" source="step:8" target="new-task"><mxGeometry relative="1" as="geometry" /></mxCell>',
    extra,
  ].join("\n");
  return drawio.replace("      </root>", `${cell}\n      </root>`);
}

test("import drawio: export → import of an unchanged drawing proposes nothing; an added task is one hunk; an unknown shape a note", (t) => {
  const repo = checkoutRepo(t, { "keylang/flows/refund.md": REFUND });
  for (const flow of ["checkout", "refund"]) {
    const exported = keylang(repo, ["export", "drawio", flow, "--out", `${flow}.drawio`]);
    assert.equal(exported.status, 0, exported.stderr);
    assert.equal(exported.stdout, "");
    const back = keylang(repo, ["import", "drawio", `${flow}.drawio`]);
    assert.equal(back.status, 0, back.stderr);
    assert.match(back.stderr, /nothing to propose/);
    assert.equal(existsSync(join(repo, `.keylang/proposals/keylang/flows/${flow}.md`)), false, `${flow}: no proposal`);
  }

  const original = readFileSync(join(repo, "keylang/flows/checkout.md"), "utf8");
  writeFileSync(join(repo, "added.drawio"), withAddedTask(readFileSync(join(repo, "checkout.drawio"), "utf8")));
  const printed = keylang(repo, ["import", "drawio", "added.drawio", "--print"]);
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout, "@@ line 9 @@\n+  - step infrastructure.store.audit\n");
  assert.equal(existsSync(join(repo, ".keylang/proposals/keylang/flows/checkout.md")), false, "--print writes nothing");
  const added = keylang(repo, ["import", "drawio", "added.drawio"]);
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stderr, /proposed flow `checkout` .* for keylang\/flows\/checkout\.md as \.keylang\/proposals\/keylang\/flows\/checkout\.md/);
  const proposal = readFileSync(join(repo, ".keylang/proposals/keylang/flows/checkout.md"), "utf8");
  const lines = original.split("\n");
  // One hunk: the original with one line inserted after `save`.
  assert.equal(proposal, [...lines.slice(0, 8), "  - step infrastructure.store.audit", ...lines.slice(8)].join("\n"));
  assert.equal(keylang(repo, ["proposals", "reject", "keylang/flows/checkout.md"]).status, 0);

  // A shape keylang does not know becomes a note; a removed shape takes its line; a renamed one rewrites it.
  let drawio = readFileSync(join(repo, "checkout.drawio"), "utf8");
  drawio = drawio.replace("      </root>", '        <mxCell id="sticky" value="ask &lt;b&gt;finance&lt;/b&gt; -- twice" style="shape=note;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry" /></mxCell>\n      </root>');
  drawio = drawio.replace('label="domain.order.create"', 'label="domain.order.place"');
  const removed = drawio.replace(/<object id="step:8"[\s\S]*?<\/object>\n/, "");
  writeFileSync(join(repo, "edited.drawio"), removed);
  const edited = keylang(repo, ["import", "drawio", "edited.drawio", "--print"]);
  assert.equal(edited.status, 0, edited.stderr);
  assert.equal(edited.stdout, ["@@ line 7 @@", "-  - step domain.order.create", "-  - step infrastructure.store.save", "+  - step domain.order.place", "+", "+<!-- keylang:drawio note ask finance - - twice -->", ""].join("\n"));

  // Not a flow drawing, or not a drawing: 2.
  assert.equal(keylang(repo, ["export", "drawio", "layers", "--out", "layers.drawio"]).status, 0);
  const layers = keylang(repo, ["import", "drawio", "layers.drawio"]);
  assert.equal(layers.status, 2);
  assert.match(layers.stderr, /draws `layers`, not a flow/);
  writeFileSync(join(repo, "broken.drawio"), "<mxfile><diagram>");
  assert.equal(keylang(repo, ["import", "drawio", "broken.drawio"]).status, 2);
});

test("import drawio: a flow the specs do not have is built from the drawing along its edges, as a proposal of its own file", (t) => {
  const repo = checkoutRepo(t);
  const exported = keylang(repo, ["export", "drawio", "checkout"]);
  assert.equal(exported.status, 0, exported.stderr);
  const renamed = exported.stdout.replace('keylang_view="flow:checkout"', 'keylang_view="flow:express"').replace(/id="(trigger|step):(\d+)"/g, 'id="copy-$1-$2"').replace(/(source|target)="(trigger|step):(\d+)"/g, '$1="copy-$2-$3"');
  writeFileSync(join(repo, "express.drawio"), renamed);
  const printed = keylang(repo, ["import", "drawio", "express.drawio", "--print"]);
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout, ["@@ line 1 @@", "+# flow express", "+", "+- trigger presentation.terminal.checkout", "+- step application.purchase.buy", "+- step domain.order.create", "+- step infrastructure.store.save", ""].join("\n"));
});

test("export bpmn through the CLI: stdout or --out, valid against the XSD; --out never replaces a file it did not write", async (t) => {
  const repo = checkoutRepo(t);
  const printed = keylang(repo, ["export", "bpmn", "checkout"]);
  assert.equal(printed.status, 0, printed.stderr);
  assert.deepEqual(await xsdErrors(printed.stdout), []);
  assert.deepEqual(referenceProblems(printed.stdout), []);
  const written = keylang(repo, ["export", "bpmn", "checkout", "--out", "docs/checkout.bpmn"]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(written.stdout, "");
  assert.equal(readFileSync(join(repo, "docs/checkout.bpmn"), "utf8"), printed.stdout);
  assert.equal(keylang(repo, ["export", "bpmn", "checkout", "--out", "docs/checkout.bpmn"]).status, 0, "its own file is replaced");
  writeFileSync(join(repo, "notes.bpmn"), "mine\n");
  const refused = keylang(repo, ["export", "bpmn", "checkout", "--out", "notes.bpmn"]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /not a diagram `keylang export bpmn` wrote/);
  assert.equal(readFileSync(join(repo, "notes.bpmn"), "utf8"), "mine\n");
  assert.equal(keylang(repo, ["export", "bpmn", "checkout", "--out", "../out.bpmn"]).status, 2);
  assert.equal(keylang(repo, ["export", "bpmn", "layers"]).status, 2);
  assert.equal(keylang(repo, ["export", "bpmn"]).status, 2);
});

function get(url: URL, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, path, headers }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("web: GET /api/export answers the file of `keylang export` with the token, 403 without it", async (t) => {
  const repo = checkoutRepo(t);
  const server = await serveWeb({ root: repo, port: 0 });
  t.after(() => server.close());
  const url = new URL(server.url);
  const token = new URLSearchParams(url.hash.slice(1)).get("t") ?? "";
  for (const headers of [{}, { Authorization: "Bearer wrong" }, { Authorization: `Bearer ${token}`, Origin: "http://evil.example" }]) {
    const denied = await get(url, "/api/export?format=bpmn&view=flow&name=checkout", headers);
    assert.equal(denied.status, 403, JSON.stringify(headers));
    assert.doesNotMatch(denied.body, /checkout/);
  }
  const bearer = { Authorization: `Bearer ${token}` };
  const bpmn = await get(url, "/api/export?format=bpmn&view=flow&name=checkout", bearer);
  assert.equal(bpmn.status, 200, bpmn.body);
  assert.match(String(bpmn.headers["content-disposition"]), /filename="flow_checkout\.bpmn"/);
  assert.equal(bpmn.body, keylang(repo, ["export", "bpmn", "checkout"]).stdout);
  const drawio = await get(url, "/api/export?format=drawio&view=flow&name=checkout", bearer);
  assert.equal(drawio.status, 200, drawio.body);
  assert.equal(drawio.body, keylang(repo, ["export", "drawio", "checkout"]).stdout);
  assert.equal((await get(url, "/api/export?format=pdf&view=flow&name=checkout", bearer)).status, 400);
  assert.equal((await get(url, "/api/export?format=bpmn&view=flow", bearer)).status, 400);
  assert.equal((await get(url, "/api/export?format=bpmn&view=layers", bearer)).status, 400);
});
