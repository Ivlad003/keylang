// The zoom screen (.scratch/c4-zoom/issues/07): the map one level at a time,
// the repository down to a module's members, with neighbors by distance.
// The model on a real analysis, then the screen in a virtual terminal.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { analyze } from "../src/analyze.ts";
import { App } from "../src/tui/app.ts";
import { zoomLevel, zoomTarget, ZOOM_ROOT } from "../src/tui/zoom.ts";
import { checkoutRepo, KEY } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

type Edge = { source: string; target: string | null };

/** Edges of `.keylang/index.json` with exactly one end inside `id`: what a row's `↔ n` counts. */
function degree(root: string, id: string): number {
  const index = JSON.parse(readFileSync(join(root, ".keylang/index.json"), "utf8")) as { edges: Edge[] };
  const inside = (other: string): boolean => other === id || other.startsWith(`${id}.`);
  return index.edges.filter((edge) => edge.target !== null && inside(edge.source) !== inside(edge.target)).length;
}

test("zoom model: children, neighbors by depth, crumbs, the more row, and where z opens", async (t) => {
  const root = checkoutRepo(t);
  // `keylang map` writes the index the edge counts are compared with.
  assert.equal(spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "../bin/keylang.js"), "map"], { cwd: root }).status, 0);
  const analysis = await analyze({ root });
  const top = zoomLevel(analysis, ZOOM_ROOT, 1);
  assert.deepEqual(top.crumbs.map((crumb) => crumb.label), ["system"]);
  assert.deepEqual(top.rows.map((row) => [row.kind, row.label, row.distance, row.container]), [
    ["layer", "domain", 0, true],
    ["layer", "application", 0, true],
    ["layer", "infrastructure", 0, true],
    ["layer", "presentation", 0, true],
  ]);

  // A layer's level: its top modules, then the top modules of other layers it has edges with.
  const application = zoomLevel(analysis, "application", 1);
  assert.deepEqual(application.crumbs.map((crumb) => crumb.label), ["system", "application"]);
  assert.deepEqual(application.rows.map((row) => [row.label, row.distance]), [
    ["purchase", 0],
    ["domain.order", 1],
    ["infrastructure.store", 1],
    ["presentation.terminal", 1],
  ]);
  // Depth 0: only the children, and a row that says how many neighbors one edge away `>` would show.
  assert.deepEqual(zoomLevel(analysis, "application", 0).rows.map((row) => [row.kind, row.label]), [["module", "purchase"], ["more", "3 more at depth 1"]]);
  // Depth 1 from the domain reaches the application; one edge more reaches the rest, shown as a more row.
  const domain = zoomLevel(analysis, "domain", 1);
  assert.deepEqual(domain.rows.map((row) => [row.kind, row.label, row.distance]), [
    ["module", "order", 0],
    ["module", "application.purchase", 1],
    ["more", "2 more at depth 2", 2],
  ]);
  assert.deepEqual(zoomLevel(analysis, "domain", 2).rows.map((row) => [row.label, row.distance]), [
    ["order", 0],
    ["application.purchase", 1],
    ["infrastructure.store", 2],
    ["presentation.terminal", 2],
  ]);

  // A module's level: its members, then the members it calls and that call it.
  const purchase = zoomLevel(analysis, "application.purchase", 1);
  assert.deepEqual(purchase.crumbs.map((crumb) => crumb.label), ["system", "application", "purchase"]);
  assert.deepEqual(purchase.rows.map((row) => [row.kind, row.label, row.distance, row.container]), [
    ["fn", "buy", 0, false],
    ["fn", "domain.order.create", 1, false],
    ["fn", "infrastructure.store.save", 1, false],
    ["fn", "presentation.terminal.checkout", 1, false],
  ]);
  // `↔ n` counts the edges of the snapshot with one end inside the node.
  for (const row of [...application.rows, ...purchase.rows]) assert.equal(row.edges, degree(root, row.id), row.id);

  assert.deepEqual(zoomTarget(analysis, "application.purchase"), { focus: "application.purchase", select: null });
  assert.deepEqual(zoomTarget(analysis, "application.purchase.buy"), { focus: "application.purchase", select: "application.purchase.buy" });
  assert.deepEqual(zoomTarget(analysis, "domain"), { focus: "domain", select: null });
  assert.equal(zoomTarget(analysis, "no.such.id"), null);
});

