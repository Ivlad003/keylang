// Golden `check` of every assertion form. The expected files are the contract
// for the SpecIR migration: verdicts, specHash, and human order.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const forms = join(root, "tests/fixtures/spec-forms");

function check(dir: string, json: boolean): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, "check", ...(json ? ["--format", "json"] : [])], { cwd: dir, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Replace snapshot ids only. specHash stays, so the golden locks rule identity. */
function scrub(stdout: string): string {
  const data = JSON.parse(stdout) as { snapshotId: string; results: { snapshotId: string }[] };
  assert.match(data.snapshotId, /^[0-9a-f]{64}$/);
  for (const row of data.results) assert.match(row.snapshotId, /^[0-9a-f]{64}$/);
  return stdout.replaceAll(/"snapshotId": "[0-9a-f]{64}"/g, '"snapshotId": "SNAPSHOT"');
}

for (const name of ["valid", "invalid"] as const) {
  test(`spec forms: ${name} matches the golden check`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), "keylang-spec-forms-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    cpSync(join(forms, name), dir, { recursive: true });
    const expected = join(forms, `${name}.expected`);
    const json = check(dir, true);
    const human = check(dir, false);
    assert.equal(json.status, 1);
    assert.equal(human.status, 1);
    const scrubbed = scrub(json.stdout);
    assert.equal(scrubbed, readFileSync(join(expected, "check.json"), "utf8"));
    assert.equal(human.stdout, readFileSync(join(expected, "check.stdout"), "utf8"));
    assert.equal(human.stderr, readFileSync(join(expected, "check.stderr"), "utf8"));
    assert.equal(/\/home\/|\/tmp\//.test(scrubbed + human.stdout), false);
    const body = JSON.parse(scrubbed) as { results: { verdict: string; code: string | null; evidence: string; specHash: string; reason?: string; file: string; line: number; col: number }[]; coverage: unknown[] };
    assert.ok(Array.isArray(body.coverage));
    for (const row of body.results) assert.match(row.specHash, /^[0-9a-f]{64}$/);
    if (name === "valid") {
      const verdicts = new Set(body.results.map((row) => row.verdict));
      assert.equal(verdicts.has("ok") && verdicts.has("fail") && verdicts.has("unverified"), true);
      assert.equal(body.results.some((row) => row.code === "K005"), false);
      assert.ok(body.results.some((row) => row.code === "K102" && row.evidence.includes("wiring")));
    } else {
      const text = body.results.map((row) => row.evidence).join("\n");
      for (const phrase of [
        "`layers` lists layers; `app.buy` is not a layer",
        "`deny` takes layers, modules and ID prefixes; `domain.order.create` is a fn",
        "layer `domain` is both in a `layers` order and unordered under it",
        "`layers` orders layers; `app.buy` is not a layer",
        "layer `domain` appears twice in one order",
        "contradicts an earlier `layers`",
        "a wiring condition must be `env.NAME = value`",
        "unterminated quote",
        "expected an ID as the link text",
        "`deny` needs at least 2 ID(s)",
        "`kind` must be `business` or `technical`",
        "`planned` needs",
      ]) assert.ok(text.includes(phrase), phrase);
      const quotes = body.results.filter((row) => row.evidence === "unterminated quote" && row.evidence.includes("unterminated"));
      assert.ok(human.stdout.includes('keylang/flows/bad.md:5:13: K005 unterminated quote'));
      assert.ok(human.stdout.includes('keylang/flows/bad.md:5:13: K005 expected `test <file> "<name>"`'));
      assert.equal(quotes.length >= 1, true);
      const reasons = ["arguments", "id", "link", "quote", "layer", "scope"];
      const seen = new Set<string>();
      for (const row of body.results) {
        if (row.code === "K005") {
          assert.ok(reasons.includes(row.reason ?? ""), row.evidence);
          seen.add(row.reason ?? "");
        } else assert.equal(Object.hasOwn(row, "reason"), false, row.evidence);
      }
      assert.deepEqual([...seen].sort(), [...reasons].sort());
    }
  });
}

test("spec forms: parse --json repeats parser K005 reasons, and test f.ts \"x is quote plus arguments", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-spec-forms-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(forms, "invalid"), dir, { recursive: true });
  const parsed = spawnSync(process.execPath, [bin, "parse", "--json", "keylang"], { cwd: dir, encoding: "utf8" });
  assert.equal(parsed.status, 1, parsed.stderr);
  const docs = JSON.parse(parsed.stdout) as { path: string; diagnostics: { code: string; message: string; reason?: string; span: { start: { line: number; col: number } } }[] }[];
  const checked = check(dir, true);
  const results = (JSON.parse(checked.stdout) as { results: { code: string | null; evidence: string; reason?: string; file: string; line: number; col: number }[] }).results;
  for (const doc of docs) {
    for (const diag of doc.diagnostics) {
      if (diag.code !== "K005") {
        assert.equal(diag.reason, undefined);
        continue;
      }
      const hit = results.find((row) => row.file === doc.path && row.line === diag.span.start.line && row.col === diag.span.start.col && row.evidence === diag.message);
      assert.equal(hit?.reason, diag.reason, diag.message);
    }
  }
  const pair = docs
    .flatMap((doc) => doc.diagnostics.map((diag) => ({ ...diag, path: doc.path })))
    .filter((diag) => diag.path === "keylang/flows/bad.md" && diag.code === "K005" && diag.span.start.line === 5 && diag.span.start.col === 13);
  assert.deepEqual(pair.map((diag) => diag.reason).sort(), ["arguments", "quote"]);
});

test("spec forms: sarif carries properties.reason only on K005; github and explain K005 stay textual", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "keylang-spec-forms-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(forms, "invalid"), dir, { recursive: true });
  const sarif = spawnSync(process.execPath, [bin, "check", "--format", "sarif"], { cwd: dir, encoding: "utf8" });
  assert.equal(sarif.status, 1, sarif.stderr);
  const results = (JSON.parse(sarif.stdout) as { runs: { results: { ruleId: string; properties: { reason?: string } }[] }[] }).runs[0]!.results;
  assert.ok(results.some((row) => row.ruleId === "K005"));
  for (const row of results) {
    if (row.ruleId === "K005") assert.ok(["arguments", "id", "link", "quote", "layer", "scope"].includes(row.properties.reason ?? ""));
    else assert.equal(row.properties.reason, undefined);
  }
  const github = spawnSync(process.execPath, [bin, "check", "--format", "github"], { cwd: dir, encoding: "utf8" });
  const human = spawnSync(process.execPath, [bin, "check"], { cwd: dir, encoding: "utf8" });
  assert.equal(github.stdout.includes("reason"), false);
  assert.equal(human.stdout, readFileSync(join(forms, "invalid.expected/check.stdout"), "utf8"));
  for (const code of ["K005", "k005"]) {
    const explained = spawnSync(process.execPath, [bin, "explain", code], { cwd: dir, encoding: "utf8" });
    assert.equal(explained.status, 0, explained.stderr);
    for (const reason of ["arguments", "id", "link", "quote", "layer", "scope"]) assert.match(explained.stdout, new RegExp(`^- ${reason}:`, "m"));
  }
});
