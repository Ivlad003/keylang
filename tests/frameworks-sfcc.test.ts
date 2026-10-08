// Salesforce Commerce Cloud (business-flows/30): SFRA cartridges through the
// real CLI. Two cartridges override the same script (`app_custom` before
// `app_storefront_base`); `*/cartridge` resolves along the cartridge path,
// `~/cartridge` to the requiring file's own cartridge, `module.superModule`
// to the next cartridge, `dw/…` to the platform; controllers, hooks.json and
// steptypes.json give entry points; a deny between two cartridges' layers
// sees the dependency a `*/cartridge` require makes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { AnalysisSnapshot } from "../src/snapshot.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const BASE = "cartridges/app_storefront_base/cartridge";
const CUSTOM = "cartridges/app_custom/cartridge";

function config(sfcc: unknown): string {
  const layers = { custom: ["cartridges/app_custom/**"], base: ["cartridges/app_storefront_base/**"], modules: ["cartridges/modules/**"] };
  return JSON.stringify({ languages: ["javascript"], module: "file", layers, ...(sfcc === undefined ? {} : { sfcc }) });
}

const REPO: Record<string, string> = {
  "keylang.json": config({ cartridgePath: ["app_custom", "app_storefront_base"] }),
  "keylang/rules.md": "# rules\n\n- deny base custom\n",
  "cartridges/modules/server.js": "'use strict';\nfunction exportsOf() {\n  return {};\n}\nmodule.exports = { exports: exportsOf };\n",
  [`${BASE}/scripts/util/collections.js`]: "'use strict';\nfunction size(list) {\n  return list.length;\n}\nmodule.exports = { size: size };\n",
  [`${BASE}/scripts/helpers/cartHelpers.js`]: [
    "'use strict';",
    "var collections = require('*/cartridge/scripts/util/collections');",
    "function addToCart(basket, pid) {",
    "  return collections.size(basket) + pid;",
    "}",
    "module.exports = { addToCart: addToCart };",
    "",
  ].join("\n"),
  [`${BASE}/scripts/own.js`]: "'use strict';\nfunction log(x) {\n  return x;\n}\nmodule.exports = { log: log };\n",
  [`${BASE}/controllers/Cart.js`]: [
    "'use strict';",
    "var server = require('server');",
    "var cartHelpers = require('*/cartridge/scripts/helpers/cartHelpers');",
    "var own = require('~/cartridge/scripts/own');",
    "function show(req, res, next) {",
    "  own.log(1);",
    "  next();",
    "}",
    "server.get('Show', server.middleware, show);",
    "server.post('AddProduct', function (req, res, next) {",
    "  cartHelpers.addToCart(null, 1);",
    "  next();",
    "});",
    "server.get('MiniCart', cartHelpers.addToCart);",
    "module.exports = server.exports();",
    "",
  ].join("\n"),
  [`${BASE}/scripts/hooks/cart/calculate.js`]: "'use strict';\nfunction calculate(basket) {\n  return basket;\n}\nmodule.exports = { calculate: calculate };\n",
  "cartridges/app_storefront_base/package.json": JSON.stringify({ hooks: "./cartridge/scripts/hooks.json" }),
  [`${BASE}/scripts/hooks.json`]: JSON.stringify({ hooks: [{ name: "dw.order.calculate", script: "./cartridge/scripts/hooks/cart/calculate" }, { name: "app.missing", script: "./cartridge/scripts/hooks/nope" }] }, null, 2),
  [`${CUSTOM}/scripts/helpers/cartHelpers.js`]: [
    "'use strict';",
    "var base = module.superModule;",
    "var Logger = require('dw/system/Logger');",
    "var own = require('~/cartridge/scripts/own');",
    "function addToCart(basket, pid) {",
    "  Logger.info('add');",
    "  own.log(pid);",
    "  return base.addToCart(basket, pid);",
    "}",
    "module.exports = { addToCart: addToCart };",
    "",
  ].join("\n"),
  [`${CUSTOM}/scripts/own.js`]: "'use strict';\nfunction log(x) {\n  return x;\n}\nmodule.exports = { log: log };\n",
  [`${CUSTOM}/controllers/Cart.js`]: ["'use strict';", "var server = require('server');", "server.extend(module.superModule);", "server.append('Show', function (req, res, next) {", "  next();", "});", "module.exports = server.exports();", ""].join("\n"),
  [`${CUSTOM}/scripts/jobs/clean.js`]: "'use strict';\nfunction execute() {\n  return 0;\n}\nmodule.exports = { execute: execute };\n",
  "cartridges/app_custom/steptypes.json": JSON.stringify({ "step-types": { "script-module-step": [{ "@type-id": "custom.CleanBaskets", module: "app_custom/cartridge/scripts/jobs/clean.js", function: "execute" }] } }, null, 2),
};