function session(root: string, cols = 120, rows = 30): { app: App; vt: VirtualTerminal; send: (keys: string) => void; text: () => string; lines: () => string[] } {
  const vt = new VirtualTerminal(cols, rows);
  const app = new App({ root, cols, rows });
  app.attach({ write: (ansi) => vt.feed(ansi) }, cols, rows);
  return { app, vt, send: (keys) => app.input(keys), text: () => vt.text(), lines: () => vt.lines() };
}

async function esc(send: (keys: string) => void): Promise<void> {
  send("\x1b");
  await sleep(40);
}

/** The map file of `layer` open in the view, the cursor on the line of `id`. */
async function onMapLine(s: ReturnType<typeof session>, layer: string, id: string): Promise<void> {
  s.send(KEY.ctrlP);
  for (const ch of `open keylang/map/${layer}.md`) s.send(ch);
  s.send(KEY.enter);
  await s.app.idle();
  assert.equal(s.app.state.current, `keylang/map/${layer}.md`);
  const name = id.split(".").at(-1)!;
  const line = s.app.state.buffers.get(`keylang/map/${layer}.md`)!.text.split("\n").findIndex((text) => text.includes(`[${name}]`));
  assert.ok(line >= 0, `${id} in the map of ${layer}`);
  s.app.state.cursor = { line, col: 0 };
}

test("tui zoom: z on a module opens its level; - goes up to its layer with the module selected; q is the view at that module", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  await onMapLine(s, "application", "application.purchase");
  // Enter on the module line still opens its code: z is the new way in.
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "code");
  assert.equal(s.app.state.code?.file, "src/application/purchase.ts");
  await esc(s.send);
  assert.equal(s.app.state.mode, "view");

  s.send("z");
  assert.equal(s.app.state.mode, "zoom");
  let text = s.text();
  assert.match(text, /system › application › purchase +\[−\] \[\+\] \[depth 1 ▾▴\]/);
  assert.match(text, /fn +buy/);
  assert.match(text, /fn +domain\.order\.create ·1/);
  assert.match(s.lines()[0]!, / ZOOM $/);

  s.send("-");
  text = s.text();
  assert.match(text, /system › application +\[−\] \[\+\] \[depth 1 ▾▴\]/);
  assert.equal(s.app.state.zoom?.focus, "application");
  assert.equal(s.app.state.zoom?.selected.get("application"), 0, "the module it came from is selected");
  s.send("j");
  s.send("q");
  assert.equal(s.app.state.mode, "view");
  // The view opens the map of the selected node's layer at its line.
  assert.equal(s.app.state.current, "keylang/map/domain.md");
  const line = s.app.state.buffers.get("keylang/map/domain.md")!.text.split("\n")[s.app.state.cursor.line]!;
  assert.match(line, /module \[order\]/);
});

