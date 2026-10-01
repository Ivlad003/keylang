// Path segments with Next-style brackets become reversible ID segments.
// Names without brackets keep the old sanitizing (`cats.controller` → `cats_controller`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeLayerName, layerName } from "../src/config.ts";
import { isSegment } from "../src/parser.ts";

const BRACKETS: Readonly<Record<string, string>> = {
  "(shop)": "$g-shop",
  "[shop]": "$p-shop",
  _shop_: "_shop_",
  "(id)": "$g-id",
  "[id]": "$p-id",
  "[...slug]": "$all-slug",
  "[[...slug]]": "$opt-slug",
  "my shop (x)": "my$20shop$20$28x$29",
  // Not a whole route form: the hex fallback, still reversible.
  "(my shop)": "$28my$20shop$29",
  "(.)photo": "$28$2e$29photo",
};

test("bracket path segments encode to distinct reversible ID segments; other names stay sanitized", () => {
  const ids = Object.entries(BRACKETS).map(([raw, id]) => {
    assert.equal(layerName(raw), id, raw);
    assert.equal(isSegment(id), true, id);
    assert.equal(decodeLayerName(id), raw, raw);
    return id;
  });
  assert.equal(new Set(ids).size, ids.length);
  // A directory that is already the encoded spelling shares the ID with `(shop)`.
  assert.equal(layerName("$g-shop"), "$g-shop");

  assert.equal(layerName("cats.controller"), "cats_controller");
  assert.equal(layerName("my-dir"), "my-dir");
  assert.equal(layerName("1st"), "_1st");
  assert.equal(layerName("$save"), "$save");
  assert.equal(layerName("my file"), "my_file");
});