function snapshotOf(dir: string): AnalysisSnapshot {
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as AnalysisSnapshot;
}

/** `source → target` of the resolved import edges whose text has `needle`. */
function imports(snapshot: AnalysisSnapshot, needle: string): string[] {
  return snapshot.edges.filter((e) => e.kind === "import" && e.text.includes(needle)).map((e) => `${e.source} -> ${e.target ?? "?"}`).sort();
}

test("sfcc: */cartridge follows the configured cartridge path, ~/cartridge stays in its cartridge, superModule goes to the next, dw/ is the platform", (t) => {
  const dir = tempDir(t, "keylang-sfcc-");
  writeTree(dir, REPO);
  const snapshot = snapshotOf(dir);
  // `app_custom` comes first: the base controller's `*/cartridge` require reaches the override.
  assert.deepEqual(imports(snapshot, "*/cartridge/scripts/helpers/cartHelpers"), ["base.cartridge.controllers.Cart -> custom.cartridge.scripts.helpers.cartHelpers"]);
  // Only the base cartridge has `collections`: the path goes on to it.
  assert.deepEqual(imports(snapshot, "*/cartridge/scripts/util/collections"), ["base.cartridge.scripts.helpers.cartHelpers -> base.cartridge.scripts.util.collections"]);
  // `~/cartridge` is the requiring file's own cartridge, whatever the path says.
  assert.deepEqual(imports(snapshot, "~/cartridge/scripts/own"), ["base.cartridge.controllers.Cart -> base.cartridge.scripts.own", "custom.cartridge.scripts.helpers.cartHelpers -> custom.cartridge.scripts.own"]);
  // `module.superModule`: the same path in the next cartridge, an import edge like `require`.
  assert.deepEqual(imports(snapshot, "module.superModule"), ["custom.cartridge.controllers.Cart -> base.cartridge.controllers.Cart", "custom.cartridge.scripts.helpers.cartHelpers -> base.cartridge.scripts.helpers.cartHelpers"]);
  // The override's call through `base` reaches the base cartridge's fn.
  const call = snapshot.edges.find((e) => e.kind === "call" && e.text.includes("base.addToCart"));
  assert.equal(call?.target, "base.cartridge.scripts.helpers.cartHelpers.addToCart");
  // `dw/…` is the platform API: an external package, not a hole; `require('server')` is the modules folder.
  assert.deepEqual(imports(snapshot, "dw/system/Logger"), ["custom.cartridge.scripts.helpers.cartHelpers -> external.dw"]);
  assert.deepEqual([...new Set(imports(snapshot, "require('server')").map((edge) => edge.split(" -> ")[1]))], ["modules.server"]);
  assert.deepEqual(snapshot.coverage.filter((c) => c.kind === "unresolved-import"), []);
});

test("sfcc: controllers, hooks.json and steptypes.json are entry points", (t) => {
  const dir = tempDir(t, "keylang-sfcc-entries-");
  writeTree(dir, REPO);
  const snapshot = snapshotOf(dir);
  const rows = snapshot.entries.map((e) => [e.kind, e.label, e.id, `${e.file}:${e.line}`, e.framework, e.method ?? "", e.note ?? ""].join(" | "));
  assert.deepEqual(rows, [
    "cron | custom.CleanBaskets | custom.cartridge.scripts.jobs.clean.execute | cartridges/app_custom/cartridge/scripts/jobs/clean.js:2 | sfcc |  | ",
    "observer | dw.order.calculate | base.cartridge.scripts.hooks.cart.calculate.calculate | cartridges/app_storefront_base/cartridge/scripts/hooks/cart/calculate.js:2 | sfcc |  | ",
    "route | Cart-AddProduct | base.cartridge.controllers.Cart | cartridges/app_storefront_base/cartridge/controllers/Cart.js:10 | sfcc | POST | handler written in place: the controller module stands for it",
    "route | Cart-MiniCart | custom.cartridge.scripts.helpers.cartHelpers.addToCart | cartridges/app_custom/cartridge/scripts/helpers/cartHelpers.js:5 | sfcc | GET | ",
    "route | Cart-Show | base.cartridge.controllers.Cart.show | cartridges/app_storefront_base/cartridge/controllers/Cart.js:5 | sfcc | GET | ",
    "route | Cart-Show | custom.cartridge.controllers.Cart | cartridges/app_custom/cartridge/controllers/Cart.js:4 | sfcc |  | server.append: changes the route a cartridge further down the path declares; handler written in place: the controller module stands for it",
  ]);
  // A hook whose script is missing is a hole of hooks.json, not an entry.
  assert.ok(snapshot.coverage.some((c) => c.file === `${BASE}/scripts/hooks.json` && /hook `app\.missing`/.test(c.reason)));
  const listed = keylang(dir, ["entries", "--kind", "observer"]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /observer\s+dw\.order\.calculate\s+base\.cartridge\.scripts\.hooks\.cart\.calculate\.calculate/);
});

