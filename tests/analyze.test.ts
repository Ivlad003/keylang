import assert from "node:assert/strict";
import { test } from "node:test";
import { filesToReextract } from "../src/analyze.ts";

test("changing an export re-resolves its importers", () => {
  const again = filesToReextract(["src/b.ts"], [
    { from: "src/a.ts", to: "src/b.ts" },
    { from: "src/c.ts", to: "src/a.ts" },
    { from: "src/d.ts", to: "src/e.ts" },
  ]);
  assert.deepEqual(again, ["src/a.ts", "src/b.ts", "src/c.ts"]);
});
