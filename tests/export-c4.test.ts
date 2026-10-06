// `keylang export c4` (.scratch/c4-zoom/issues/12): C4 diagrams of the map —
// layers as boundaries, their modules as components, packages as external
// systems — in C4-PlantUML and Mermaid, printed or written to a file of their
// own. Through the real CLI on a repository of three layers.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { exportTargetProblem } from "../src/operations.ts";
import { isGeneratedText } from "../src/safe-write.ts";
import { App } from "../src/tui/app.ts";
import { KEY } from "./tui-fixture.ts";
import { VirtualTerminal } from "./vt.ts";

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");

const SHOP: Record<string, string> = {
  "keylang.json": `${JSON.stringify({ languages: ["typescript"], module: "file", layers: { app: ["src/app/**"], domain: ["src/domain/**"], infra: ["src/infra/**"] } })}\n`,
  "package.json": `${JSON.stringify({ name: "shop", version: "1.0.0" })}\n`,
  "README.md": "# Shop\n\nShop sells things to people online. It keeps orders and payments apart.\n",
  "src/app/README.md": "# app\n\nThe entry points that people call, one per use case.\n",
  "src/app/shop.ts": [
    "/** The shop's entry point: buying a cart. */",
    "",
    'import { create, total } from "../domain/order.ts";',
    'import { save } from "../infra/store.ts";',
    "",
    "export function buy(prices: number[]): number {",
    "  create();",
    "  save();",
    "  return total(prices);",
    "}",
    "",
  ].join("\n"),
  "src/domain/order.ts": "export function create(): void {}\n\nexport function total(prices: number[]): number {\n  return prices.reduce((sum, price) => sum + price, 0);\n}\n",
  "src/infra/store.ts": 'import { writeFileSync } from "node:fs";\nimport { create } from "../domain/order.ts";\n\nexport function save(): void {\n  create();\n  writeFileSync("orders.json", "[]");\n}\n',
};

const COMPONENTS = `' keylang:generated — keylang export c4
@startuml
!include <C4/C4_Component>
title shop — components

Container_Boundary(n_app, "app", $descr="The entry points that people call, one per use case.") {
  Component(n_app_shop, "shop", "src/app/shop.ts", "The shop's entry point: buying a cart.")
}
Container_Boundary(n_domain, "domain") {
  Component(n_domain_order, "order", "src/domain/order.ts", "")
}
Container_Boundary(n_infra, "infra") {
  Component(n_infra_store, "store", "src/infra/store.ts", "")
}
System_Ext(n_external_node, "node", "package")

Rel(n_app_shop, n_domain_order, "call ×2, import ×1")
Rel(n_app_shop, n_infra_store, "call ×1, import ×1")
Rel(n_infra_store, n_domain_order, "call ×1, import ×1")
Rel(n_infra_store, n_external_node, "import ×1")
' 1 edge(s) keylang did not resolve are not drawn
@enduml
`;

