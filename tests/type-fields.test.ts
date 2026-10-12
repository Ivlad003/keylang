// Fields of `planned type` through the real CLI (.scratch/type-fields):
// parsing, `fmt` and parse diagnostics of field lines, `check` of the fields
// against the TypeScript shape in the snapshot (match, mismatch, unknown
// shape), the shape in `.keylang/index.json`, and `keylang types` (stdout,
// flow names, `--out`, `--check`).

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keylang, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";

/** A TypeScript repository with one layer `main` over `src/**`, the given code and specs. */
function repo(t: { after: (fn: () => void) => void }, files: Record<string, string>): string {
  const dir = tempDir(t, "keylang-type-fields-");
  writeTree(dir, { "keylang.json": `${JSON.stringify({ languages: ["typescript"], layers: { main: ["src/**"] } }, null, 2)}\n`, ...files });

  return dir;
}

const ORDERS = [
  "export interface Order {",
  "  id: string;",
  "  total: number;",
  "  note: string;",
  "  extra?: boolean;",
  "  pay(amount: number): void;",
  "  [key: string]: unknown;",
  "}",
  "export type Money = { amount: number; currency?: string };",
  "export enum Status { Open, Closed }",
  "export function place(order: Order): void {}",
  "",
].join("\n");

test("type fields: parse gives field nodes, fmt writes `- name?: type` idempotently, bad lines are K005", (t) => {
  const dir = tempDir(t, "keylang-type-fields-");
  const source = ["# flow checkout", "", "- planned type orders.Order", "  - id:string", "  - total :  Money", "  - note?: string", "  - lines: Map<string,number>", "  - 1st: string", "  - items OrderLine[]", "  - empty:", "- planned type orders.Money = { amount: number }", "  - amount: number", "- planned fn orders.pay (o: Order) → void", "  - x: y", ""].join("\n");
  writeTree(dir, { "f.md": source });

  const parsed = keylang(dir, ["parse", "--json", "f.md"]);
  assert.equal(parsed.status, 1, parsed.stderr);
  const [doc] = JSON.parse(parsed.stdout);
  const order = doc.sections[0].items.find((item: { type: string; id: string }) => item.type === "node" && item.id === "orders.Order");
  const fields = order.children.filter((child: { kind: string }) => child.kind === "field");
  assert.deepEqual(
    fields.map((f: { name: { value: string } | null; label: { value: string } | null; text: { value: string } | null }) => [f.name?.value, f.label?.value ?? null, f.text?.value ?? null]),
    [["id", null, "string"], ["total", null, "Money"], ["note", "?", "string"], ["lines", null, "Map<string, number>"], ["empty", null, null]],
  );
  // The type's span starts after the colon: `id:string` splits one token.
  assert.deepEqual(fields[0].text.span.start, { offset: source.indexOf("string"), line: 4, col: 8 });
  assert.deepEqual(
    doc.diagnostics.map((d: { code: string; reason?: string; span: { start: { line: number; col: number } }; message: string }) => `${d.span.start.line}:${d.span.start.col} ${d.code} ${d.reason ?? ""} ${d.message}`),
    [
      "8:5 K005 field invalid field name `1st`; a field name is an identifier such as `total` or `_id`",
      "9:3 K005 field expected a field `<name>[?]: <type>`, such as `- total: Money` or `- note?: string`",
      "10:3 K005 field field `empty` needs a type, such as `- empty: string`",
      "12:3 K005 arguments a type alias has no fields: `planned type orders.Money = { amount: number }` already gives its shape; remove the fields or the `= …`",
      "14:3 K004  `planned` cannot have nested items",
    ],
  );

  // fmt: one canonical spelling, and a second run changes nothing.
  assert.equal(keylang(dir, ["fmt", "f.md"]).status, 0);
  const formatted = readFileSync(join(dir, "f.md"), "utf8");
  assert.match(formatted, /^ {2}- id: string\n {2}- total: Money\n {2}- note\?: string\n {2}- lines: Map<string, number>\n/m);
  assert.equal(keylang(dir, ["fmt", "--check", "f.md"]).status, 0);
});

