// `keylang mcp` through the MCP SDK's own client over stdio (tickets
// m5-m7/17–18): the tools an agent calls, on a copy of `tests/fixtures/repo`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { HOOK_FLOW, HOOKS } from "./hooks-fixture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;
const FLOW = "# flow checkout\n\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n  - step infra.db.save\n";

async function connect(t: TestContext, fixture = "repo"): Promise<{ dir: string; call(name: string, args?: Record<string, unknown>): Promise<{ text: string; isError: boolean }>; list(): Promise<string[]> }> {
  const dir = mkdtempSync(join(tmpdir(), "keylang-mcp-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures", fixture), dir, { recursive: true });
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  if (fixture === "repo") writeFileSync(join(dir, "keylang/flows/checkout.md"), FLOW);
  const client = new Client({ name: "keylang-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, "mcp"], cwd: dir, stderr: "pipe" }));
  t.after(() => client.close());
  return {
    dir,
    async call(name, args = {}) {
      const r = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
      return { text: r.content.map((c) => c.text).join(""), isError: r.isError === true };
    },
    async list() {
      const listed = await client.listTools();
      return listed.tools.map((tool) => tool.name);
    },
  };
}

function treeBytes(dir: string): string {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel))) {
      const path = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(dir, path)).isDirectory()) walk(path);
      else out.push(`${path}\0${readFileSync(join(dir, path))}`);
    }
  };
  walk("");
  return out.sort().join("\n");
}

test("mcp: node gives signature, edges, flows and evidence; search, code and flows answer from the fresh analysis", async (t) => {
  const mcp = await connect(t);
  const node = JSON.parse((await mcp.call("node", { id: "app.checkout.checkout" })).text) as { signature: string; flows: string[]; calls: string[]; edges: { kind: string; target: string }[]; evidence: { criterion: string; verdict: string }[] };
  assert.equal(node.signature, "(id: string, items: number[]) → Order");
  assert.deepEqual(node.flows, ["checkout"]);
  assert.deepEqual(node.calls, ["domain.order.createOrder", "infra.db.save"]);
  assert.ok(node.edges.some((e) => e.kind === "call" && e.target === "infra.db.save"));
  assert.ok(node.evidence.some((e) => e.criterion === "ID" && e.verdict === "ok"));

  const hits = JSON.parse((await mcp.call("search", { query: "order" })).text) as { id: string }[];
  assert.ok(hits.some((h) => h.id === "domain.order.createOrder"));
  const code = JSON.parse((await mcp.call("code", { id: "domain.order.total" })).text) as { code: string; file: string };
  assert.equal(code.file, "src/domain/order.ts");
  assert.match(code.code, /items\.reduce/);
  const flows = JSON.parse((await mcp.call("flows", { name: "checkout" })).text) as { steps: { id: string; verdicts: { criterion: string; verdict: string }[] }[] }[];
  assert.ok(flows[0]!.steps.find((s) => s.id === "infra.db.save")!.verdicts.some((v) => v.criterion === "static" && v.verdict === "ok"));
  const unknown = await mcp.call("node", { id: "app.checkout.chekout" });
  assert.equal(unknown.isError, true);
  assert.match(unknown.text, /did you mean `app\.checkout\.checkout`/);
});

test("mcp: search finds planned ids beside the snapshot's", async (t) => {
  const mcp = await connect(t);
  writeFileSync(join(mcp.dir, "keylang/flows/refund.md"), "# flow refund\n\n- planned fn domain.order.refund (order: Order) → void\n- trigger app.checkout.checkout\n  - step domain.order.refund\n");
  const hits = JSON.parse((await mcp.call("search", { query: "refund" })).text) as { id: string; kind: string; signature: string | null; file: string; line: number }[];
  assert.deepEqual(hits, [{ id: "domain.order.refund", kind: "planned fn", signature: "(order: Order) → void", file: "keylang/flows/refund.md", line: 3, explanation: null }]);
});

type Hit = { id: string; kind: string; explanation: { text: string; origin: string; stale: boolean; agent?: string; date?: string } | null };

