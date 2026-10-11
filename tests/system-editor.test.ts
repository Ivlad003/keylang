// «Запропонувати зміни» on a system's view (system-design/08), through
// `keylang diagram propose system:<name> --from <model.json>`: the canvas is
// the `# system` section — a new component and relation become lines, a
// removed relation goes, a component dragged into a zone moves there, and
// what the canvas does not draw (code, tables, descriptions, notes,
// sequences) stays; the system of the code is adopted as a new file.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";
import { SHOP } from "./system-fixture.ts";

interface Node {
  key: string;
  id: string;
  kind: string;
  label: string;
  layer: string | null;
  component?: string;
  tech?: string;
  tests: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

const noTests: string[] = [];

const box = { w: 150, h: 70, tests: noTests, id: "" };

test("diagram propose system:<name>: components, zones and relations from the canvas; code, tables, notes and sequences kept", (t) => {
  const dir = tempDir(t, "keylang-system-editor-");
  writeTree(dir, SHOP);

  const nodes: Node[] = [
    { key: "component:web", kind: "component", label: "web", layer: null, component: "client", tech: "браузер", x: 0, y: 0, ...box },
    { key: "component:cdn", kind: "component", label: "cdn", layer: null, component: "cdn", tech: "CloudFront", x: 200, y: 0, ...box },
    { key: "component:lb", kind: "component", label: "lb", layer: "vpc", component: "lb", tech: "ALB", x: 0, y: 200, ...box },
    { key: "component:api", kind: "component", label: "api", layer: "vpc", component: "service", tech: "express", x: 200, y: 200, ...box },
    { key: "component:stats", kind: "component", label: "stats", layer: "vpc", component: "worker", x: 400, y: 200, ...box },
    { key: "component:db", kind: "component", label: "db", layer: "vpc", component: "db", tech: "postgres", x: 0, y: 300, ...box },
    { key: "component:cache", kind: "component", label: "cache", layer: "vpc", component: "cache", tech: "redis", x: 200, y: 300, ...box },
    { key: "component:clicks", kind: "component", label: "clicks", layer: "vpc", component: "queue", tech: "kafka", x: 400, y: 300, ...box },
    // Drawn: a search index in the zone, and a gateway outside it.
    { key: "draft:1", kind: "component", label: "search", layer: "vpc", component: "search", tech: "elasticsearch", x: 600, y: 300, ...box },
  ];

  const edge = (from: string, to: string, label: string, key = `${from}->${to}`) => ({ key, kind: "relation", from: `component:${from}`, to: to.startsWith("draft:") ? to : `component:${to}`, label });

  const edges = [
    edge("web", "cdn", "calls: HTTPS"),
    edge("web", "lb", "calls: HTTPS"),
    edge("lb", "api", "calls: HTTP"),
    edge("api", "db", "reads: SELECT"),
    edge("api", "db", "writes: INSERT", "w"),
    // `calls cache GET` is gone; a new relation to the drawn index.
    edge("api", "clicks", "publishes"),
    { key: "draft:2", kind: "relation", from: "component:api", to: "draft:1", label: "reads: query" },
    edge("stats", "clicks", "consumes"),
    edge("stats", "cache", "writes: INCR"),
  ];

  const model = { view: "system:shortener", mode: "draft", nodes, edges, lanes: [{ key: "lane:vpc", id: "vpc", label: "vpc", x: -20, y: 180, w: 900, h: 300 }] };
  writeTree(dir, { "model.json": JSON.stringify(model) });
  const proposed = keylang(dir, ["diagram", "propose", "system:shortener", "--from", "model.json"]);
  assert.equal(proposed.status, 0, proposed.stdout + proposed.stderr);
  const text = readFileSync(join(dir, ".keylang/proposals/keylang/system/shortener.md"), "utf8");
  assert.match(text, /^# system shortener\n\n- requirement короткий URL веде на довгий\n[\s\S]*- \? чи потрібна аналітика переходів у реальному часі\n- client web браузер\n {2}- calls cdn HTTPS\n {2}- calls lb HTTPS\n- cdn cdn CloudFront\n- zone vpc AWS VPC\n {2}- lb lb ALB\n {4}- calls api HTTP\n {2}- service api express\n {4}- code app\n {4}- reads db SELECT\n {4}- writes db INSERT\n {4}- publishes clicks\n {4}- reads search query\n {2}- worker stats\n/);
  assert.match(text, / {2}- db db postgres\n {4}- table urls\n {6}- id bigint pk\n[\s\S]* {4}- table users\n/, "the tables stay with their store");
  assert.match(text, /\n {2}- search search elasticsearch\n- sequence redirect\n {2}- web → lb GET \/abc\n/, "the sequence stays after the components");
  assert.doesNotMatch(text, /calls cache GET/);
  // Merged, the system checks: the new component and relation are spec.
  writeTree(dir, { "keylang/system/shortener.md": text });
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout);
});

test("diagram propose system:@code: the system of the code adopted as <dir>/system/<repository>.md, with the canvas's changes", (t) => {
  const dir = tempDir(t, "keylang-system-editor-");
  const { "keylang/system/shortener.md": _hand, ...code } = SHOP;
  writeTree(dir, code);

  const nodes: Node[] = [
    { key: "component:client", kind: "component", label: "client", layer: null, component: "client", tech: "HTTP", x: 0, y: 0, ...box },
    { key: "component:app", kind: "component", label: "app", layer: null, component: "service", tech: "express", x: 200, y: 0, ...box },
    { key: "component:postgres", kind: "component", label: "postgres", layer: null, component: "db", tech: "postgres", x: 400, y: 0, ...box },
  ];

  const edges = [
    { key: "a", kind: "relation", from: "component:client", to: "component:app", label: "calls: HTTP" },
    { key: "b", kind: "relation", from: "component:app", to: "component:postgres", label: "uses" },
  ];

  writeTree(dir, { "model.json": JSON.stringify({ view: "system:@code", mode: "draft", nodes, edges, lanes: [] }) });
  const proposed = keylang(dir, ["diagram", "propose", "system:@code", "--from", "model.json"]);
  assert.equal(proposed.status, 0, proposed.stdout + proposed.stderr);
  const text = readFileSync(join(dir, ".keylang/proposals/keylang/system/shop.md"), "utf8");
  assert.match(text, /^# system shop\n\n<!-- keylang system discover[^\n]*-->\n\n- client client HTTP\n {2}- calls app HTTP\n- service app express\n {2}- code app\n {2}- uses postgres\n- db postgres postgres\n- sequence get-l-code\n/);
  assert.doesNotMatch(text, /- worker worker|- cache redis/, "what the canvas took away is gone");
});
