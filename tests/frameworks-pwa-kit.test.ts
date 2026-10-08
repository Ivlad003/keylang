// The PWA Kit adapter (business-flows/39, ADR 0022) through the real CLI on
// a Composable Storefront project with template extensibility: the
// `package.json` extends `@salesforce/retail-react-app` with the overrides in
// `overrides/`. An import of the base template's `app/…` is the override when
// the project has one, else the base package; `^…` is the base package
// always; `routes.jsx` and `ssr.js` give entry points.

import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { AnalysisSnapshot } from "../src/snapshot.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const BASE = "@salesforce/retail-react-app";

const CONFIG = {
  languages: ["javascript"],
  layers: { pages: ["overrides/app/pages/**"], components: ["overrides/app/components/**"], app: ["overrides/app/*.js", "overrides/app/*.jsx"] },
};

const MANIFEST = {
  name: "storefront",
  private: true,
  dependencies: { "@loadable/component": "^5.15.0", "@salesforce/pwa-kit-runtime": "3.0.0", [BASE]: "3.0.0", react: "^18.2.0" },
  ccExtensibility: { extends: BASE, overridesDir: "overrides" },
};

const REPO: Record<string, string> = {
  "keylang.json": `${JSON.stringify(CONFIG, null, 2)}\n`,
  "package.json": `${JSON.stringify(MANIFEST, null, 2)}\n`,
  "keylang/flows.md": [
    "# flow home",
    "",
    "- trigger pages.home.Home",
    "  - step components.header.Header",
    "",
  ].join("\n"),
  "overrides/app/components/header/index.jsx": [
    "import React from \"react\";",
    "import BaseHeader from \"^@salesforce/retail-react-app/app/components/header\";",
    "",
    "export default function Header(props) {",
    "  return <BaseHeader {...props} />;",
    "}",
    "",
  ].join("\n"),
  "overrides/app/pages/cart/index.jsx": [
    "import React from \"react\";",
    "",
    "const Cart = () => <div>cart</div>;",
    "",
    "export default Cart;",
    "",
  ].join("\n"),
  "overrides/app/pages/home/index.jsx": [
    "import React from \"react\";",
    "import Header from \"@salesforce/retail-react-app/app/components/header\";",
    "",
    "export default function Home() {",
    "  return <Header title=\"home\" />;",
    "}",
    "",
  ].join("\n"),
  "overrides/app/routes.jsx": [
    "import React from \"react\";",
    "import loadable from \"@loadable/component\";",
    "import { routes as baseRoutes } from \"^@salesforce/retail-react-app/app/routes\";",
    "import Account from \"@salesforce/retail-react-app/app/pages/account\";",
    "import Home from \"./pages/home\";",
    "",
    "const Cart = loadable(() => import(\"./pages/cart\"));",
    "",
    "export const routes = [",
    "  { path: \"/\", component: Home, exact: true },",
    "  { path: \"/cart\", component: Cart },",
    "  { path: \"/account\", component: Account },",
    "  ...baseRoutes,",
    "];",
    "",
    "export default () => routes;",
    "",
  ].join("\n"),
  "overrides/app/ssr.js": [
    "\"use strict\";",
    "",
    "import { getRuntime } from \"@salesforce/pwa-kit-runtime/ssr/server/express\";",
    "",
    "const options = { buildDir: \"build\", defaultCacheTimeSeconds: 600 };",
    "",
    "const runtime = getRuntime();",
    "",
    "const { handler } = runtime.createHandler(options, (app) => {",
    "  app.get(\"*\", runtime.render);",
    "});",
    "",
    "export const get = handler;",
    "",
  ].join("\n"),
};

function storefront(t: TestContext, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-pwa-");
  writeTree(dir, { ...REPO, ...extra });
  return dir;
}

function snapshotOf(dir: string): AnalysisSnapshot {
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as AnalysisSnapshot;
}

/** `source → target` of the import edges whose text has `needle`. */
function imports(snapshot: AnalysisSnapshot, needle: string): string[] {
  return snapshot.edges.filter((e) => e.kind === "import" && e.text.includes(needle)).map((e) => `${e.source} -> ${e.target ?? "?"}`);
}

