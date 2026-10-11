// `# system <name>` (system-design/01): the parsed tree of a system through
// `parse --json`, the K004/K005 of its positions, and `fmt` keeping it as
// written and idempotent. Through the real CLI on a temporary directory.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const SYSTEM = `# system shortener

- requirement короткий URL веде на довгий
- estimate 100M URL/міс ≈ 40 записів/с
- ? аналітика в реальному часі
- client web браузер
- zone private AWS VPC
  - service api Node.js
    - code app.links
    - reads db SELECT
    - publishes clicks async
    - scale ×3
  - db db postgres
    - table urls
      - id bigint pk
      - owner_id bigint null fk users.id
      - index code
  - queue clicks kafka
- sequence redirect
  - client → api GET /abc
  - api ⇢ clicks click
`;

interface Item {
  kind: string;
  name?: { value: string } | null;
  label?: { value: string } | null;
  text?: { value: string } | null;
  refs?: { target: string }[];
  children?: Item[];
}

function flat(items: Item[]): string[] {
  const out: string[] = [];

  const walk = (item: Item, depth: number): void => {
    const parts = [item.kind, item.label?.value, item.name?.value, item.text?.value, ...(item.refs ?? []).map((ref) => `→${ref.target}`)].filter((part) => part !== undefined && part !== null);
    out.push(`${"  ".repeat(depth)}${parts.join(" ")}`);

    for (const child of item.children ?? []) walk(child, depth + 1);
  };

  for (const item of items) walk(item, 0);

  return out;
}

test("# system: components in zones, relations, tables with columns, sequences and interview lines parse into their kinds", (t) => {
  const dir = tempDir(t, "keylang-system-");
  writeTree(dir, { "keylang/system/shortener.md": SYSTEM });
  const r = keylang(dir, ["parse", "--json", "keylang/system/shortener.md"]);
  assert.equal(r.status, 0, r.stderr);
  // SAFETY: `parse --json` prints an array of documents in the IR's JSON form (src/ir.ts).
  const [doc] = JSON.parse(r.stdout) as { sections: { kind: string; name: { value: string }; items: (Item & { type: string })[] }[]; diagnostics: unknown[] }[];
  assert.deepEqual(doc!.diagnostics, []);
  const section = doc!.sections[0]!;
  assert.equal(section.kind, "system");
  assert.equal(section.name.value, "shortener");
  assert.deepEqual(flat(section.items.filter((item) => item.type === "node")), [
    "requirement короткий URL веде на довгий",
    "estimate 100M URL/міс ≈ 40 записів/с",
    "question аналітика в реальному часі",
    "component client web браузер",
    "zone private AWS VPC",
    "  component service api Node.js",
    "    code →app.links",
    "    relation reads db SELECT",
    "    relation publishes clicks async",
    "    scale ×3",
    "  component db db postgres",
    "    table urls",
    "      column id bigint",
    "      column owner_id bigint",
    "      index code",
    "  component queue clicks kafka",
    "sequence redirect",
    "  message api client GET /abc",
    "  message clicks api click",
  ]);
});

test("# system: a name is required, a table goes under a data store, a column flag and a message are checked", (t) => {
  const dir = tempDir(t, "keylang-system-");
  writeTree(dir, {
    "keylang/a.md": "# system\n",
    "keylang/b.md": "# system shop\n\n- fn x\n- queue q kafka\n  - table t\n- db d\n  - table t\n    - id int key\n    - ref int fk users\n- sequence s\n  - a b\n- service\n",
  });
  const r = keylang(dir, ["check", "keylang/a.md", "keylang/b.md"]);
  assert.equal(r.status, 1);
  const lines = r.stdout.split("\n").filter((line) => /K00[345]/.test(line));
  assert.deepEqual(lines, [
    "keylang/a.md:1:1: K005 `# system` needs a name, e.g. `# system shop`",
    "keylang/b.md:3:3: K004 unknown keyword `fn` here; expected one of: client, cdn, dns, lb, gateway, service, worker, function, db, cache, queue, storage, search, warehouse, auth, external, zone, sequence, requirement, nfr, estimate, tradeoff, ?; `fn` goes under `- module` in a map",
    "keylang/b.md:5:5: K005 `table` goes under a data store (db, cache, storage, search, warehouse), not under `queue`",
    "keylang/b.md:8:14: K005 unknown column flag `key`; expected one of: pk, unique, null, fk",
    "keylang/b.md:9:18: K005 expected `fk <table>.<column>`",
    "keylang/b.md:11:3: K005 expected a message `<from> → <to> [text]`",
    "keylang/b.md:12:1: K005 `service` needs a name",
  ]);
});

test("# system: fmt keeps the section as written and is idempotent", (t) => {
  const dir = tempDir(t, "keylang-system-");
  const messy = SYSTEM.replace("- client web браузер", "-   client   web   браузер").replace("  - client → api GET /abc", "  - client →   api  GET /abc");
  writeTree(dir, { "keylang/system/shortener.md": messy });
  assert.equal(keylang(dir, ["fmt", "keylang/system/shortener.md"]).status, 0);
  const once = readFileSync(join(dir, "keylang/system/shortener.md"), "utf8");
  assert.equal(once, SYSTEM);
  assert.equal(keylang(dir, ["fmt", "--check", "keylang/system/shortener.md"]).status, 0);
});
