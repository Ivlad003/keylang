// `keylang mcp` through the MCP SDK's own client over stdio (tickets
// m5-m7/17–18): the tools an agent calls, on a copy of `tests/fixtures/repo`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const FLOW = "# flow checkout\n\n- trigger app.checkout.checkout\n  - step domain.order.createOrder\n  - step infra.db.save\n";

async function connect(t: TestContext): Promise<{ dir: string; call(name: string, args?: Record<string, unknown>): Promise<{ text: string; isError: boolean }> }> {
  const dir = mkdtempSync(join(tmpdir(), "keylang-mcp-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  mkdirSync(join(dir, "keylang/flows"), { recursive: true });
  writeFileSync(join(dir, "keylang/flows/checkout.md"), FLOW);
  const client = new Client({ name: "keylang-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, "mcp"], cwd: dir, stderr: "pipe" }));
  t.after(() => client.close());
  return {
    dir,
    async call(name, args = {}) {
      const r = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
      return { text: r.content.map((c) => c.text).join(""), isError: r.isError === true };
    },
  };
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