test("sfcc: a deny between two cartridges' layers sees the */cartridge require (K102)", (t) => {
  const dir = tempDir(t, "keylang-sfcc-deny-");
  writeTree(dir, REPO);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const checked = keylang(dir, ["check"]);
  assert.equal(checked.status, 1, checked.stdout + checked.stderr);
  assert.match(checked.stdout, /cartridges\/app_storefront_base\/cartridge\/controllers\/Cart\.js:3:\d+: K102 divergence: `base\.cartridge\.controllers\.Cart` depends on `custom\.cartridge\.scripts\.helpers\.cartHelpers`/);
  // The other order: the base cartridge answers its own require, and the deny holds.
  writeTree(dir, { "keylang.json": config({ cartridgePath: ["app_storefront_base", "app_custom"] }) });
  const snapshot = snapshotOf(dir);
  assert.deepEqual(imports(snapshot, "*/cartridge/scripts/helpers/cartHelpers"), ["base.cartridge.controllers.Cart -> base.cartridge.scripts.helpers.cartHelpers"]);
  // `module.superModule` of the base cartridge, now first, is the custom one's; the custom cartridge, now last, has none.
  assert.ok(snapshot.coverage.some((c) => c.kind === "unresolved-import" && c.text.includes("module.superModule") && c.file.startsWith("cartridges/app_custom/")));
});

test("sfcc: without a configured path dw.json gives the order, else a guess is a coverage note", (t) => {
  const dir = tempDir(t, "keylang-sfcc-guess-");
  writeTree(dir, { ...REPO, "keylang.json": config(undefined) });
  const guessed = snapshotOf(dir);
  // By name `app_custom` sorts first, so the edge is the same — but nothing the repository writes said so.
  assert.deepEqual(imports(guessed, "*/cartridge/scripts/helpers/cartHelpers"), ["base.cartridge.controllers.Cart -> custom.cartridge.scripts.helpers.cartHelpers"]);
  const notes = guessed.coverage.filter((c) => c.reason.startsWith("cartridge path guessed"));
  assert.deepEqual(notes.map((c) => `${c.file}:${c.line} ${c.text.includes("module.superModule") ? "superModule" : "*/"}`).sort(), [
    "cartridges/app_custom/cartridge/controllers/Cart.js:3 superModule",
    "cartridges/app_custom/cartridge/scripts/helpers/cartHelpers.js:2 superModule",
    "cartridges/app_storefront_base/cartridge/controllers/Cart.js:3 */",
  ]);
  // The single-answer `collections` require needs no order: no note.
  assert.ok(!notes.some((c) => c.text.includes("collections")));
  writeTree(dir, { "dw.json": JSON.stringify({ hostname: "x", "code-version": "v1", cartridgePath: "app_storefront_base:app_custom" }) });
  const hinted = snapshotOf(dir);
  assert.notEqual(hinted.snapshotId, guessed.snapshotId);
  assert.deepEqual(imports(hinted, "*/cartridge/scripts/helpers/cartHelpers"), ["base.cartridge.controllers.Cart -> base.cartridge.scripts.helpers.cartHelpers"]);
  assert.deepEqual(hinted.coverage.filter((c) => c.reason.startsWith("cartridge path guessed")), []);
});

test("sfcc: keylang.json rejects a cartridge path that is no list of names", (t) => {
  const dir = tempDir(t, "keylang-sfcc-config-");
  writeTree(dir, { ...REPO, "keylang.json": config({ cartridgePath: "app_custom:app_storefront_base" }) });
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /`sfcc\.cartridgePath` must be an array of cartridge names/);
});

test("sfcc: `frameworks` without sfcc turns off the cartridge path and the entries; the config files are in manifest.frameworks", (t) => {
  const dir = tempDir(t, "keylang-sfcc-off-");
  writeTree(dir, REPO);
  const on = snapshotOf(dir);
  assert.deepEqual(on.manifest.frameworks?.map((f) => [f.name, f.files.map((file) => file.path)]), [
    ["sfcc", ["cartridges/app_custom/steptypes.json", "cartridges/app_storefront_base/cartridge/scripts/hooks.json", "cartridges/app_storefront_base/package.json"]],
  ]);
  writeTree(dir, { "keylang.json": JSON.stringify({ ...(JSON.parse(config({ cartridgePath: ["app_custom", "app_storefront_base"] })) as object), frameworks: [] }) });
  const off = snapshotOf(dir);
  assert.deepEqual(off.entries.filter((e) => e.framework === "sfcc"), []);
  assert.ok(off.coverage.some((c) => c.kind === "unresolved-import" && c.text.includes("*/cartridge/scripts/helpers/cartHelpers")));
});
