// Fingerprints of snapshot nodes (design §4.4, ticket m5-m7/11): what changes
// them and what does not, through `keylang map` and `.keylang/index.json`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

interface Node {
  fingerprint?: string;
  closure?: { fingerprint: string; complete: boolean };
}

function repo(t: TestContext, files: Record<string, string>): { dir: string; write(file: string, text: string): void; map(): { snapshotId: string; nodes: Record<string, Node> } } {
  const dir = mkdtempSync(join(tmpdir(), "keylang-fp-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (file: string, text: string): void => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  write("keylang.json", JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }));
  for (const [file, text] of Object.entries(files)) write(file, text);
  return {
    dir,
    write,
    map() {
      const r = spawnSync(process.execPath, [bin, "map"], { cwd: dir, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
    },
  };
}

const ORDER = "export function valid(total: number): boolean {\n  return total > 0;\n}\n\nexport function describe(): string {\n  return valid(1) ? \"ok\" : \"empty\";\n}\n";

test("fingerprint: a changed operator changes the fn and the closure of its callers; comments and layout do not", (t) => {
  const r = repo(t, { "src/order.ts": ORDER });
  const before = r.map();
  const valid = before.nodes["main.order.valid"]!;
  const describe = before.nodes["main.order.describe"]!;
  assert.match(valid.fingerprint!, /^[0-9a-f]{64}$/);
  assert.deepEqual(valid.closure?.complete, true);

  r.write("src/order.ts", ORDER.replace("total > 0", "total >= 0"));
  const changed = r.map();
  assert.notEqual(changed.nodes["main.order.valid"]!.fingerprint, valid.fingerprint);
  // `describe` itself is unchanged; what it calls is not.
  assert.equal(changed.nodes["main.order.describe"]!.fingerprint, describe.fingerprint);
  assert.notEqual(changed.nodes["main.order.describe"]!.closure!.fingerprint, describe.closure!.fingerprint);

  r.write("src/order.ts", ORDER.replace("  return total > 0;", "  // positive totals only\n  return   total >\n    0;"));
  const reformatted = r.map();
  assert.equal(reformatted.nodes["main.order.valid"]!.fingerprint, valid.fingerprint);
  assert.equal(reformatted.nodes["main.order.describe"]!.closure!.fingerprint, describe.closure!.fingerprint);
});

test("fingerprint: a call cycle terminates and changes as one; an unresolved call makes the closure incomplete", (t) => {
  const r = repo(t, {
    "src/ping.ts": 'import { pong } from "./pong.ts";\n\nexport function ping(n: number): number {\n  return n > 0 ? pong(n - 1) : 0;\n}\n',
    "src/pong.ts": 'import { ping } from "./ping.ts";\n\nexport function pong(n: number): number {\n  return ping(n);\n}\n\nexport function start(worker: { run(): void }): number {\n  worker.run();\n  return pong(3);\n}\n',
  });
  const before = r.map();
  const ping = before.nodes["main.ping.ping"]!.closure!;
  assert.equal(before.nodes["main.pong.pong"]!.closure!.fingerprint, ping.fingerprint, "a cycle hashes as one");
  assert.equal(ping.complete, true);
  assert.equal(before.nodes["main.pong.start"]!.closure!.complete, false, "`worker.run()` is a call keylang does not resolve");

  r.write("src/ping.ts", 'import { pong } from "./pong.ts";\n\nexport function ping(n: number): number {\n  return n > 1 ? pong(n - 1) : 0;\n}\n');
  const after = r.map();
  assert.notEqual(after.nodes["main.pong.pong"]!.closure!.fingerprint, ping.fingerprint, "a change in ping changes pong through the cycle");
  assert.equal(after.nodes["main.pong.pong"]!.fingerprint, before.nodes["main.pong.pong"]!.fingerprint);
});

test("fingerprint: `new C()` covers the constructor it runs", (t) => {
  const source = (n: number): string => `export class C {\n  constructor() {\n    helper(${n});\n  }\n}\n\nexport function helper(n: number): number {\n  return n;\n}\n\nexport function start(): C {\n  return new C();\n}\n`;
  const r = repo(t, { "src/c.ts": source(1) });
  const before = r.map().nodes["main.c.start"]!;
  r.write("src/c.ts", source(2));
  const after = r.map().nodes["main.c.start"]!;
  assert.equal(after.fingerprint, before.fingerprint);
  assert.notEqual(after.closure!.fingerprint, before.closure!.fingerprint, "a changed constructor changes the closure of `start`");
  assert.equal(after.closure!.complete, true);
});

test("fingerprint: a decorator that may replace a fn makes its closure and its callers' incomplete; `C()` covers `__init__`", (t) => {
  const r = repo(t, {
    "app/main.py":
      "def replace(fn):\n    return fn\n\n\n@replace\ndef decorated():\n    return 1\n\n\ndef plain():\n    return 2\n\n\ndef start():\n    return decorated() + plain()\n\n\nclass C:\n    def __init__(self):\n        plain()\n\n\ndef make():\n    return C()\n",
  });
  r.write("keylang.json", JSON.stringify({ languages: ["python"], layers: { main: ["app/**"] } }));
  const nodes = r.map().nodes;
  assert.equal(nodes["main.main.decorated"]!.closure!.complete, false, "the body read may not be what a call runs");
  assert.equal(nodes["main.main.start"]!.closure!.complete, false, "a caller reaches the replaced fn");
  assert.equal(nodes["main.main.plain"]!.closure!.complete, true);
  assert.equal(nodes["main.main.make"]!.closure!.complete, true, "`C()` runs `C.__init__`, which is complete");
});

test("fingerprint: CRLF and LF checkouts of a multi-line string give the same fingerprint and closure; a changed string does not", (t) => {
  // Ticket review-2026-10-06/30.
  const source = 'export function banner(name: string): string {\n  return `Hello\n  ${name}\n  bye`;\n}\n\nexport function greet(): string {\n  return banner("you");\n}\n';
  const r = repo(t, { "src/b.ts": source });
  const lf = r.map().nodes;
  r.write("src/b.ts", source.replace(/\n/g, "\r\n"));
  const crlf = r.map().nodes;
  assert.equal(crlf["main.b.banner"]!.fingerprint, lf["main.b.banner"]!.fingerprint);
  assert.equal(crlf["main.b.greet"]!.closure!.fingerprint, lf["main.b.greet"]!.closure!.fingerprint);
  r.write("src/b.ts", source.replace("bye", "ciao"));
  assert.notEqual(r.map().nodes["main.b.banner"]!.fingerprint, lf["main.b.banner"]!.fingerprint, "the text of a string is still part of it");
});
