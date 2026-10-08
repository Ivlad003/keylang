// External package IDs: one collision rule for imported and declared names.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { assignExternalIds, externalPackageId } from "../src/external-ids.ts";

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin/keylang.js");

test("external IDs depend on the set of names, not their order; the name equal to the segment keeps it", () => {
  const forward = assignExternalIds(["@scope/pkg", "scope-pkg", "lodash.get", "scope-pkg-2"]);
  const backward = assignExternalIds(["scope-pkg-2", "lodash.get", "scope-pkg", "@scope/pkg", "scope-pkg"]);
  assert.deepEqual([...forward.ids].sort(), [...backward.ids].sort());
  assert.deepEqual(forward.warnings, backward.warnings);
  assert.equal(forward.ids.get("scope-pkg"), "external.scope-pkg");
  // `-2` is taken by a package of that name, so the collision gets `-3`.
  assert.equal(forward.ids.get("@scope/pkg"), "external.scope-pkg-3");
  assert.equal(forward.ids.get("lodash.get"), "external.lodash_get");
  assert.equal(forward.warnings.length, 1);
});

test("the package part of an external ID", () => {
  assert.equal(externalPackageId("external.pg.Pool.connect"), "external.pg");
  assert.equal(externalPackageId("external.scope-pkg-2"), "external.scope-pkg-2");
  assert.equal(externalPackageId("external"), null);
  assert.equal(externalPackageId("app.external.pg"), null);
});

// Ticket review-2026-10-06/33: packages of this repository are no `external.*`,
// whatever manifest declares them; through the real CLI on temporary repositories.

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-external-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function check(dir: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, "check"], { cwd: dir, encoding: "utf8" });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const CRATES = {
  "crates/api/src/lib.rs": "use domain::total;\n\npub fn run() -> u32 {\n    total()\n}\n",
  "crates/domain/Cargo.toml": '[package]\nname = "domain"\nversion = "0.1.0"\n',
  "crates/domain/src/lib.rs": "pub fn total() -> u32 {\n    1\n}\n",
  "keylang.json": JSON.stringify({ languages: ["rust"], layers: { api: ["crates/api/**"], domain: ["crates/domain/**"] } }),
  "keylang/rules.md": "# rules\n\n- deny api external.domain\n- deny api external.serde\n- deny api external.nonexistent\n",
};

test("Cargo: a `path` dependency or a workspace member is no external package; `deny … external.<member>` is K001", (t) => {
  const dir = repo(t, {
    ...CRATES,
    "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n',
    "crates/api/Cargo.toml": '[package]\nname = "api"\nversion = "0.1.0"\n\n[dependencies]\ndomain = { path = "../domain" }\nserde = "1"\n',
  });
  const out = check(dir).stdout;
  assert.match(out, /K001 dangling reference `external\.domain`/);
  assert.match(out, /K001 dangling reference `external\.nonexistent`/);
  assert.doesNotMatch(out, /external\.serde`/, "a registry dependency stays a declared package");
});

test("Cargo: `{ workspace = true }` on a `path` entry of `[workspace.dependencies]` is internal; a member named by version is too", (t) => {
  const inherited = repo(t, {
    ...CRATES,
    "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n\n[workspace.dependencies]\ndomain = { path = "crates/domain" }\nserde = "1"\n',
    "crates/api/Cargo.toml": '[package]\nname = "api"\nversion = "0.1.0"\n\n[dependencies]\ndomain = { workspace = true }\nserde = { workspace = true }\n',
  });
  const out = check(inherited).stdout;
  assert.match(out, /K001 dangling reference `external\.domain`/);
  assert.doesNotMatch(out, /external\.serde`/);
  // The resolver binds a member's name to its library whatever the dependency says.
  const member = repo(t, {
    ...CRATES,
    "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n',
    "crates/api/Cargo.toml": '[package]\nname = "api"\nversion = "0.1.0"\n\n[dependencies]\ndomain = "0.1"\nserde = "1"\n',
  });
  assert.match(check(member).stdout, /K001 dangling reference `external\.domain`/);
});

const WEB = {
  "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { "@acme/ui": "*", "left-pad": "^1.0.0" } }),
  "apps/web/src/page.ts": 'import { ui } from "@acme/ui";\n\nexport function page(): number {\n  return ui();\n}\n',
  "packages/libs/ui/package.json": JSON.stringify({ name: "@acme/ui", main: "src/index.ts" }),
  "packages/libs/ui/src/index.ts": "export function ui(): number {\n  return 1;\n}\n",
  "keylang.json": JSON.stringify({ languages: ["typescript"], layers: { web: ["apps/**"], ui: ["packages/**"] } }),
  "keylang/rules.md": "# rules\n\n- deny web external.acme-ui\n- deny web external.left-pad\n",
};

test("npm: a workspace member a `**`, `{a,b}` or negated pattern names is internal, as is a node_modules link into the repository", (t) => {
  for (const workspaces of [["apps/*", "packages/**"], ["apps/*", "packages/{libs,tools}/*"], ["apps/*", "packages/**", "!packages/legacy/**"]]) {
    const dir = repo(t, { ...WEB, "package.json": JSON.stringify({ name: "root", private: true, workspaces }) });
    const out = check(dir).stdout;
    assert.match(out, /K001 dangling reference `external\.acme-ui`/, workspaces.join(" "));
    assert.doesNotMatch(out, /external\.left-pad`/);
  }
  // A negated pattern takes the member out of the workspace: it is declared as a package again.
  const negated = repo(t, { ...WEB, "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["apps/*", "packages/**", "!packages/libs/**"] }) });
  assert.doesNotMatch(check(negated).stdout, /K001 dangling reference `external\.acme-ui`/);
  // No `workspaces` at all, but an installed link into the repository (`npm link`, pnpm next to the package).
  const linked = repo(t, { ...WEB, "package.json": JSON.stringify({ name: "root", private: true }) });
  mkdirSync(join(linked, "apps/web/node_modules/@acme"), { recursive: true });
  symlinkSync(join(linked, "packages/libs/ui"), join(linked, "apps/web/node_modules/@acme/ui"), "dir");
  assert.match(check(linked).stdout, /K001 dangling reference `external\.acme-ui`/);
});