function setConfig(dir: string, change: (raw: Record<string, unknown>) => void): void {
  const raw = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as Record<string, unknown>;
  change(raw);
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify(raw, null, 2)}\n`);
}

/** `file:line:col id → verdict` of every `static` verdict `check` prints. */
function verdicts(stdout: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of stdout.matchAll(/^(\S+:\d+:\d+): static (ok|fail|unverified) (\S+?):/gm)) out.set(`${m[1]} ${m[3]}`, m[2]!);
  return out;
}

test("pwa-kit: the overrides directory wins over the base template; `^` is the base package; a path without an override is the base package", (t) => {
  const dir = storefront(t);
  const snapshot = snapshotOf(dir);
  assert.deepEqual(snapshot.manifest.frameworks?.map((f) => [f.name, f.files.map((file) => file.path)]), [["pwa-kit", ["overrides/app/routes.jsx", "overrides/app/ssr.js", "package.json"]]]);
  // `@salesforce/retail-react-app/app/components/header` exists in `overrides/app/components/header/`: the override.
  assert.deepEqual(imports(snapshot, `"${BASE}/app/components/header"`), ["pages.home -> components.header"]);
  // `^` names the base template itself, past the override: the package, not a hole.
  assert.deepEqual(imports(snapshot, `"^${BASE}/app/components/header"`), ["components.header -> external.salesforce-retail-react-app"]);
  assert.deepEqual(snapshot.coverage.filter((c) => c.kind === "unresolved-import"), []);
  // The page calls the override's component: a call edge into the project, not into the package.
  assert.ok(snapshot.edges.some((e) => e.kind === "call" && e.source === "pages.home.Home" && e.target === "components.header.Header"));
  // Without the override file the same import is the base package: the overrides directory is read, not guessed.
  rmSync(join(dir, "overrides/app/components/header/index.jsx"));
  const without = snapshotOf(dir);
  assert.deepEqual(imports(without, `"${BASE}/app/components/header"`), ["pages.home -> external.salesforce-retail-react-app"]);
  assert.notEqual(without.snapshotId, snapshot.snapshotId);
});

test("pwa-kit: the routes of routes.jsx and the server of ssr.js are entry points", (t) => {
  const dir = storefront(t);
  const snapshot = snapshotOf(dir);
  const rows = snapshot.entries.map((e) => [e.kind, e.label, e.id, `${e.file}:${e.line}`, e.framework, e.method ?? "", e.note ?? ""].join(" | "));
  assert.deepEqual(rows, [
    "route | / | pages.home.Home | overrides/app/pages/home/index.jsx:4 | pwa-kit |  | ",
    `route | /account | app.routes | overrides/app/routes.jsx:12 | pwa-kit |  | component \`Account\` is imported from \`${BASE}/app/pages/account\`, outside the analysis: the routes module stands for it`,
    // `loadable(() => import('./pages/cart'))`: the default export of the module it loads.
    "route | /cart | pages.cart.Cart | overrides/app/pages/cart/index.jsx:3 | pwa-kit |  | ",
    "route | GET * | app.ssr | overrides/app/ssr.js:10 | pwa-kit | GET | `runtime.render`: the PWA Kit runtime renders the app's routes (`routes.jsx`) on the server",
    "route | ssr handler | app.ssr | overrides/app/ssr.js:1 | pwa-kit |  | the exported `get`: the Managed Runtime calls it for every request",
  ]);
});

test("pwa-kit: `deny` sees a dependency only the override resolution makes", (t) => {
  const dir = storefront(t, { "keylang/rules.md": "# rules\n\n- deny pages components\n" });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const r = keylang(dir, ["check"]);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /overrides\/app\/pages\/home\/index\.jsx:2:1: K102 divergence: `pages\.home` depends on `components\.header`, which is denied by `deny pages components`/);
});

test("pwa-kit: `frameworks: []` turns the overrides and the entries off — ok and fail only become unverified (metamorphic)", (t) => {
  const dir = storefront(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const on = verdicts(keylang(dir, ["check"]).stdout);
  assert.equal(on.get("keylang/flows.md:4:3 components.header.Header"), "ok");
  setConfig(dir, (raw) => {
    raw.frameworks = [];
  });
  const off = snapshotOf(dir);
  assert.equal(off.manifest.frameworks, undefined);
  assert.deepEqual(off.entries.filter((e) => e.framework === "pwa-kit"), []);
  assert.deepEqual(imports(off, `"${BASE}/app/components/header"`), ["pages.home -> external.salesforce-retail-react-app"]);
  assert.ok(off.coverage.some((c) => c.kind === "skipped-file" && c.file === "overrides/app/routes.jsx" && c.text === "framework:pwa-kit"));
  const offVerdicts = verdicts(keylang(dir, ["check"]).stdout);
  assert.equal(offVerdicts.size, on.size);
  for (const [key, verdict] of on) {
    const now = offVerdicts.get(key);
    assert.ok(now === verdict || now === "unverified", `${key}: ${verdict} → ${now}`);
  }
  assert.equal(offVerdicts.get("keylang/flows.md:4:3 components.header.Header"), "unverified");
});

test("pwa-kit: `flows discover` drafts the routes' pages; `coverage` names the entries it cannot follow", (t) => {
  const dir = storefront(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const discover = keylang(dir, ["flows", "discover"]);
  assert.equal(discover.status, 0, discover.stderr);
  assert.match(discover.stderr, /no fn to draft from: route \/account \(app\.routes\)/);
  assert.match(readFileSync(join(dir, "keylang/flows-discovered/pages.md"), "utf8"), /entry=route label="\/cart"[^\n]*\n\n- trigger route pages\.cart\.Cart\n/);
  const coverage = keylang(dir, ["coverage"]);
  assert.equal(coverage.status, 0, coverage.stderr);
  assert.match(coverage.stdout, /route\s+GET \*\s+app\.ssr\s+overrides\/app\/ssr\.js:10\s+no flow to discover \(not a fn\)/);
});
