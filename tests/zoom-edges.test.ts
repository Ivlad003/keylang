// The edges view of the zoom screen (.scratch/c4-zoom/issues/08): the edges
// of a level as rows to follow — in, out, to packages, between the children,
// and what keylang could not resolve — and `x` to explain them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";
import { App } from "../src/tui/app.ts";
import { zoomEdges, ZOOM_ROOT } from "../src/tui/zoom.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const DYNAMIC = { "src/domain/run.ts": "export function run(task: () => void): void {\n  task();\n}\n" };

test("zoom edges model: grouped by the level's units, with kinds and counts, and an unresolved row", async (t) => {
  const analysis = await analyze({ root: checkoutRepo(t, DYNAMIC) });
  const rows = (focus: string): string[] =>
    zoomEdges(analysis, focus).map((edge) => (edge.group === "unresolved" ? `unresolved ${(edge.reasons ?? []).map((item) => `${item.reason}×${item.count}`).join(",")}` : `${edge.group} ${edge.from} → ${edge.to} ${edge.kinds.map((item) => `${item.kind}×${item.count}`).join(",")} =${edge.count} >${edge.other}`));
  assert.deepEqual(rows("application"), [
    "in presentation.terminal → application.purchase call×1,import×1 =2 >presentation.terminal",
    "out application.purchase → domain.order call×1,import×1 =2 >domain.order",
    "out application.purchase → infrastructure.store call×1,import×1 =2 >infrastructure.store",
  ]);
  // At the repository every edge is between two layers, and everything unresolved is inside it.
  assert.deepEqual(rows(ZOOM_ROOT), [
    "inside application → domain call×1,import×1 =2 >domain",
    "inside application → infrastructure call×1,import×1 =2 >infrastructure",
    "inside presentation → application call×1,import×1 =2 >application",
    "unresolved dynamic-call×1",
  ]);
  // Inside a module: member to member, and what keylang could not turn into an edge.
  assert.deepEqual(rows("domain.run"), ["unresolved dynamic-call×1"]);
  assert.deepEqual(rows("domain"), ["in application.purchase → domain.order call×1,import×1 =2 >application.purchase", "unresolved dynamic-call×1"]);
});

test("zoom edges model: an import of a file `assume` names is listed in coverage but is no unresolved construct", async (t) => {
  const config = { languages: ["typescript"], layers: { domain: ["src/domain/**"], application: ["src/application/**"], infrastructure: ["src/infrastructure/**"], presentation: ["src/presentation/**"] }, assume: ["src/config.ts"] };
  const store = 'import { settings } from "../config";\nexport function save(task: () => void): void {\n  settings();\n  task();\n}\n';
  const analysis = await analyze({ root: checkoutRepo(t, { "keylang.json": `${JSON.stringify(config)}\n`, "src/infrastructure/store.ts": store }) });
  const kinds = analysis.snapshot?.coverage.filter((item) => item.source?.startsWith("infrastructure.store") === true).map((item) => item.kind) ?? [];
  assert.ok(kinds.includes("assumed-import") && kinds.includes("dynamic-call"), kinds.join(" "));
  // The dynamic call stays a hole of the level; the assumed import does not count as one.
  const reasons = zoomEdges(analysis, "infrastructure").flatMap((edge) => (edge.group === "unresolved" ? (edge.reasons ?? []) : []));
  assert.deepEqual(reasons.flatMap((item) => Array<string>(item.count).fill(item.reason)).sort(), kinds.filter((kind) => kind !== "assumed-import").sort());
});

function session(root: string): { app: App; send: (keys: string) => void; text: () => string; lines: () => string[] } {
  const vt = new VirtualTerminal(130, 30);
  const app = new App({ root, cols: 130, rows: 30 });
  app.attach({ write: (ansi) => vt.feed(ansi) }, 130, 30);
  return { app, send: (keys) => app.input(keys), text: () => vt.text(), lines: () => vt.lines() };
}

function zoom(s: ReturnType<typeof session>): void {
  s.send(KEY.ctrlP);
  for (const ch of "zoom") s.send(ch);
  s.send(KEY.enter);
}

test("tui zoom edges: c shows the edges of the level; Enter follows one to the other end; - goes back up in the same view", async (t) => {
  const root = checkoutRepo(t, DYNAMIC);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  zoom(s);
  s.send("j");
  s.send("+");
  assert.equal(s.app.state.zoom?.focus, "application");
  s.send("c");
  let text = s.text();
  assert.match(text, /system › application +\[−\].*\[c nodes\]/);
  assert.match(text, /in +presentation\.terminal → purchase · call ×1, import ×1 +2/);
  assert.match(text, /out +purchase → domain\.order · call ×1, import ×1 +2/);
  s.send("j");
  s.send(KEY.enter);
  assert.equal(s.app.state.zoom?.focus, "domain.order");
  assert.equal(s.app.state.zoom?.view, "edges");
  text = s.text();
  assert.match(text, /system › domain › order +\[−\].*\[c nodes\]/);
  assert.match(text, /in +application\.purchase\.buy → create · call ×1/);
  s.send("-");
  assert.equal(s.app.state.zoom?.focus, "domain");
  assert.match(s.text(), /◌ unresolved inside: dynamic-call ×1/);
  s.send("c");
  assert.equal(s.app.state.zoom?.view, "nodes");
  assert.match(s.text(), /\[depth 1 ▾▴\] \[c edges\]/);
});

test("tui zoom edges: x on an edge row explains its edges in F6; x then x on two nodes does the same; Esc comes back to the zoom", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  zoom(s);
  s.send("c");
  s.send("x");
  await s.app.idle();
  const record = s.app.state.records.at(-1)!;
  assert.equal(record.kind, "explain-edge");
  assert.deepEqual([(record.params as { from: string }).from, (record.params as { to: string }).to], ["application", "domain"]);
  assert.equal(record.result?.exitCode, 0);
  s.send(KEY.f6);
  assert.match(s.text(), /Check: explain the edge between two ids · application ↔ domain +completed · code 0/);
  assert.match(s.text(), /2 edge\(s\): 2 → , 0 ←/);
  s.send("\x1b");
  await sleep(40);
  assert.equal(s.app.state.mode, "zoom");

  s.send("c");
  s.send("x");
  assert.match(s.app.state.message ?? "", /^from domain: x on another node explains the edges between them$/);
  s.send("j");
  s.send("x");
  await s.app.idle();
  const pair = s.app.state.records.at(-1)!;
  assert.deepEqual([(pair.params as { from: string }).from, (pair.params as { to: string }).to], ["domain", "application"]);
});