test("mcp: search finds a node by the words of its explanation after the ID matches; node carries the explanation", async (t) => {
  const mcp = await connect(t, "explained");
  // "memory" is only in the JSDoc of the class.
  const memory = JSON.parse((await mcp.call("search", { query: "Memory" })).text) as Hit[];
  assert.deepEqual(
    memory.map((h) => [h.id, h.kind, h.explanation]),
    [["domain.order.Ledger", "class", { text: "Keeps orders in memory.", origin: "doc", stale: false }]],
  );
  const order = JSON.parse((await mcp.call("search", { query: "order", limit: 100 })).text) as Hit[];
  const byText = order.findIndex((h) => !h.id.toLowerCase().includes("order"));
  assert.equal(order[byText]?.id, "app.checkout", "its doc comment says `order`, its ID does not");
  assert.ok(order.slice(byText).every((h) => !h.id.toLowerCase().includes("order")), "every ID match comes before every text match");
  assert.ok(byText > 0);
  assert.equal((JSON.parse((await mcp.call("search", { query: "order", limit: 2 })).text) as Hit[]).length, 2);
  const node = JSON.parse((await mcp.call("node", { id: "domain.order.total" })).text) as Hit;
  assert.deepEqual(node.explanation, { text: "Sums item prices. The sum calls `items.reduce()` once.", origin: "doc", stale: false });
  assert.equal((JSON.parse((await mcp.call("node", { id: "domain.order.createOrder" })).text) as Hit).explanation, null);
});