function keylang(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function repo(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-c4-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(SHOP)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

test("export c4: the component level is byte for byte the layers as boundaries, their modules, the packages and the relations across layers; again the same bytes", (t) => {
  const dir = repo(t);
  const first = keylang(dir, ["export", "c4"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, COMPONENTS);
  assert.equal(first.stderr, "");
  const again = keylang(dir, ["export", "c4", "--format", "plantuml", "--level", "component"]);
  assert.equal(again.stdout, first.stdout);
});

test("export c4 --level container: the repository is one container in its system, the packages are external systems; no layer is a container", (t) => {
  const dir = repo(t);
  const r = keylang(dir, ["export", "c4", "--level", "container"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    `' keylang:generated — keylang export c4
@startuml
!include <C4/C4_Container>
title shop — containers

System_Boundary(n__boundary, "shop") {
  Container(n__system, "shop", "typescript", "Shop sells things to people online. It keeps orders and payments apart.")
}
System_Ext(n_external_node, "node", "package")

Rel(n__system, n_external_node, "import ×1")
' 1 edge(s) keylang did not resolve are not drawn
@enduml
`,
  );
  assert.equal(r.stdout.match(/^\s*Container\(/gm)?.length, 1);
  assert.doesNotMatch(r.stdout, /Container_Boundary|Component/);
});

test("export c4 --layer: the components of that layer and, as Component_Ext, the modules of other layers they touch; an unknown layer is 2 with the layers", (t) => {
  const dir = repo(t);
  const r = keylang(dir, ["export", "c4", "--layer", "domain"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    `' keylang:generated — keylang export c4
@startuml
!include <C4/C4_Component>
title shop — components of domain

Container_Boundary(n_domain, "domain") {
  Component(n_domain_order, "order", "src/domain/order.ts", "")
}
Component_Ext(n_app_shop, "app.shop", "src/app/shop.ts", "The shop's entry point: buying a cart.")
Component_Ext(n_infra_store, "infra.store", "src/infra/store.ts", "")

Rel(n_app_shop, n_domain_order, "call ×2, import ×1")
Rel(n_infra_store, n_domain_order, "call ×1, import ×1")
' 1 edge(s) keylang did not resolve are not drawn
@enduml
`,
  );
  const unknown = keylang(dir, ["export", "c4", "--layer", "nope"]);
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stdout, "");
  assert.equal(unknown.stderr, "keylang: export c4: no layer `nope`; layers: app, domain, infra\n");
  const container = keylang(dir, ["export", "c4", "--level", "container", "--layer", "domain"]);
  assert.equal(container.status, 2);
  assert.match(container.stderr, /--layer draws the components of one layer: use it with --level component/);
  for (const [option, value, expected] of [["--format", "svg", "plantuml, mermaid"], ["--level", "code", "component, container"]] as const) {
    const bad = keylang(dir, ["export", "c4", option, value]);
    assert.equal(bad.status, 2);
    assert.equal(bad.stderr, `keylang: export c4: unknown ${option} \`${value}\`; expected ${expected}\n`);
  }
  assert.equal(keylang(dir, ["export", "dot"]).status, 2);
});

test("export c4 --format mermaid: C4Component with a note that Mermaid's C4 is experimental; the layer's brief is a comment", (t) => {
  const dir = repo(t);
  const r = keylang(dir, ["export", "c4", "--format", "mermaid"]);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n");
  assert.deepEqual(lines.slice(0, 4), ["%% keylang:generated — keylang export c4", "%% Mermaid C4 is experimental: https://mermaid.js.org/syntax/c4.html", "C4Component", "title shop — components"]);
  assert.ok(lines.includes("%% app: The entry points that people call, one per use case."), r.stdout);
  assert.ok(lines.includes('Container_Boundary(n_app, "app") {'), r.stdout);
  assert.ok(lines.includes('Rel(n_app_shop, n_domain_order, "call ×2, import ×1")'), r.stdout);
  assert.equal(lines.at(-2), "%% 1 edge(s) keylang did not resolve are not drawn");
  assert.doesNotMatch(r.stdout, /@startuml|!include/);
  assert.match(keylang(dir, ["export", "c4", "--format", "mermaid", "--level", "container"]).stdout, /^%% Mermaid C4 is experimental.*\nC4Container\n/m);
});

test("export c4 --out writes a new file or one it wrote, with stdout empty; a file of anyone else is 2 and stays as it was", (t) => {
  const dir = repo(t);
  const written = keylang(dir, ["export", "c4", "--out", "docs/c4.puml"]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(written.stdout, "");
  assert.equal(written.stderr, "docs/c4.puml: written\n");
  assert.equal(readFileSync(join(dir, "docs/c4.puml"), "utf8"), COMPONENTS);
  // Its own diagram, in either format, is replaced.
  const mermaid = keylang(dir, ["export", "c4", "--out", "docs/c4.puml", "--format", "mermaid"]);
  assert.equal(mermaid.status, 0, mermaid.stderr);
  assert.match(readFileSync(join(dir, "docs/c4.puml"), "utf8"), /^%% keylang:generated — keylang export c4\n/);
  assert.equal(keylang(dir, ["export", "c4", "--out", "docs/c4.puml"]).status, 0);
  assert.equal(readFileSync(join(dir, "docs/c4.puml"), "utf8"), COMPONENTS);

  // A diagram a person wrote, and a file another generator wrote, are not this command's to replace.
  for (const [path, text] of [["docs/manual.puml", "@startuml\nBob -> Alice\n@enduml\n"], ["keylang/map/app.md", "<!-- keylang:generated by keylang map -->\n# map app\n"]] as const) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), text);
    const refused = keylang(dir, ["export", "c4", "--out", path]);
    assert.equal(refused.status, 2, path);
    assert.equal(refused.stdout, "");
    assert.equal(refused.stderr, `keylang: ${path}: not a diagram \`keylang export c4\` wrote (no keylang:generated marker on its first line); nothing written\n`);
    assert.equal(readFileSync(join(dir, path), "utf8"), text);
  }
  // A path out of the repository is refused by the file protocol.
  const out = keylang(dir, ["export", "c4", "--out", "../c4.puml"]);
  assert.equal(out.status, 2);
  assert.match(out.stderr, /not a plain relative path/);
});

test("export c4: the help names the command; every writer of the file protocol knows a diagram's marker as generated", (t) => {
  const dir = repo(t);
  const help = keylang(dir, ["--help"]);
  assert.match(help.stdout, /^ {2}export c4 \[--format plantuml\|mermaid\] \[--level component\|container\] \[--layer <name>\] \[--out f\]$/m);
  // The completions come from the help: the subcommand with a digit and the new flag too.
  const bash = keylang(dir, ["completions", "bash"]).stdout;
  assert.match(bash, /^ {6}export\) words="c4" ;;$/m);
  assert.match(bash, /--level/);
  // Every other writer refuses a generated file: the diagrams' PlantUML and Mermaid comments are markers too.
  assert.equal(keylang(dir, ["export", "c4", "--out", "docs/c4.puml"]).status, 0);
  assert.equal(exportTargetProblem(dir, "docs/c4.puml"), "a generated file: only its generator writes it", "the report export of F6 does not write over it");
  assert.equal(isGeneratedText(COMPONENTS), true);
  assert.equal(isGeneratedText("\n%% keylang:generated — keylang export c4\nC4Component\n"), true);
  assert.equal(isGeneratedText("' a note\n' keylang:generated\n"), false, "only the first non-empty line counts");
  assert.equal(isGeneratedText("@startuml\n' keylang:generated\n@enduml\n"), false);
});

test("tui: the palette's Export C4 diagram shows the diagram in F6 without a file, and writes the typed file as the CLI does", async (t) => {
  const dir = repo(t);
  const vt = new VirtualTerminal(130, 34);
  const app = new App({ root: dir, cols: 130, rows: 34 });
  app.attach({ write: (ansi) => vt.feed(ansi) }, 130, 34);
  t.after(() => app.close());
  const send = (keys: string): void => app.input(keys);
  await app.idle();
  const palette = (): void => {
    send(KEY.ctrlP);
    for (const ch of "export c4 diagram") send(ch);
    send(KEY.enter);
  };
  palette();
  assert.equal(app.state.prompt?.kind, "export-c4");
  assert.match(vt.text(), /Run export c4 --format plantuml --level component/);
  assert.match(vt.text(), /no file: the diagram shows in F6 and nothing is written/);
  // ←→ on the layer row go through the layers of the configuration.
  send(KEY.up);
  send(KEY.up);
  send(KEY.right);
  send(KEY.right);
  assert.match(vt.text(), /Run export c4 --format plantuml --level component --layer domain/);
  send(KEY.enter);
  await app.idle();
  const shown = app.state.records.at(-1)!;
  assert.equal(shown.result?.exitCode, 0, JSON.stringify(shown.result?.messages));
  assert.equal(shown.result?.kind === "export-c4" ? shown.result.payload?.text : null, keylang(dir, ["export", "c4", "--layer", "domain"]).stdout);
  send(KEY.f6);
  assert.match(vt.text(), /C4 diagram · plantuml · component · layer domain · shown here, nothing written/);
  assert.match(vt.text(), /Component_Ext\(n_app_shop, "app\.shop"/);
  send("\x1b");
  await sleep(40);

  // A file typed: written as `--out` writes it; the CLI's twin gives the same bytes.
  palette();
  for (const ch of "docs/shop.puml") send(ch);
  assert.match(vt.text(), /docs\/shop\.puml: a new file, written on Enter/);
  send(KEY.enter);
  await app.idle();
  assert.equal(app.state.records.at(-1)?.result?.exitCode, 0);
  assert.equal(readFileSync(join(dir, "docs/shop.puml"), "utf8"), COMPONENTS);
  assert.match(app.state.message ?? "", /written docs\/shop\.puml · code 0/);
});

test("tui: the C4 form runs the write policy on the typed file before reading it: a link out or a path outside is refused unread", { skip: process.platform === "win32" }, async (t) => {
  const dir = repo(t);
  const outside = mkdtempSync(join(tmpdir(), "keylang-c4-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  // A diagram this command wrote, but outside the repository: only reading it would call it replaceable.
  writeFileSync(join(outside, "c4.puml"), COMPONENTS);
  mkdirSync(join(dir, "docs"), { recursive: true });
  symlinkSync(join(outside, "c4.puml"), join(dir, "docs/linked.puml"));
  const vt = new VirtualTerminal(160, 34);
  const app = new App({ root: dir, cols: 160, rows: 34 });
  app.attach({ write: (ansi) => vt.feed(ansi) }, 160, 34);
  t.after(() => app.close());
  await app.idle();
  const form = (out: string): string => {
    app.input(KEY.ctrlP);
    for (const ch of "export c4 diagram") app.input(ch);
    app.input(KEY.enter);
    for (const ch of out) app.input(ch);
    const note = app.state.prompt?.note ?? "";
    app.input("\x1b");
    return note;
  };
  for (const out of ["docs/linked.puml", join(outside, "c4.puml")]) {
    const cli = keylang(dir, ["export", "c4", "--out", out]);
    assert.equal(cli.status, 2);
    // The form's note is the CLI's refusal, word for word.
    assert.equal(`keylang: ${form(out)}\n`, cli.stderr, out);
    await sleep(40);
  }
  assert.match(form("docs/linked.puml"), /leads out of the repository through a link; nothing written$/);
  await sleep(40);
  assert.equal(readFileSync(join(outside, "c4.puml"), "utf8"), COMPONENTS);
});
