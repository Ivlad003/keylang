// The React Router adapter (framework mode, file-system routes) through the
// real CLI: `app/routes.ts` calls `flatRoutes()`, and each module of
// `app/routes/` gives its `loader`/`action` as `route` entries with the URL
// the flat-route file name makes. Salesforce Storefront Next adds the routes
// of `app/extensions/*/routes/`.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { AnalysisSnapshot } from "../src/snapshot.ts";
import { keylang, tempDir, writeTree } from "./cli-helpers.ts";

const CONFIG = {
  languages: ["typescript"],
  layers: { routes: ["app/routes/**"], extensions: ["app/extensions/**"], lib: ["app/lib/**"], app: ["app/*"] },
};

const MANIFEST = { name: "shop", private: true, dependencies: { "react-router": "7.0.0" }, devDependencies: { "@react-router/dev": "7.0.0", "@react-router/fs-routes": "7.0.0" } };

const REPO: Record<string, string> = {
  "keylang.json": `${JSON.stringify(CONFIG, null, 2)}\n`,
  "package.json": `${JSON.stringify(MANIFEST, null, 2)}\n`,
  "app/root.tsx": "export default function Root() {\n  return null;\n}\n",
  "app/routes.ts": 'import { flatRoutes } from "@react-router/fs-routes";\n\nexport default flatRoutes();\n',
  "app/lib/orders.ts": [
    "export function findOrder(id: string) {",
    "  return { id };",
    "}",
    "",
    "export function cancelOrder(id: string) {",
    "  return id;",
    "}",
    "",
    "export function basketAction(run: () => unknown) {",
    "  return () => run();",
    "}",
    "",
  ].join("\n"),
  "app/routes/_index.tsx": "export function loader() {\n  return {};\n}\n\nexport default function Home() {\n  return null;\n}\n",
  "app/routes/_shop.tsx": "export function loader() {\n  return {};\n}\n\nexport default function ShopLayout() {\n  return null;\n}\n",
  "app/routes/_shop.orders.$orderId.tsx": [
    'import { cancelOrder, findOrder } from "../lib/orders";',
    "",
    "export function loader({ params }: { params: { orderId: string } }) {",
    "  return findOrder(params.orderId);",
    "}",
    "",
    "export function action({ params }: { params: { orderId: string } }) {",
    "  return cancelOrder(params.orderId);",
    "}",
    "",
    "export default function Order() {",
    "  return null;",
    "}",
    "",
  ].join("\n"),
  // A handler a factory makes: no fn keylang resolves, the module stands for it.
  "app/routes/action.cart-add.ts": 'import { basketAction } from "../lib/orders";\n\nexport const action = basketAction(() => 1);\n',
  "app/routes/about.tsx": "export function meta() {\n  return [];\n}\n\nexport const handle = { crumb: 1 };\n\nexport default function About() {\n  return null;\n}\n",
  "app/routes/sitemap[.]xml.ts": "export function loader() {\n  return new Response();\n}\n",
  "app/routes/$.tsx": "export function loader() {\n  return null;\n}\n",
  "app/routes/account/route.tsx": "export function clientLoader() {\n  return {};\n}\n",
  // Not route modules: a test, a helper of a folder route.
  "app/routes/about.test.tsx": "export function loader() {\n  return {};\n}\n",
  "app/routes/account/helpers.ts": "export function loader() {\n  return {};\n}\n",
};

function shop(t: TestContext, extra: Record<string, string> = {}): string {
  const dir = tempDir(t, "keylang-react-router-");
  writeTree(dir, { ...REPO, ...extra });
  return dir;
}

function snapshotOf(dir: string): AnalysisSnapshot {
  const run = keylang(dir, ["map"]);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as AnalysisSnapshot;
}

function rows(snapshot: AnalysisSnapshot): string[] {
  return snapshot.entries.filter((e) => e.framework === "react-router").map((e) => [e.label, e.id, e.method ?? "", e.note ?? ""].join(" | "));
}

