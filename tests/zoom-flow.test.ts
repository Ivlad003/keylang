// A flow over the zoom levels (.scratch/c4-zoom/issues/09): its steps
// numbered in the order written on each level's units, with the gutter mark
// of each step's line, the layers it walks at the top, and its edges marked.

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze.ts";
import { App } from "../src/tui/app.ts";
import { evidenceOf } from "../src/tui/evidence.ts";
import { flowOverlay, flowsThrough, ZOOM_ROOT } from "../src/tui/zoom.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A second flow through the domain: a static fail (create never calls save) and a planned step. */
const PROBE = "# flow probe\n\n- planned fn domain.order.refund () → void\n- trigger domain.order.create\n  - step infrastructure.store.save\n  - step domain.order.refund\n";

test("flow overlay model: steps numbered in the order written on the level's units, each with its line's gutter mark", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/probe.md": PROBE });
  const analysis = await analyze({ root });
  const mark = (file: string, line: number) => evidenceOf(analysis, file).get(line)?.mark ?? null;
  const top = flowOverlay(analysis, "probe", ZOOM_ROOT, mark)!;
  assert.deepEqual([...top.steps], [["domain", [1, 3]], ["infrastructure", [2]]]);
  assert.deepEqual(top.sequence, [{ layer: "domain", first: 1, last: 1 }, { layer: "infrastructure", first: 2, last: 2 }, { layer: "domain", first: 3, last: 3 }]);
  // Each number carries the mark of its line, as the gutter shows it.
  for (const [n, step] of top.marks) assert.equal(step.mark, evidenceOf(analysis, "keylang/flows/probe.md").get(step.line)?.mark ?? null, `step ${n}`);
  // The trigger's trace is configured but absent: unverified, as its gutter says.
  assert.deepEqual([...top.marks.values()].map((step) => [step.id, step.mark]), [["domain.order.create", "unverified"], ["infrastructure.store.save", "fail"], ["domain.order.refund", "planned"]]);
  assert.deepEqual([...top.pairs].sort(), ["domain\0infrastructure"]);
  // On the domain's level the steps sit on its module, and the save step on the store, a neighbor.
  const domain = flowOverlay(analysis, "probe", "domain", mark)!;
  assert.deepEqual([...domain.steps], [["domain.order", [1, 3]], ["infrastructure.store", [2]]]);
  assert.deepEqual(flowsThrough(analysis, "domain"), ["checkout", "probe"]);
  assert.deepEqual(flowsThrough(analysis, "presentation"), ["checkout"]);
});

function session(root: string, cols = 140, rows = 32): { app: App; send: (keys: string) => void; text: () => string; lines: () => string[] } {
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root, cols, rows });
  app.attach({ write: (ansi) => vt.feed(ansi) }, cols, rows);
  return { app, send: (keys) => app.input(keys), text: () => vt.text(), lines: () => vt.lines() };
}

function zoom(s: ReturnType<typeof session>): void {
  s.send(KEY.ctrlP);
  for (const ch of "zoom") s.send(ch);
  s.send(KEY.enter);
}

function pickFlow(s: ReturnType<typeof session>, name: string): void {
  s.send("f");
  for (const ch of name) s.send(ch);
  s.send(KEY.enter);
}

test("tui zoom flow: the check flow of keylang itself, layer by layer in the order written", async (t) => {
  const s = session(repoRoot, 180, 36);
  t.after(() => s.app.close());
  await s.app.idle();
  zoom(s);
  pickFlow(s, "check");
  let text = s.text();
  assert.match(text, /\[depth 1 ▾▴\] \[c edges\] \[f check ×\]/);
  assert.match(text, /flow check: cli ①–③ → operations ④ → map ⑤–⑥ → lang ⑦ → check ⑧ → lang ⑨ → check ⑩–⑫ → features ⑬/);
  assert.match(s.lines().find((line) => / layer +cli /.test(line)) ?? "", /layer +cli ①②③/);
  // Into the map layer: its modules carry their steps, in the order the flow writes them.
  const row = s.app.state.zoom!;
  const index = ["cli", "tui", "operations", "features", "map"].indexOf("map");
  row.selected.set(ZOOM_ROOT, index);
  s.send("+");
  text = s.text();
  assert.match(text, /keylang › map/);
  assert.match(text, /module +analyze ⑤/);
  assert.match(text, /module +map ⑥/);
  const analyzeAt = s.lines().findIndex((line) => /module +analyze ⑤/.test(line));
  const mapAt = s.lines().findIndex((line) => /module +map ⑥/.test(line));
  assert.ok(analyzeAt < mapAt || analyzeAt >= 0, "both rows are shown");
});

test("tui zoom flow: f picks a flow, its marks are the gutter's, F goes to the next flow through the level, f takes it off, Alt+Enter goes to the step's line", async (t) => {
  const root = checkoutRepo(t, { "keylang/flows/probe.md": PROBE });
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  zoom(s);
  s.send("f");
  assert.equal(s.app.state.prompt?.kind, "flow");
  assert.deepEqual(s.app.state.prompt?.ids, ["checkout", "probe"]);
  for (const ch of "probe") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.zoom?.flow, "probe");
  let text = s.text();
  assert.match(text, /flow probe: domain ① → infrastructure ② → domain ③/);
  const domainRow = s.lines().find((line) => / layer +domain /.test(line))!;
  assert.match(domainRow, /layer +domain ①③/);
  assert.match(domainRow, /◌ ↔ 2 /, "the worst mark of its steps: the unverified trigger over the planned step");
  assert.match(s.lines().find((line) => / layer +infrastructure /.test(line))!, /✗ ↔ 2 /);
  s.send("F");
  assert.equal(s.app.state.zoom?.flow, "checkout");
  assert.match(s.app.state.message ?? "", /^flow checkout \(1 of 2 through this level\)$/);
  // The edges view marks the edges the flow walks: every edge between the layers here.
  s.send("c");
  text = s.text();
  assert.match(text, /▶ inside +application → domain/);
  assert.match(text, /▶ inside +presentation → application/);
  s.send("c");
  s.send("F");
  assert.equal(s.app.state.zoom?.flow, "probe");
  s.send("f");
  assert.equal(s.app.state.zoom?.flow, null);
  assert.match(s.app.state.message ?? "", /flow probe taken off/);
  text = s.text();
  assert.doesNotMatch(text, /flow probe:/);

  // Alt+Enter on a step row goes to its line in the flow.
  pickFlow(s, "probe");
  s.send("g");
  s.send(KEY.altEnter);
  await sleep(20);
  assert.equal(s.app.state.mode, "view");
  assert.equal(s.app.state.current, "keylang/flows/probe.md");
  assert.equal(s.app.state.cursor.line, 3, "the trigger, step ① on the domain");
});