test("tui zoom: Enter on a fn opens its code and Esc comes back to the same level and row; > and < change the depth", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  await onMapLine(s, "application", "application.purchase");
  s.send("z");
  s.send("j");
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "code");
  assert.equal(s.app.state.code?.file, "src/domain/order.ts");
  await esc(s.send);
  assert.equal(s.app.state.mode, "zoom");
  assert.equal(s.app.state.zoom?.focus, "application.purchase");
  assert.equal(s.app.state.zoom?.selected.get("application.purchase"), 1);

  // Depth: from the domain's level, > adds the second ring, < takes it back, 0 leaves only the children.
  s.send("-");
  s.send("-");
  assert.equal(s.app.state.zoom?.focus, ZOOM_ROOT);
  assert.equal(s.app.state.zoom?.selected.get(ZOOM_ROOT), 1, "the application, which it came up from, is selected");
  s.send("g");
  s.send("+");
  assert.equal(s.app.state.zoom?.focus, "domain");
  assert.match(s.text(), /… 2 more at depth 2: > shows them/);
  s.send(">");
  assert.match(s.text(), /\[depth 2 ▾▴\]/);
  assert.match(s.text(), /infrastructure\.store ·2/);
  s.send("<");
  s.send("<");
  assert.match(s.text(), /\[depth 0 ▾▴\]/);
  assert.doesNotMatch(s.text(), /application\.purchase ·1/);
  s.send("<");
  assert.match(s.app.state.message ?? "", /depth 0: only the children/);
});

test("tui zoom: z in the nav panel and the palette action; a row has its brief, mark and edges; 80 columns leave the brief out", async (t) => {
  const root = checkoutRepo(t, { "src/domain/order.ts": "/** Creates an order and returns nothing. */\nexport function create(): void {}\n" });
  const s = session(root, 120);
  t.after(() => s.app.close());
  await s.app.idle();
  s.send(KEY.ctrlP);
  for (const ch of "zoom") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "zoom");
  assert.equal(s.app.state.zoom?.focus, ZOOM_ROOT);
  assert.match(s.text(), /— no explanation yet/);
  s.send("q");
  assert.equal(s.app.state.mode, "view");

  // In the nav panel (shown at this width), z zooms into the selected layer: row 1, under the LAYERS heading.
  s.app.state.focus = "nav";
  s.app.state.navIndex = 1;
  s.send("z");
  assert.equal(s.app.state.mode, "zoom");
  assert.equal(s.app.state.zoom?.focus, "domain");
  s.send("+");
  assert.equal(s.app.state.zoom?.focus, "domain.order");
  const row = s.lines().find((line) => line.includes("fn     create"))!;
  assert.match(row, /fn +create · Creates an order and returns nothing\./);
  assert.match(row, /◌ ↔ 1 /);

  const narrow = session(root, 80);
  t.after(() => narrow.app.close());
  await narrow.app.idle();
  narrow.send(KEY.ctrlP);
  for (const ch of "zoom") narrow.send(ch);
  narrow.send(KEY.enter);
  narrow.send("+");
  narrow.send("+");
  const short = narrow.lines().find((line) => line.includes("fn     create"))!;
  assert.doesNotMatch(short, /Creates an order/);
  assert.match(short, /↔ 1/);
});

test("tui zoom: s finds a node and lands on its level; e explains the selected node; nothing is written", async (t) => {
  const root = checkoutRepo(t);
  const s = session(root);
  t.after(() => s.app.close());
  await s.app.idle();
  const before = files(root);
  s.send(KEY.ctrlP);
  for (const ch of "zoom") s.send(ch);
  s.send(KEY.enter);
  s.send("s");
  for (const ch of "save") s.send(ch);
  s.send(KEY.enter);
  assert.equal(s.app.state.mode, "zoom");
  assert.equal(s.app.state.zoom?.focus, "infrastructure.store");
  s.send("e");
  assert.equal(s.app.state.hover?.lines[0]?.text, "fn infrastructure.store.save () → void");
  assert.match(s.text(), /called by: application\.purchase\.buy/);
  await esc(s.send);
  assert.equal(s.app.state.hover, null, "Esc first drops the hover");
  assert.equal(s.app.state.mode, "zoom");
  assert.deepEqual(files(root), before, "the zoom writes nothing");
});

/** Every file under `root` with its bytes, sorted. */
function files(root: string): string {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else out.push(`${rel} ${readFileSync(join(root, rel), "utf8")}`);
    }
  };
  walk("");
  return out.join("\n");
}
