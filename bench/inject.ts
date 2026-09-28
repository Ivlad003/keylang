// Negative probes for one benchmark copy. Each probe breaks the copy in one
// way, runs the real CLI, expects the contract's answer, and restores the
// files it touched. Probes:
//   deny-import     `deny A B` + a static import A → B        → K102
//   deny-dynamic    `deny A B` + literal `import()` in a fn   → K102
//   removed-fn      flow step on the only fn, fn removed      → K001
//   manual-map      map file without the generated marker     → `map` exit 1, file kept
//   shadowed-call   parameter named like a module fn, called  → no resolved edge, "shadowed by parameter"
// Probes speak the language of the file they break (TS/JS, Rust or Python); `deny-dynamic` has no Rust or Python form.
// Usage: node bench/inject.ts <repo copy>
// Prints one line per probe, then `probes: N/M caught`.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

interface SnapshotNode {
  kind: string;
  file: string | null;
  layer: string;
  class?: true;
}

const dir = process.argv[2];
if (!dir) {
  process.stderr.write("usage: node bench/inject.ts <repo copy>\n");
  process.exit(2);
}
const bin = join(import.meta.dirname, "../bin/keylang.js");
const run = (...args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: "utf8" });

if (run("map").status !== 0) {
  console.log("skip: map failed");
  process.exit(0);
}
const readIndex = (): { nodes: Record<string, SnapshotNode>; edges: { source: string; target: string | null; resolution: string }[]; coverage: { source: string | null; reason: string }[] } =>
  JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8"));
const index = readIndex();
// File modules only: the snapshot marks a class module with `class: true`.
const modules = Object.entries(index.nodes)
  .filter(([, node]) => node.kind === "module" && !node.class && node.file && /\.([cm]?[jt]s|rs|py)$/.test(node.file))
  .map(([id, node]) => ({ id, file: node.file as string, layer: node.layer }));
/** A function declared directly in a file module. */
const topFn = (m: { id: string; file: string }): string | undefined =>
  Object.keys(index.nodes).find((id) => index.nodes[id]!.kind === "fn" && index.nodes[id]!.file === m.file && id.startsWith(`${m.id}.`) && id.split(".").length === m.id.split(".").length + 1);
