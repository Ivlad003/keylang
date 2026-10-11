// `keylang system list|show|discover|new` (system-design/06, 09) through the
// real CLI: the sections listed, one shown as a tree with the verdicts of its
// relations, the system of the code printed as a `# system` that checks
// clean, and a new skeleton that checks clean and is never written twice.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";
import { SHOP } from "./system-fixture.ts";

test("system list and show: the sections, and one as a tree with the verdicts of its bound relations; an unknown name is exit 2", (t) => {
  const dir = tempDir(t, "keylang-system-cli-");
  writeTree(dir, SHOP);
  const list = keylang(dir, ["system", "list"]);
  assert.equal(list.status, 0, list.stderr);
  assert.equal(list.stdout, "shortener\tkeylang/system/shortener.md:1\t8 component(s), 2 table(s), 1 sequence(s)\n");
  const show = keylang(dir, ["system", "show", "shortener"]);
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /^ {4}service api \(express\) — code app\n {6}✓ reads db SELECT — `app\.links` → `infra\.db` imports `external\.pg`$/m);
  assert.match(show.stdout, /^ {6}◌ calls cache GET — no import from the code of `api` reaches a redis client/m);
  assert.match(show.stdout, /^ {4}5\. api ⇢ clicks click$/m);
  assert.match(show.stdout, /0 fail, 2 unverified, 4 ok\n$/);
  const json = JSON.parse(keylang(dir, ["system", "show", "shortener", "--json"]).stdout) as { verdicts: { verdict: string; area: string }[] };
  assert.deepEqual(json.verdicts.map((verdict) => `${verdict.verdict} ${verdict.area}`), ["ok api reads db", "ok api writes db", "unverified api calls cache", "ok api publishes clicks", "unverified stats consumes clicks", "ok stats writes cache"]);
  const unknown = keylang(dir, ["system", "show", "nope"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /system show: no `# system nope`; there are: shortener/);
  assert.equal(keylang(dir, ["system", "frobnicate"]).status, 2);
});

test("system discover: the system of the code as a # system that parses and checks without a finding, with sequences of the entry points", (t) => {
  const dir = tempDir(t, "keylang-system-cli-");
  const { "keylang/system/shortener.md": _hand, ...code } = SHOP;
  writeTree(dir, code);
  const found = keylang(dir, ["system", "discover"]);
  assert.equal(found.status, 0, found.stderr);
  assert.equal(
    found.stdout.split("\n").filter((line) => line.startsWith("-") || line.startsWith("  -") || line.startsWith("#")).join("\n"),
    [
      "# system shop",
      "- client client HTTP",
      "  - calls app HTTP",
      "- service app express",
      "  - code app",
      "  - publishes kafka",
      "  - uses postgres",
      "- worker worker nestjs",
      "  - code worker",
      "  - uses redis",
      "- cache redis redis",
      "- queue kafka kafka",
      "- db postgres postgres",
      "- sequence get-l-code",
      "  - client → app GET /l/:code",
      "  - app ⇢ kafka kafka.producer().send",
      "  - app → postgres pool.query",
      "- sequence clicks-count-0",
      "  - worker → redis redis.incr",
    ].join("\n"),
  );
  // Adopted as written, it is a spec `check` agrees with.
  writeTree(dir, { "keylang/system/shop.md": found.stdout });
  const checked = keylang(dir, ["check", "--format", "json"]);
  assert.equal(checked.status, 0, checked.stdout);
  const results = (JSON.parse(checked.stdout) as { results: { verdict: string; criterion: string; code: string | null }[] }).results;
  assert.deepEqual(results.filter((result) => result.criterion === "system shop").map((result) => result.verdict), ["ok", "ok", "ok"]);
  assert.deepEqual(results.filter((result) => (result.code ?? "").startsWith("K")), []);
});

test("system new: a skeleton (--interview: with requirements, estimates and trade-offs) that checks clean; a second time is exit 2 and the file stays", (t) => {
  const dir = tempDir(t, "keylang-system-cli-");
  writeTree(dir, { "keylang.json": `${JSON.stringify({ languages: [], layers: {} })}\n` });
  const made = keylang(dir, ["system", "new", "chat", "--interview"]);
  assert.equal(made.status, 0, made.stderr);
  assert.equal(made.stdout, "keylang/system/chat.md: written\n");
  const text = readFileSync(join(dir, "keylang/system/chat.md"), "utf8");
  assert.match(text, /^# system chat\n[\s\S]*- requirement [\s\S]*- estimate [\s\S]*- tradeoff [\s\S]*- sequence main\n/);
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  writeFileSync(join(dir, "keylang/system/chat.md"), `${text}- ? mine\n`);
  const again = keylang(dir, ["system", "new", "chat"]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /keylang\/system\/chat\.md exists/);
  assert.match(readFileSync(join(dir, "keylang/system/chat.md"), "utf8"), /- \? mine\n$/);
  assert.equal(keylang(dir, ["system", "new", "1bad"]).status, 2);
  assert.match(keylang(dir, ["system", "show", "chat", "--interview"]).stderr, /--interview goes with `system new`/);
});
