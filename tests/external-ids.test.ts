// External package IDs: one collision rule for imported and declared names.

import assert from "node:assert/strict";
import { test } from "node:test";
import { assignExternalIds, externalPackageId } from "../src/external-ids.ts";

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
