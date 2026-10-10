// Prototype for .scratch/web-git/research.md §6: keylang's git commands
// (src/git-changes.ts, src/operations/flow-bundle.ts) through wasm-git's lg2
// (sync build, MEMFS as in a browser worker) and through git, side by side.
//
// usage: npm install wasm-git@0.0.17 in a scratch directory, then
//   node prototype-wasm-git.mjs <that dir>/node_modules/wasm-git/lg2.js <a git checkout with local changes and a `master` branch>
import { spawnSync } from "node:child_process";
const [lg2Path, repo] = process.argv.slice(2);
const { default: Module } = await import(lg2Path);
const out = [], err = [];
const lg = await Module({ print: (m) => out.push(m), printErr: (m) => err.push(m), quit: () => {} });
// MEMFS, as in the browser: the folder copied in, .git included.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const copy = (from, to) => {
  lg.FS.mkdir(to);
  for (const e of readdirSync(from, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    if (e.isDirectory()) copy(join(from, e.name), `${to}/${e.name}`);
    else if (e.isFile()) lg.FS.writeFile(`${to}/${e.name}`, readFileSync(join(from, e.name)));
  }
};
const t0 = performance.now();
copy(repo, "/repo");
console.log(`copied in ${Math.round(performance.now() - t0)} ms`);
lg.FS.chdir("/repo");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
const cases = [
  // As keylang runs them (src/git-changes.ts, src/operations/flow-bundle.ts).
  ["rev-parse", "--is-inside-work-tree"],
  ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
  ["rev-parse", "HEAD"],
  ["rev-parse", "--short", head],
  ["merge-base", "HEAD", "master"],
  ["diff", "--relative", "--no-renames", "--unified=0", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", "master", "--"],
  ["ls-files", "-z", "--others", "--exclude-standard"],
  ["ls-tree", "-r", "-z", "--name-only", "HEAD", "--", "src/extract"],
  ["show", "HEAD:./package.json"],
  ["cat-file", "-e", "HEAD:./package.json"],
  ["config", "--type=bool", "--get", "core.ignorecase"],
  ["remote", "get-url", "origin"],
  // The simpler forms lg2 knows.
  ["rev-parse", "master"],
  ["cat-file", "-p", "HEAD:package.json"],
  ["diff", "--name-only", "master"],
  ["diff", "master"],
  ["ls-files"],
  ["rev-list", "--count", "HEAD"],
  ["describe", "--always"],
  ["log", "--oneline", "-3"],
  ["status", "--short"],
];
for (const args of cases) {
  const git = spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd: repo, encoding: "utf8" });
  out.length = 0; err.length = 0;
  let code; const started = performance.now();
  try { code = lg.callMain([...args]); } catch (e) { code = `threw ${e?.message ?? e}`; }
  const w = out.join("\n"), g = git.stdout.replace(/\n$/, "");
  const same = code === git.status && w === g;
  console.log(`   (${args[0]}: wasm ${Math.round(performance.now() - started)} ms)`);
  console.log(`${same ? "SAME" : "DIFF"}  git ${args.join(" ")}`);
  if (!same) {
    console.log(`   git:  exit ${git.status}, ${g.length} chars: ${JSON.stringify(g.slice(0, 160))}`);
    console.log(`   wasm: exit ${code}, ${w.length} chars: ${JSON.stringify(w.slice(0, 160))} ${err.length ? "stderr: " + JSON.stringify(err.join(" ").slice(0, 160)) : ""}`);
  }
}
