// The views of a system (system-design/03–05) through a static export of
// `keylang web`, which asks the read-API for every answer the page needs:
// `/api/views` lists the `# system` and the system of the code; the system
// view draws components in the lanes of their zones with the verdicts of
// their relations; ER draws tables with their columns and foreign keys; a
// sequence its participants, lifelines and numbered messages.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";
import { SHOP } from "./system-fixture.ts";

interface Drawn {
  nodes: { id: string; kind: string; label: string; component?: string; tech?: string; group?: string; lines?: string[]; verdict?: string | null; x: number; y: number }[];
  edges: { from: string; to: string; kind: string; label?: string; verdict?: string; async?: boolean }[];
  groups: { id: string; label: string }[];
  reason?: string;
  system?: { name: string; notes: { kind: string; text: string }[]; sequences: string[]; tables: number };
}

function exported(t: { after: (f: () => void) => void }): (key: string) => { status: number; body: string } | undefined {
  const repo = tempDir(t, "keylang-system-view-");
  writeTree(repo, SHOP);
  const site = tempDir(t, "keylang-system-site-");
  const done = keylang(repo, ["web", "--export", site]);
  assert.equal(done.status, 0, done.stderr);
  const answers = new Map<string, { status: number; body: string }>();
  for (const name of readdirSync(join(site, "data"))) {
    runInNewContext(readFileSync(join(site, "data", name), "utf8"), {
      keylangData: (batch: Record<string, { status: number; body: string }>) => {
        for (const [key, answer] of Object.entries(batch)) answers.set(key, answer);
      },
    });
  }
  return (key) => answers.get(key);
}

test("system views: listed, the schema with zones and verdicts, ER with keys, a sequence with lifelines, and the system of the code", (t) => {
  const answer = exported(t);
  const views = JSON.parse(answer("/api/views")!.body) as { systems: { name: string; file: string | null; sequences: string[]; tables: number; components: number }[] };
  assert.deepEqual(views.systems, [
    { name: "shortener", file: "keylang/system/shortener.md", line: 1, sequences: ["redirect"], tables: 2, components: 8 },
    { name: "@code", file: null, line: null, sequences: ["get-l-code", "clicks-count-0"], tables: 0, components: 6 },
  ]);

  const system = JSON.parse(answer("/api/diagram?name=shortener&view=system")!.body) as Drawn;
  assert.deepEqual(system.groups.map((group) => group.label), ["vpc"]);
  assert.deepEqual(system.nodes.map((node) => [node.label, node.component, node.tech ?? null, node.group ?? null, node.verdict ?? null]), [
    ["web", "client", "браузер", null, null],
    ["cdn", "cdn", "CloudFront", null, null],
    ["lb", "lb", "ALB", "vpc", null],
    ["api", "service", "express", "vpc", "unverified"],
    ["stats", "worker", null, "vpc", "unverified"],
    ["db", "db", "postgres", "vpc", null],
    ["cache", "cache", "redis", "vpc", null],
    ["clicks", "queue", "kafka", "vpc", null],
  ]);
  assert.deepEqual(system.edges.filter((edge) => edge.from === "component:api").map((edge) => [edge.label, edge.verdict ?? null, edge.async ?? false]), [
    ["reads: SELECT", "ok", false],
    ["writes: INSERT", "ok", false],
    ["calls: GET", "unverified", false],
    ["publishes", "ok", true],
  ]);
  // Outside every zone, a client stands above the zones.
  const y = (label: string): number => system.nodes.find((node) => node.label === label)!.y;
  assert.ok(y("web") < y("lb"));
  assert.deepEqual(system.system?.notes.map((note) => note.kind), ["requirement", "nfr", "estimate", "tradeoff", "question"]);

  const er = JSON.parse(answer("/api/diagram?name=shortener&view=er")!.body) as Drawn;
  assert.deepEqual(er.nodes.map((node) => [node.label, node.lines]), [
    ["urls", ["🔑 id: bigint", "◆ code: text", "owner_id: bigint null → users.id"]],
    ["users", ["🔑 id: bigint", "◆ email: text"]],
  ]);
  assert.deepEqual(er.edges.map((edge) => [edge.from, edge.to, edge.label]), [["table:db.urls", "table:db.users", "owner_id N:1"]]);
  assert.deepEqual(er.groups.map((group) => group.label), ["db (postgres)"]);

  const seq = JSON.parse(answer("/api/diagram?name=shortener&seq=redirect&view=sequence")!.body) as Drawn;
  assert.deepEqual(seq.nodes.filter((node) => node.kind === "participant").map((node) => node.label), ["web", "lb", "api", "cache", "db", "clicks"]);
  assert.deepEqual(seq.edges.filter((edge) => edge.kind === "message").map((edge) => [edge.label, edge.async ?? false]), [
    ["1. GET /abc", false],
    ["2. GET /abc", false],
    ["3. GET abc", false],
    ["4. SELECT url", false],
    ["5. click", true],
    ["6. 302", false],
  ]);
  assert.equal(seq.edges.filter((edge) => edge.kind === "lifeline").length, 6);

  const code = JSON.parse(answer("/api/diagram?name=%40code&view=system")!.body) as Drawn;
  assert.deepEqual(code.nodes.map((node) => `${node.component} ${node.label}`), ["client client", "service app", "worker worker", "cache redis", "queue kafka", "db postgres"]);
  const codeSeq = JSON.parse(answer("/api/diagram?name=%40code&seq=get-l-code&view=sequence")!.body) as Drawn;
  assert.deepEqual(codeSeq.edges.filter((edge) => edge.kind === "message").map((edge) => edge.label), ["1. GET /l/:code", "2. kafka.producer().send", "3. pool.query"]);
});
