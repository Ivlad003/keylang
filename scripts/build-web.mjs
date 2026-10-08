// Bundles the diagram client (web/src/diagrams.ts) with esbuild into
// dist/web/diagrams.js and diagrams.css, and copies the license of every
// package that ends up in the bundle next to it as <package>.LICENSE, as
// copy-web.mjs does for xterm.js. esbuild and @maxgraph/core are dev
// dependencies (ADR 0002, ADR 0024): the published package carries the built
// files, not the packages.
//
// usage: node scripts/build-web.mjs [--outdir <dir>]
// Each file is written under a temporary name and renamed, so a server reading
// the bundle while it is rebuilt sees either the old file or the new one.
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseOutdir(argv) {
  const at = argv.indexOf("--outdir");
  if (at === -1) return join(root, "dist/web");
  const value = argv[at + 1];
  if (!value) {
    process.stderr.write("usage: build-web.mjs [--outdir <dir>]\n");
    process.exit(2);
  }
  return resolve(value);
}

/** The package directory of a bundled input under node_modules, or null for a source file of this repository. */
function packageDir(input) {
  const parts = input.split(/[\\/]/);
  const at = parts.lastIndexOf("node_modules");
  if (at === -1) return null;
  const name = parts[at + 1]?.startsWith("@") ? parts.slice(at + 1, at + 3) : parts.slice(at + 1, at + 2);
  return join(root, ...parts.slice(0, at + 1), ...name);
}

function writeAtomic(file, contents) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, contents);
  renameSync(temporary, file);
}

const outdir = parseOutdir(process.argv.slice(2));
mkdirSync(outdir, { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: [join(root, "web/src/diagrams.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  metafile: true,
  write: false,
  outdir,
  logLevel: "warning",
});

for (const file of result.outputFiles) writeAtomic(file.path, file.contents);

// One license per bundled package: the minified bundle drops the comments.
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const dir = packageDir(input);
  if (dir) packages.add(dir);
}
const shipped = [];
for (const dir of [...packages].sort()) {
  const { name } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const license = readdirSync(dir).find((file) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(file));
  if (!license) throw new Error(`build-web: ${name} has no license file to ship with the bundle`);
  const target = `${name.replace(/^@/, "").replace("/", "-")}.LICENSE`;
  writeAtomic(join(outdir, target), readFileSync(join(dir, license)));
  shipped.push(target);
}
const sizes = result.outputFiles.map((file) => `${relative(root, file.path).split(sep).join("/")} ${Math.round(file.contents.length / 1024)} KiB`);
process.stderr.write(`build-web: ${sizes.join(", ")}; ${shipped.join(", ") || "no licenses"}\n`);