test("react-router: detected from package.json and `flatRoutes()`; the config files are the route config and the route modules", (t) => {
  const snapshot = snapshotOf(shop(t));
  assert.deepEqual(snapshot.manifest.frameworks?.map((f) => [f.name, f.files.map((x) => x.path)]), [
    ["react-router", ["app/routes.ts", "app/routes/$.tsx", "app/routes/_index.tsx", "app/routes/_shop.orders.$orderId.tsx", "app/routes/_shop.tsx", "app/routes/about.tsx", "app/routes/account/route.tsx", "app/routes/action.cart-add.ts", "app/routes/sitemap[.]xml.ts"]],
  ]);
});

test("react-router: loader, action, the page component and the exports the router calls are entries with the flat-route URL", (t) => {
  const snapshot = snapshotOf(shop(t));
  assert.deepEqual(rows(snapshot).sort(), [
    "GET / (layout) | routes._shop.loader | GET | ",
    "GET / | routes._index.loader | GET | ",
    "GET /* | routes.$.loader | GET | ",
    "GET /account (client) | routes.account.route.clientLoader | GET | ",
    "GET /orders/:orderId | routes._shop_orders_$orderId.loader | GET | ",
    "GET /sitemap.xml | routes.sitemap$5b$2e$5dxml.loader | GET | ",
    "PAGE / (layout) | routes._shop.ShopLayout |  | ",
    "PAGE / | routes._index.Home |  | ",
    "PAGE /about | routes.about.About |  | ",
    "PAGE /orders/:orderId | routes._shop_orders_$orderId.Order |  | ",
    "POST /action/cart-add | routes.action_cart-add | POST | the exported `action` is no fn keylang resolves: the route module stands for it",
    "POST /orders/:orderId | routes._shop_orders_$orderId.action | POST | ",
    "meta /about | routes.about.meta |  | ",
  ]);
});

test("react-router: `flows discover` drafts a flow from a loader into the code it calls", (t) => {
  const dir = shop(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  const discover = keylang(dir, ["flows", "discover", "--print"]);
  assert.equal(discover.status, 0, discover.stderr);
  assert.match(discover.stderr, /no fn to draft from: route POST \/action\/cart-add \(routes\.action_cart-add\)/);
  assert.match(discover.stdout, /- trigger route routes\._shop_orders_\$orderId\.loader\n\s+- step lib\.orders\.findOrder\n/);
});

test("react-router: Storefront Next merges the routes of `extensions/*/routes`; a stock `flatRoutes` does not", (t) => {
  const extension = { "app/extensions/bopis/routes/action.pickup.ts": "export function action() {\n  return {};\n}\n" };
  const stock = snapshotOf(shop(t, extension));
  assert.deepEqual(rows(stock).filter((r) => r.includes("pickup")), []);
  const storefront = snapshotOf(shop(t, { ...extension, "app/routes.ts": 'import { flatRoutes } from "@salesforce/storefront-next-runtime/routing";\n\nexport default flatRoutes();\n' }));
  assert.deepEqual(rows(storefront).filter((r) => r.includes("pickup")), ["POST /action/pickup | extensions.bopis.routes.action_pickup.action | POST | "]);
});

test("react-router: a route config without `flatRoutes()` is a hole; `frameworks: []` leaves the route modules as skipped files", (t) => {
  const dir = shop(t, { "app/routes.ts": 'import { index, route } from "@react-router/dev/routes";\n\nexport default [index("routes/home.tsx"), route("about", "routes/about.tsx")];\n' });
  const snapshot = snapshotOf(dir);
  assert.deepEqual(rows(snapshot), []);
  assert.ok(snapshot.coverage.some((c) => c.file === "app/routes.ts" && c.reason.includes("without `flatRoutes()`")), JSON.stringify(snapshot.coverage));
  const off = shop(t);
  const raw = JSON.parse(readFileSync(join(off, "keylang.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(off, "keylang.json"), `${JSON.stringify({ ...raw, frameworks: [] }, null, 2)}\n`);
  const without = snapshotOf(off);
  assert.deepEqual(rows(without), []);
  assert.ok(without.coverage.some((c) => c.kind === "skipped-file" && c.file === "app/routes/_index.tsx" && c.text === "framework:react-router"));
});