if (modules.length < 2) {
  console.log("skip: fewer than two script modules");
  process.exit(0);
}
const rust = (file: string): boolean => file.endsWith(".rs");
const python = (file: string): boolean => file.endsWith(".py");
/** `app/services/bmr.py` → `app.services.bmr`, `app/__init__.py` → `app`. */
const dotted = (file: string): string => file.replace(/\.py$/, "").replace(/\/__init__$/, "").split("/").join(".");
/** `src/live/app.rs` → `crate::live::app`; null outside `src/`. */
const cratePath = (file: string): string | null => {
  const m = /(?:^|\/)src\/(.+)\.rs$/.exec(file);
  if (!m) return null;
  const parts = m[1]!.split("/");
  if (parts.at(-1) === "mod") parts.pop();
  if (parts.length === 1 && (parts[0] === "lib" || parts[0] === "main")) parts.pop();
  return ["crate", ...parts].join("::");
};
// A Rust file outside `src/` (`build.rs`) is a crate of its own: `use crate::…` there names nothing in the repository.
const a = modules.find((m) => !m.file.endsWith(".rs") || cratePath(m.file) !== null) ?? modules[0]!;
// An import names a module of the same language: Python cannot import a `.ts` file.
const family = (file: string): string => (rust(file) ? "rust" : python(file) ? "python" : "ecmascript");
const reachable = modules.filter((m) => family(m.file) === family(a.file) && (!rust(a.file) || cratePath(m.file) !== null));
const b = reachable.find((m) => m.layer !== a.layer) ?? reachable.find((m) => m.id !== a.id)!;
const esm = (file: string): boolean => !/\brequire\(/.test(readFileSync(join(dir, file), "utf8")) || /^\s*import\s/m.test(readFileSync(join(dir, file), "utf8"));
const specifier = (from: string, to: string): string => {
  const spec = relative(dirname(from), to).split("\\").join("/");
  return spec.startsWith(".") ? spec : `./${spec}`;
};

/** Run `probe` with the listed files restored afterwards (missing files are removed). */
function isolated(files: string[], probe: () => string | null): string | null {
  const saved = files.map((file) => ({ file, text: existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : null }));
  try {
    return probe();
  } finally {
    for (const { file, text } of saved) {
      if (text === null) rmSync(join(dir, file), { force: true });
      else writeFileSync(join(dir, file), text);
    }
  }
}

const specFiles = ["keylang/rules.md", "keylang/flows/probe.md"];
const probes: [string, () => string | null][] = [
  [
    "deny-import",
    () =>
      isolated([a.file, ...specFiles], () => {
        const spec = specifier(a.file, b.file);
        const target = cratePath(b.file);
        const line = rust(a.file) ? `#[allow(unused_imports)]\nuse ${target} as __keylang_probe;` : python(a.file) ? `import ${dotted(b.file)} as __keylang_probe` : esm(a.file) ? `import * as __keylangProbe from "${spec}";` : `const __keylangProbe = require('${spec}');`;
        if (rust(a.file) && target === null) return "skip: target outside `src/`";
        writeFileSync(join(dir, a.file), `${readFileSync(join(dir, a.file), "utf8")}\n${line}\n`);
        writeSpec("keylang/rules.md", `# rules\n\n- deny ${a.id} ${b.id}\n`);
        const out = run("check").stdout;
        return out.includes(`K102 divergence: \`${a.id}\` depends on \`${b.id}\``) ? `${a.id} → ${b.id} K102` : null;
      }),
  ],
  [
    "deny-dynamic",
    () =>
      rust(a.file) || python(a.file) ? "skip: no literal dynamic import edge in Rust or Python" : isolated([a.file, ...specFiles], () => {
        const spec = specifier(a.file, b.file);
        writeFileSync(join(dir, a.file), `${readFileSync(join(dir, a.file), "utf8")}\nasync function __keylangProbe() { return import("${spec}"); }\n`);
        writeSpec("keylang/rules.md", `# rules\n\n- deny ${a.id} ${b.id}\n`);
        const out = run("check").stdout;
        return out.includes(`K102 divergence: \`${a.id}\` depends on \`${b.id}\``) ? `import() ${a.id} → ${b.id} K102` : null;
      }),
  ],
  [
    "removed-fn",
    () => {
      const owner = modules.find((m) => topFn(m) !== undefined);
      const fnId = owner ? topFn(owner) : undefined;
      if (!owner || !fnId) return "skip: no top-level fn";
      const file = owner.file;
      return isolated([file, ...specFiles], () => {
        writeSpec("keylang/flows/probe.md", `# flow probe\n\n- step ${fnId}\n`);
        writeFileSync(join(dir, file), rust(file) ? "pub const MARKER: u8 = 1;\n" : python(file) ? "MARKER = 1\n" : "export const marker = 1;\n");
        const out = run("check").stdout;
        return out.includes(`K001 dangling reference \`${fnId}\``) ? `${fnId} K001` : null;
      });
    },
  ],
  [
    "manual-map",
    () => {
      const layer = a.layer;
      const target = `keylang/map/${layer}.md`;
      return isolated([target], () => {
        const manual = `# map\n\nhand-written ${layer}\n`;
        writeSpec(target, manual);
        const status = run("map").status;
        const kept = readFileSync(join(dir, target), "utf8") === manual;
        return status === 1 && kept ? `${target} kept, map exit 1` : null;
      });
    },
  ],
  [
    "shadowed-call",
    () => {
      const owner = modules.find((m) => topFn(m) !== undefined);
      const fnId = owner ? topFn(owner) : undefined;
      if (!owner || !fnId) return "skip: no top-level fn";
      const name = fnId.slice(owner.id.length + 1);
      return isolated([owner.file], () => {
        const shadow = rust(owner.file) ? `fn __keylang_shadow(${name}: fn()) { ${name}(); }` : python(owner.file) ? `def __keylang_shadow(${name}):\n    return ${name}()` : `function __keylangShadow(${name}) { return ${name}(); }`;
        writeFileSync(join(dir, owner.file), `${readFileSync(join(dir, owner.file), "utf8")}\n${shadow}\n`);
        if (run("map").status !== 0) return null;
        const probed = readIndex();
        const source = `${owner.id}.${rust(owner.file) || python(owner.file) ? "__keylang_shadow" : "__keylangShadow"}`;
        const edge = probed.edges.some((e) => e.source === source && e.target === fnId && e.resolution === "resolved");
        const hole = probed.coverage.some((c) => c.source === source && c.reason.startsWith("shadowed by parameter"));
        return !edge && hole ? `${source} shadowed, no edge` : null;
      });
    },
  ],
];

function writeSpec(path: string, text: string): void {
  mkdirSync(dirname(join(dir!, path)), { recursive: true });
  writeFileSync(join(dir!, path), text);
}

let caught = 0;
let ran = 0;
for (const [name, probe] of probes) {
  const result = probe();
  if (result?.startsWith("skip:")) {
    console.log(`${name}: ${result}`);
    continue;
  }
  ran++;
  if (result) caught++;
  console.log(`${name}: ${result ? `caught ${result}` : "FAIL"}`);
}
run("map");
console.log(`probes: ${caught}/${ran} caught`);
process.exit(caught === ran ? 0 : 1);
