import assert from "node:assert/strict";
import { test } from "node:test";
import { cycleThrough, stronglyConnected } from "../src/scc.ts";

test("SCC includes the node the old DFS skipped", () => {
  const adj = new Map<string, Set<string>>([
    ["a", new Set(["b", "d"])],
    ["b", new Set(["c"])],
    ["c", new Set(["a"])],
    ["d", new Set(["c"])],
  ]);
  const components = stronglyConnected(adj);
  assert.equal(components.length, 1);
  assert.deepEqual(components[0], ["a", "b", "c", "d"]);
  const cycle = cycleThrough(adj, new Set(components[0]), "d");
  assert.ok(cycle.includes("d"), cycle.join("→"));
  assert.equal(cycle[0], "d");
});

test("a self-loop is its own cycle", () => {
  const adj = new Map<string, Set<string>>([["a", new Set(["a"])]]);
  assert.deepEqual(stronglyConnected(adj), [["a"]]);
  assert.deepEqual(cycleThrough(adj, new Set(["a"]), "a"), ["a"]);
});