test("mcp: a saved model brief is an `llm` explanation, stale once the code under it changes; explain.map need not be on", async (t) => {
  const mcp = await connect(t, "explained");
  assert.equal(spawnSync(process.execPath, [bin, "map"], { cwd: mcp.dir }).status, 0);
  const index = JSON.parse(readFileSync(join(mcp.dir, ".keylang/index.json"), "utf8")) as { nodes: Record<string, { closure?: { fingerprint: string } }> };
  const closure = index.nodes["domain.order.createOrder"]!.closure!.fingerprint;
  mkdirSync(join(mcp.dir, "keylang/explain/brief"), { recursive: true });
  writeFileSync(join(mcp.dir, "keylang/explain/brief/domain.order.createOrder.md"), `<!-- keylang:explain agent=anthropic:m date=2026-09-28 closure=${closure} lang=en detail=brief -->\nAssembles an order from item prices.\n`);
  const search = async (): Promise<Hit[]> => JSON.parse((await mcp.call("search", { query: "assembles" })).text) as Hit[];
  assert.deepEqual(
    (await search()).map((h) => [h.id, h.explanation]),
    [["domain.order.createOrder", { text: "Assembles an order from item prices.", origin: "llm", stale: false, agent: "anthropic:m", date: "2026-09-28" }]],
  );
  const file = join(mcp.dir, "src/domain/order.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace("return { id, total: total(items) };", "return { id: id.trim(), total: total(items) };"));
  assert.equal((await search())[0]?.explanation?.stale, true);
  assert.equal((JSON.parse((await mcp.call("node", { id: "domain.order.createOrder" })).text) as Hit).explanation?.stale, true);
});

test("mcp: each call sees sources, specs and evidence changed since the last one", async (t) => {
  const mcp = await connect(t);
  const config = join(mcp.dir, "keylang.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), check: { tests: ".keylang/reports/*.json" } }));
  type Check = { results: { code: string | null; verdict: string; evidence: string; reason?: string }[] };
  const check = async (): Promise<Check> => JSON.parse((await mcp.call("check")).text) as Check;
  const codes = (r: Check): (string | null)[] => r.results.filter((row) => row.verdict === "fail").map((row) => row.code);
  assert.deepEqual(codes(await check()), []);
  assert.deepEqual(codes(await check()), [], "an unchanged repository answers the same");
  const source = join(mcp.dir, "src/domain/order.ts");
  writeFileSync(source, `${readFileSync(source, "utf8")}import { save } from "../infra/db.ts";\nexport function keep(o: Order): void { save(o); }\n`);
  assert.ok(codes(await check()).includes("K102"), "a denied import added to a source");
  writeFileSync(join(mcp.dir, "keylang/flows/checkout.md"), `${FLOW}  - step domain.order.missingFn\n`);
  assert.ok(codes(await check()).includes("K001"), "a dangling step added to a spec");
  writeFileSync(join(mcp.dir, "keylang/flows/checkout.md"), `${FLOW}  - step domain.order.missingFn\n- test f.ts "x\n`);
  const quoted = await check();
  assert.equal(quoted.results.find((row) => row.code === "K005" && row.evidence === "unterminated quote")?.reason, "quote");
  assert.equal(quoted.results.find((row) => row.code === "K102")?.reason, undefined);
  mkdirSync(join(mcp.dir, ".keylang/reports"), { recursive: true });
  writeFileSync(join(mcp.dir, ".keylang/reports/run.json"), "{ not json");
  const broken = await mcp.call("check");
  assert.equal(broken.isError, true);
  assert.match(broken.text, /run\.json: invalid JSON report/);
});

test("mcp: check.static shape matches check, and editing the field is seen without a restart", async (t) => {
  const mcp = await connect(t);
  const layers = { domain: ["src/domain/**"], application: ["src/application/**"], presentation: ["src/presentation/**"] };
  const config = join(mcp.dir, "keylang.json");
  writeFileSync(config, `${JSON.stringify({ languages: ["typescript"], layers, check: { static: "shape" } }, null, 2)}\n`);
  for (const [path, text] of Object.entries(HOOKS)) {
    mkdirSync(dirname(join(mcp.dir, path)), { recursive: true });
    writeFileSync(join(mcp.dir, path), text);
  }
  writeFileSync(join(mcp.dir, "keylang/rules.md"), "# rules\n");
  writeFileSync(join(mcp.dir, "keylang/flows/hooks.md"), HOOK_FLOW);
  rmSync(join(mcp.dir, "keylang/flows/checkout.md"));
  type Row = { criterion: string; verdict: string; evidence: string; area: string };
  const listed = async (): Promise<Row[]> => (JSON.parse((await mcp.call("check")).text) as { results: Row[] }).results;
  const cli = spawnSync(process.execPath, [bin, "check", "--format", "json"], { cwd: mcp.dir, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const viaCli = (JSON.parse(cli.stdout) as { results: Row[] }).results;
  const stamp = (row: Row): string => `${row.criterion}\t${row.verdict}\t${row.area}\t${row.evidence}`;
  assert.deepEqual((await listed()).map(stamp), viaCli.map(stamp));
  assert.ok(viaCli.some((row) => row.criterion === "static" && row.verdict === "unverified" && row.evidence.includes("set by keylang.json check.static")), viaCli.map(stamp).join("\n"));

  writeFileSync(config, `${JSON.stringify({ languages: ["typescript"], layers }, null, 2)}\n`);
  const behavior = await listed();
  assert.ok(behavior.some((row) => row.criterion === "static" && row.area === "domain.build.build" && row.verdict === "ok"), behavior.map(stamp).join("\n"));
  assert.ok(!behavior.some((row) => row.evidence.includes("check.static")), behavior.map(stamp).join("\n"));
});

test("mcp: check returns the results of `check --format json`", async (t) => {
  const mcp = await connect(t);
  const viaMcp = JSON.parse((await mcp.call("check")).text) as { results: unknown[]; snapshotId: string };
  const cli = spawnSync(process.execPath, [bin, "check", "--format", "json"], { cwd: mcp.dir, encoding: "utf8" });
  const viaCli = JSON.parse(cli.stdout) as { results: unknown[]; snapshotId: string };
  assert.equal(viaMcp.snapshotId, viaCli.snapshotId);
  assert.deepEqual(viaMcp.results, viaCli.results);
});

test("mcp: apply_diff only writes a pending proposal; a target outside the specs is refused", async (t) => {
  const mcp = await connect(t);
  const next = `${FLOW}  - invariant an order is saved once\n`;
  const r = JSON.parse((await mcp.call("apply_diff", { path: "keylang/flows/checkout.md", text: next })).text) as { status: string; proposal: string; diff: string };
  assert.equal(r.status, "pending");
  assert.equal(r.proposal, ".keylang/proposals/keylang/flows/checkout.md");
  assert.match(r.diff, /^\+ {2}- invariant an order is saved once$/m);
  assert.equal(readFileSync(join(mcp.dir, "keylang/flows/checkout.md"), "utf8"), FLOW, "the spec is untouched");
  assert.equal(readFileSync(join(mcp.dir, r.proposal), "utf8"), next);
  const outside = await mcp.call("apply_diff", { path: "src/app/checkout.ts", text: "x" });
  assert.equal(outside.isError, true);
  assert.match(outside.text, /not a Markdown spec/);
  const map = await mcp.call("apply_diff", { path: "keylang/map/app.md", text: "x" });
  assert.match(map.text, /a generated map file/);
  assert.ok(!existsSync(join(mcp.dir, ".keylang/proposals/src")));
});

test("mcp: explain gives the offline summary without a model", async (t) => {
  const mcp = await connect(t);
  const r = JSON.parse((await mcp.call("explain", { id: "domain.order.total" })).text) as { summary: { kind: string }; explanation: unknown };
  assert.equal(r.summary.kind, "fn");
  assert.equal(r.explanation, null);
});

test("mcp: context, validate_spec, scaffold and feature_status", async (t) => {
  const mcp = await connect(t);
  const names = await mcp.list();
  for (const name of ["search", "node", "code", "flows", "check", "explain", "apply_diff", "context", "validate_spec", "scaffold", "feature_status"]) {
    assert.ok(names.includes(name), name);
  }
  mkdirSync(join(mcp.dir, "keylang/features"), { recursive: true });
  writeFileSync(join(mcp.dir, "keylang/features/refund.md"), "# flow refund\n\n- planned fn domain.order.refund (order: Order) → void\n- trigger app.checkout.checkout\n  - step domain.order.refund\n");
  const pack = JSON.parse((await mcp.call("context", { id: "domain.order.refund" })).text) as { items: { kind: string; planned?: true; incomplete?: true; label: string }[] };
  const node = pack.items.find((item) => item.kind === "node" && item.label === "domain.order.refund");
  assert.equal(node?.planned, true);
  assert.equal(node?.incomplete, true);
  const feature = JSON.parse((await mcp.call("context", { feature: "refund" })).text) as { items: { label: string }[] };
  assert.ok(feature.items.some((item) => item.label === "domain.order.refund"));
  assert.ok(feature.items.some((item) => item.label === "app.checkout.checkout"));

  const disk = treeBytes(mcp.dir);
  const spec = "# flow broken\n\n- trigger app.checkout.missingFn\n";
  const validated = await mcp.call("validate_spec", { path: "keylang/flows/broken.md", text: spec });
  assert.equal(validated.isError, false, validated.text);
  const report = JSON.parse(validated.text) as { diagnostics: { code: string; line: number; col: number; reason?: string }[] };
  const k001 = report.diagnostics.find((diag) => diag.code === "K001");
  assert.ok(k001, validated.text);
  assert.equal(k001.line, 3);
  assert.equal(k001.col, 11);
  assert.equal(k001.reason, undefined);
  const quoted = await mcp.call("validate_spec", { path: "keylang/flows/quote.md", text: '# flow q\n\n- test f.ts "x\n' });
  assert.equal(quoted.isError, false, quoted.text);
  const quoteReport = JSON.parse(quoted.text) as { diagnostics: { code: string; message: string; reason?: string }[] };
  assert.equal(quoteReport.diagnostics.find((diag) => diag.message === "unterminated quote")?.reason, "quote");
  assert.equal(existsSync(join(mcp.dir, "keylang/flows/broken.md")), false);
  assert.equal(treeBytes(mcp.dir), disk);

  const scaffold = await mcp.call("scaffold", { id: "domain.order.refund" });
  assert.equal(scaffold.isError, false, scaffold.text);
  const printed = spawnSync(process.execPath, [bin, "spec-to-code", "domain.order.refund", "--print"], { cwd: mcp.dir, encoding: "utf8" });
  assert.equal(printed.status, 0, printed.stderr);
  const body = JSON.parse(scaffold.text) as { diff: string; stub: string };
  assert.ok(printed.stdout.includes(body.diff), printed.stdout);
  assert.match(body.stub, /not implemented: domain\.order\.refund/);
  assert.equal(treeBytes(mcp.dir), disk);
  const implemented = await mcp.call("scaffold", { id: "domain.order.total" });
  assert.equal(implemented.isError, true);
  assert.match(implemented.text, /already implemented \(src\/domain\/order\.ts:\d+\)/);

  const status = JSON.parse((await mcp.call("feature_status", { slug: "refund" })).text) as { done: boolean; gaps: { kind: string }[] };
  assert.equal(status.done, false);
  assert.ok(status.gaps.some((gap) => gap.kind === "planned"));
  assert.equal(treeBytes(mcp.dir), disk);
});

// Ticket harness-integration/02: the command `agents` writes to `.mcp.json`,
// run as written, starts a server that answers `tools/list`. The published
// `npx -y keylang@<VERSION>` needs the npm registry, so the test swaps that
// prefix for this checkout's CLI under this Node and keeps the rest — the
// `mcp` argument — from the config.
test("mcp: the command .mcp.json pins starts a server that answers tools/list", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-mcp-cmd-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  const init = spawnSync(process.execPath, [bin, "init", "--agents=claude"], { cwd: dir, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const server = (JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")) as { mcpServers: { keylang: { command: string; args: string[] } } }).mcpServers.keylang;
  assert.deepEqual(server, { command: "npx", args: ["-y", `keylang@${VERSION}`, "mcp"] });
  const args = [bin, ...server.args.slice(["-y", `keylang@${VERSION}`].length)];
  const client = new Client({ name: "keylang-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args, cwd: dir, stderr: "pipe" }));
  t.after(() => client.close());
  const listed = await client.listTools();
  for (const name of ["search", "node", "code", "flows", "check", "explain", "apply_diff", "context", "validate_spec", "scaffold", "feature_status"]) {
    assert.ok(listed.tools.some((tool) => tool.name === name), name);
  }
});
