// Forbidden-import probe for one benchmark copy: pick two modules A and B
// from the generated index (different layers when possible), write
// `deny A B`, add an import A → B, regenerate and expect K102.
// Usage: node bench/inject.ts <repo copy>   (prints one verdict line)

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const dir = process.argv[2]!;
const bin = join(import.meta.dirname, "../bin/keylang.js");
const run = (...args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: "utf8" });

const index = JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as {
  files?: Record<string, { layer: string; module: string }>;
  nodes?: Record<string, { kind?: string; file?: string | null; layer?: string }>;
};
const files = index.files
  ? Object.entries(index.files).filter(([f]) => !/\.(tsx|jsx)$/.test(f))
  : Object.entries(index.nodes ?? {})
      .filter(([, node]) => node.kind === "module" && node.file)
      .map(([id, node]) => [node.file as string, { layer: node.layer ?? id.split(".")[0] ?? "", module: id }] as const);
if (files.length < 2) {
  console.log("skip: fewer than two modules");
  process.exit(0);
}
const [fa, a] = files[0]!;
const [fb, b] = files.find(([, m]) => m.layer !== a.layer) ?? files.find(([, m]) => m.module !== a.module)!;

let spec = relative(dirname(fa), fb).split("\\").join("/");
if (!spec.startsWith(".")) spec = `./${spec}`;
const src = readFileSync(join(dir, fa), "utf8");
const cjs = /\brequire\(/.test(src) && !/^\s*import\s/m.test(src);
appendFileSync(join(dir, fa), cjs ? `\nconst __keylangProbe = require('${spec}');\n` : `\nimport * as __keylangProbe from "${spec}";\n`);
mkdirSync(join(dir, "keylang"), { recursive: true });
writeFileSync(join(dir, "keylang/rules.md"), `# rules\n\n- deny ${a.module} ${b.module}\n`);

if (run("map").status !== 0) {
  console.log("FAIL: map failed after injection");
  process.exit(1);
}
const out = run("check").stdout;
const hit = out.split("\n").find((l) => l.includes("K102") && l.includes(`\`${a.module}\` depends on \`${b.module}\``));
console.log(hit ? `caught: ${a.module} → ${b.module} (K102)` : `FAIL: ${a.module} → ${b.module} not reported\n${out}`);
process.exit(hit ? 0 : 1);
