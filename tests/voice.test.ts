// Voice outside the TUI: what `doctor` reports when a set-up is broken, and
// the pure steps of recognition (windows, seams, spoken ids) with OpenRouter
// mocked locally.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { joinWindows, matchId, transcribeOpenRouter, windows } from "../src/voice.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

function repo(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-voice-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/repo"), dir, { recursive: true });
  return dir;
}

test("doctor: a key file others can read is a reported problem, not a failure; exit 0", (t) => {
  const dir = repo(t);
  writeFileSync(join(dir, "keylang.json"), JSON.stringify({ languages: ["typescript"], layers: { domain: "src/domain/**", app: "src/app/**", infra: "src/infra/**" }, agent: "openrouter:some/model", voice: { engine: "openrouter" } }));
  mkdirSync(join(dir, ".config/keylang"), { recursive: true });
  writeFileSync(join(dir, ".config/keylang/openrouter.key"), "or-key\n");
  chmodSync(join(dir, ".config/keylang/openrouter.key"), 0o644);
  const env = { ...process.env, HOME: dir, OPENROUTER_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined };
  const o = spawnSync(process.execPath, [bin, "doctor"], { cwd: dir, encoding: "utf8", env });
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /^agent: openrouter:some\/model: .*openrouter\.key: readable by others; run `chmod 600 /m);
  assert.match(o.stdout, /^voice: engine openrouter → .*openrouter\.key: readable by others/m);
  assert.match(o.stdout, /^@fugood\/whisper\.node: /m, "the rest of the report is still there");
});

test("voice: an empty recording is no window and no request", async (t) => {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.end("{}");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  assert.deepEqual(windows(new Int16Array(0)), []);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.equal(await transcribeOpenRouter({ kind: "openrouter", key: "k", base, model: "m" }, new Int16Array(0), []), "");
  assert.equal(requests, 0);
});

test("voice: an OpenRouter answer that is not a transcript is an error that says so", async (t) => {
  const replies = ["<html>gateway</html>", JSON.stringify({ error: { message: "model not found" } }), JSON.stringify({ choices: [] })];
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(replies.shift());
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const engine = { kind: "openrouter" as const, key: "k", base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, model: "m" };
  const pcm = new Int16Array(1600);
  await assert.rejects(transcribeOpenRouter(engine, pcm, []), /^Error: voice: openrouter answered with something other than JSON: <html>/);
  await assert.rejects(transcribeOpenRouter(engine, pcm, []), /^Error: voice: openrouter: model not found$/);
  await assert.rejects(transcribeOpenRouter(engine, pcm, []), /^Error: voice: openrouter returned no transcript/);
});

test("voice: a seam drops the longest run the overlap repeated, whatever its case and punctuation", () => {
  assert.equal(joinWindows(["paid by card, and", "Card and then shipped"]), "paid by card, and then shipped");
  // A second of fast speech holds more than four words.
  assert.equal(joinWindows(["we check the order and then we save it", "and then we save it to the database"]), "we check the order and then we save it to the database");
  assert.equal(joinWindows(["one two", "three four"]), "one two three four");
});

test("voice: spoken words name an id only when one id fits, or exactly one is said in full", () => {
  const ids = ["domain.order.total", "domain.order.createOrder", "domain.order.totalTax", "infra.db.save"];
  assert.equal(matchId("order", ids), null, "three ids have «order»");
  assert.equal(matchId("create order", ids), "domain.order.createOrder");
  assert.equal(matchId("order total", ids), "domain.order.total", "said in full beside «order total tax»");
  assert.equal(matchId("db save", ids), "infra.db.save");
  assert.equal(matchId("refund", ids), null);
});