test("type fields: check compares them with the code's shape (K201, K202, K002)", (t) => {
  const flow = [
    "# flow checkout",
    "",
    "- planned type main.orders.Order",
    "  - id: string",
    "  - total: Money",
    "  - note?: string",
    "  - lines: Line[]",
    "  - pay: (amount: number)   => void",
    "- planned type main.orders.Money",
    "  - amount: number",
    "  - currency?: string",
    "- planned type main.orders.Status",
    "  - open: number",
    "- planned type main.billing.Invoice",
    "  - id: string",
    "  - id: number",
    "- trigger main.orders.place",
    "",
  ].join("\n");

  const dir = repo(t, { "src/orders.ts": ORDERS, "keylang/flows/checkout.md": flow });
  const o = keylang(dir, ["check"]);
  assert.equal(o.status, 1, o.stdout);
  // A mismatch names the first three differences, in plan order; extra code fields (`extra`) are fine.
  assert.match(o.stdout, /checkout\.md:3:1: K201 planned type `main\.orders\.Order` differs from the code in its fields \(src\/orders\.ts:1\): field total: Money ≠ number; field note is optional in the plan; missing field lines$/m);
  // Every planned field is in the code with its type and optionality: the plan is done.
  assert.match(o.stdout, /checkout\.md:9:1: K202 planned type `main\.orders\.Money` is implemented \(src\/orders\.ts:9\); remove the declaration$/m);
  // An enum has no shape: only the kind is compared, and the hint says the fields were not.
  assert.match(o.stdout, /checkout\.md:12:1: K202 planned type `main\.orders\.Status` is implemented \(src\/orders\.ts:10\); its fields are not checked, the code's shape is unknown; remove the declaration$/m);
  assert.match(o.stdout, /checkout\.md:16:5: K002 duplicate field `id` of `main\.billing\.Invoice` \(first declared at keylang\/flows\/checkout\.md:15:5\)$/m);

  // The code catches up: the K201 becomes K202.
  writeFileSync(join(dir, "src/orders.ts"), ORDERS.replace("  total: number;\n  note: string;", "  total: Money;\n  note?: string;\n  lines: Line[];"));
  const fixed = keylang(dir, ["check"]);
  assert.doesNotMatch(fixed.stdout, /K201/);
  assert.match(fixed.stdout, /K202 planned type `main\.orders\.Order` is implemented \(src\/orders\.ts:1\); remove the declaration$/m);

  // A required plan field that the code makes optional is a difference too.
  writeFileSync(join(dir, "src/orders.ts"), ORDERS.replace("  id: string;", "  id?: string;"));
  assert.match(keylang(dir, ["check"]).stdout, /K201 planned type `main\.orders\.Order` differs from the code in its fields \(src\/orders\.ts:1\): field id is optional in the code; field total/);
});

test("type fields: the snapshot records the shape of interfaces and object aliases, the map does not print it", (t) => {
  const dir = repo(t, { "src/orders.ts": ORDERS });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
  assert.deepEqual(index.nodes["main.orders.Order"].shape, [
    { name: "id", optional: false, type: "string" },
    { name: "total", optional: false, type: "number" },
    { name: "note", optional: false, type: "string" },
    { name: "extra", optional: true, type: "boolean" },
    { name: "pay", optional: false, type: "(amount: number) => void" },
  ]);
  assert.deepEqual(index.nodes["main.orders.Money"].shape, [
    { name: "amount", optional: false, type: "number" },
    { name: "currency", optional: true, type: "string" },
  ]);
  assert.equal("shape" in index.nodes["main.orders.Status"], false);
  const map = readFileSync(join(dir, "keylang/map/main.md"), "utf8");
  // The interface stays one line: its members are in the snapshot only.
  assert.match(map, /^ {4}- type \[Order\]\(\.\.\/\.\.\/src\/orders\.ts#L1\)$/m);
  assert.doesNotMatch(map, /extra|boolean/);
});

const PLAN = [
  "# flow checkout",
  "",
  "- planned type main.billing.Invoice",
  "  - id: string",
  "  - note?: string",
  "- planned type main.billing.Receipt extends Invoice",
  "  - paidAt: Date",
  "- planned type main.billing.Tax = number;",
  "- planned type main.billing.draft-note",
  "- planned fn main.billing.charge (amount: number) → Promise<void>",
  "- planned fn main.billing.refund (id: string)",
  "- planned fn main.billing.audit",
  "- planned type main.orders.Order",
  "  - id: string",
  "- trigger main.orders.place",
  "",
  "# flow ledger",
  "",
  "- planned module main.ledger",
  "- planned fn main.ledger.post (entry: Entry) -> void",
  "- planned fn main.ledger.settle (entry: Entry) => boolean",
  "- planned fn main.ledger.balance (): number",
  "",
].join("\n");

const PROJECTED = [
  "// keylang:generated by `keylang types` from the planned declarations; edit the specs, not this file.",
  "",
  'import type { Order } from "./src/orders.ts";',
  "",
  "/** main.billing — keylang/flows/checkout.md:12 */",
  "export interface Billing {",
  "  audit(...args: unknown[]): unknown;",
  "  charge(amount: number): Promise<void>;",
  "  refund(id: string): unknown;",
  "}",
  "",
  "/** main.billing.Invoice — keylang/flows/checkout.md:3 */",
  "export interface Invoice {",
  "  id: string;",
  "  note?: string;",
  "}",
  "",
  "/** main.billing.Receipt — keylang/flows/checkout.md:6 */",
  "export interface Receipt extends Invoice {",
  "  paidAt: Date;",
  "}",
  "",
  "/** main.billing.Tax — keylang/flows/checkout.md:8 */",
  "export type Tax = number;",
  "",
  "/** main.billing.draft-note — keylang/flows/checkout.md:9 */",
  "export type DraftNote = unknown; // TODO: fields",
  "",
  "/** main.ledger — keylang/flows/checkout.md:19 */",
  "export interface Ledger {",
  "  balance(): number;",
  "  post(entry: Entry): void;",
  "  settle(entry: Entry): boolean;",
  "}",
  "",
].join("\n");

test("keylang types: prints the planned declarations as TypeScript; names narrow them to flows", (t) => {
  const dir = repo(t, { "src/orders.ts": ORDERS, "keylang/flows/checkout.md": PLAN });
  const before = treeBytes(dir);
  const all = keylang(dir, ["types"]);
  assert.equal(all.status, 0, all.stderr);
  assert.equal(all.stdout, PROJECTED);
  assert.equal(all.stderr, "");
  // Byte-stable, and read-only: no map, no fact cache.
  assert.equal(keylang(dir, ["types"]).stdout, PROJECTED);
  assert.deepEqual(treeBytes(dir), before);

  const ledger = keylang(dir, ["types", "ledger"]);
  assert.equal(ledger.status, 0, ledger.stderr);
  assert.equal(ledger.stdout, `${PROJECTED.split("\n\n")[0]}\n\n/** main.ledger — keylang/flows/checkout.md:19 */\nexport interface Ledger {\n  balance(): number;\n  post(entry: Entry): void;\n  settle(entry: Entry): boolean;\n}\n`);

  const unknown = keylang(dir, ["types", "nope"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /types: no flow or feature named `nope`/);
});

test("keylang types --out writes the file, --check compares it and writes nothing", (t) => {
  const dir = repo(t, { "src/orders.ts": ORDERS, "keylang/flows/checkout.md": PLAN });
  const target = join(dir, "gen/types.ts");

  // --check needs a file to compare; a missing one is stale.
  assert.equal(keylang(dir, ["types", "--check"]).status, 2);
  const missing = keylang(dir, ["types", "--out", "gen/types.ts", "--check"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /gen\/types\.ts is missing; run `keylang types --out gen\/types\.ts`/);
  assert.equal(existsSync(target), false);

  // --out: the import path is relative to the file's directory; stdout stays empty.
  const written = keylang(dir, ["types", "--out", "gen/types.ts"]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(written.stdout, "");
  assert.equal(readFileSync(target, "utf8"), PROJECTED.replace('"./src/orders.ts"', '"../src/orders.ts"'));
  assert.equal(keylang(dir, ["types", "--out", "gen/types.ts", "--check"]).status, 0);

  // A plan change makes the file stale; --check reports it and leaves the file as it was.
  writeFileSync(join(dir, "keylang/flows/checkout.md"), PLAN.replace("  - note?: string\n", "  - note?: string\n  - total: number\n"));
  const stale = keylang(dir, ["types", "--out", "gen/types.ts", "--check"]);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /gen\/types\.ts is stale/);
  assert.doesNotMatch(readFileSync(target, "utf8"), /total/);

  // A file someone wrote (no generated header) is not overwritten; a path out of the root is a usage error.
  writeFileSync(join(dir, "mine.ts"), "export type Mine = 1;\n");
  assert.equal(keylang(dir, ["types", "--out", "mine.ts"]).status, 1);
  assert.equal(readFileSync(join(dir, "mine.ts"), "utf8"), "export type Mine = 1;\n");
  assert.equal(keylang(dir, ["types", "--out", "../out.ts"]).status, 2);
});
