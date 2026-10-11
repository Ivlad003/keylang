// Bundles the diagram client (web/src/diagrams.ts) with esbuild into
// dist/web/diagrams.js and diagrams.css, and the analysis in the browser
// (web/worker/analysis.ts, `app.html` of `web --export`) into analysis.js
// with the tree-sitter WASM files beside it in wasm/; copies the license of
// every package that ends up in a bundle next to it as <package>.LICENSE, as
// copy-web.mjs does for xterm.js, and lists the files a static site needs in
// site.json. esbuild, @maxgraph/core and the worker's polyfills are dev
// dependencies (ADR 0002, ADR 0024): the published package carries the built
// files, not the packages.
//
// The worker runs keylang's own pipeline (`analyze`, src/tui/read-api.ts):
// `node:*` resolves to the shims in web/worker/shims (a read-only file system
// in memory, POSIX paths, a synchronous SHA-256), and `import.meta.url` of a
// module under src/ becomes a path under /keylang/, where the worker mounts
// the grammars and resources that module looks for.
//
// usage: node scripts/build-web.mjs [--outdir <dir>]
// Each file is written under a temporary name and renamed, so a server reading
// the bundle while it is rebuilt sees either the old file or the new one.
import { builtinModules, createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { GRAMMARS, wasmFile } from "../src/extract/grammars.ts";

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

/**
 * maxGraph's `Outline` (the minimap) builds its own graph with every default
 * plugin — editing, connecting, popup menus — which it never uses (its source
 * says so in a TODO), and that import alone puts about 150 KiB of plugins into
 * a bundle that otherwise takes `BaseGraph` with panning only. This drops it:
 * the outline's graph gets no plugins. A changed source fails the build
 * instead of being bundled unpatched.
 */
const leanOutline = {
  name: "lean-outline",
  setup(builder) {
    builder.onLoad({ filter: /[\\/]@maxgraph[\\/]core[\\/]lib[\\/]esm[\\/]view[\\/]other[\\/]Outline\.js$/ }, (args) => {
      const source = readFileSync(args.path, "utf8");
      const imported = "import { getDefaultPlugins } from '../plugin/index.js';";
      const used = "plugins: getDefaultPlugins(),";

      if (!source.includes(imported) || !source.includes(used)) throw new Error(`build-web: ${args.path} changed; review the lean-outline patch`);

      return { contents: source.replace(imported, "").replace(used, "plugins: [],"), loader: "js" };
    });
  },
};

const require = createRequire(import.meta.url);

const shims = join(root, "web/worker/shims");

/** `node:<name>` → the worker's shim; a module the pipeline should never reach in the browser has none and fails the build. */
const NODE_SHIMS = {
  fs: "fs.ts",
  path: "path.ts",
  crypto: "crypto.ts",
  module: "module.ts",
  url: "url.ts",
  string_decoder: "string_decoder.ts",
  child_process: "unavailable.ts",
  os: "unavailable.ts",
  zlib: "unavailable.ts",
};

/** Packages a model would need: never called in the browser. */
const UNAVAILABLE_PACKAGES = new Set(["@anthropic-ai/sdk", "eventsource-parser"]);

const browserNode = {
  name: "browser-node",
  setup(builder) {
    builder.onResolve({ filter: /^node:/ }, (args) => {
      const name = args.path.slice("node:".length).split("/")[0];
      const shim = NODE_SHIMS[name];

      if (!shim) return { errors: [{ text: `build-web: ${args.path} (imported by ${relative(root, args.importer)}) has no browser shim; the analysis in the browser must not reach it` }] };

      return { path: join(shims, shim) };
    });
    // A package that names a builtin without `node:` (`import { EOL } from "os"` of `@mrleebo/prisma-ast`) gets the same shim.
    builder.onResolve({ filter: /^(fs|path|os)$/ }, (args) => (args.importer.includes(`${sep}node_modules${sep}`) ? { path: join(shims, NODE_SHIMS[args.path]) } : undefined));
    // `@mrleebo/prisma-ast` looks for a config file when it loads; the worker has none to read.
    builder.onResolve({ filter: /^lilconfig$/ }, () => ({ path: join(shims, "lilconfig.ts") }));
    builder.onResolve({ filter: /^web-tree-sitter$/ }, () => ({ path: join(shims, "web-tree-sitter.ts") }));
    // keylang's git questions are answered from what isomorphic-git prepared (web/worker/git-changes.ts),
    // which takes the module's pure helpers by the name `keylang-git-changes`.
    const gitChanges = join(root, "src/git-changes.ts");
    builder.onResolve({ filter: /^keylang-git-changes$/ }, () => ({ path: gitChanges }));
    builder.onResolve({ filter: /git-changes\.ts$/ }, (args) => (resolve(args.resolveDir, args.path) === gitChanges ? { path: join(root, "web/worker/git-changes.ts") } : undefined));
    builder.onResolve({ filter: /^web-tree-sitter-package$/ }, () => ({ path: join(dirname(require.resolve("web-tree-sitter")), "web-tree-sitter.js") }));
    builder.onResolve({ filter: /^(@anthropic-ai\/sdk|eventsource-parser)(\/.*)?$/ }, (args) => (UNAVAILABLE_PACKAGES.has(args.path.split("/").slice(0, args.path.startsWith("@") ? 2 : 1).join("/")) ? { path: join(shims, "unavailable.ts") } : undefined));
    // `import.meta.url` of keylang's own modules: a path under /keylang/ (not inside a string: the TypeScript extractor compares text with it).
    builder.onLoad({ filter: /[\\/]src[\\/].*\.ts$/ }, (args) => {
      const rel = relative(root, args.path).split(sep).join("/");

      if (!rel.startsWith("src/")) return undefined;
      const source = readFileSync(args.path, "utf8");

      return { contents: source.replace(/(?<!["'`])\bimport\.meta\.url\b/g, JSON.stringify(`file:///keylang/${rel}`)), loader: "ts" };
    });
  },
};

/**
 * The license text of a package that ships none (saxes, clean-git-ref, diff3): the
 * standard text of the SPDX id its package.json names, with its author as the
 * holder. Any other
 * id fails the build: a bundle carries no code without its license.
 */
function licenseOfManifest(dir) {
  const { name, license, author } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const holder = typeof author === "string" ? author : (author?.name ?? name);

  if (license === "ISC") return `ISC License\n\nCopyright (c) ${holder}\n\nPermission to use, copy, modify, and/or distribute this software for any\npurpose with or without fee is hereby granted, provided that the above\ncopyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES\nWITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF\nMERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR\nANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES\nWHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN\nACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF\nOR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.\n\n(${name}: no license file in the package; the text of its package.json \`license\`)\n`;

  if (license === "MIT") return `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n\n(${name}: no license file in the package; the text of its package.json \`license\`)\n`;

  // Apache-2.0 is keylang's own license: its standard text is the repository's LICENSE.
  if (license === "Apache-2.0") return `${name}: Apache License 2.0 (no license file in the package; the text of its package.json \`license\`), by ${holder}\n\n${readFileSync(join(root, "LICENSE"), "utf8")}`;
  throw new Error(`build-web: ${name} has no license file to ship with the bundle (license: ${license ?? "none"})`);
}

const outdir = parseOutdir(process.argv.slice(2));

mkdirSync(outdir, { recursive: true });

const common = { absWorkingDir: root, bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, legalComments: "none", metafile: true, write: false, outdir, logLevel: "warning" };

const page = await build({ ...common, entryPoints: [join(root, "web/src/diagrams.ts")], plugins: [leanOutline] });

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const resources = Object.fromEntries(["data-logic.json", "integrations.json"].map((name) => [name, readFileSync(join(root, "resources", name), "utf8")]));

const worker = await build({
  ...common,
  entryPoints: { analysis: join(root, "web/worker/analysis.ts") },
  plugins: [browserNode],
  inject: [join(shims, "globals.ts")],
  define: {
    KEYLANG_BUILTINS: JSON.stringify(builtinModules),
    KEYLANG_VERSION: JSON.stringify(version),
    KEYLANG_RESOURCES: JSON.stringify(resources),
    KEYLANG_WEB_TREE_SITTER_VERSION: JSON.stringify(JSON.parse(readFileSync(join(dirname(require.resolve("web-tree-sitter")), "package.json"), "utf8")).version),
    // web-tree-sitter's own module URL; `Parser.init` is told where its WASM is anyway (shims/web-tree-sitter.ts).
    "import.meta.url": "self.location.href",
  },
});

for (const file of [...page.outputFiles, ...worker.outputFiles]) writeAtomic(file.path, file.contents);

// The grammars and the tree-sitter runtime beside the worker, with the grammars' version (as scripts/copy-wasm.mjs writes it for dist/wasm).
const wasmOut = join(outdir, "wasm");

mkdirSync(wasmOut, { recursive: true });

const grammarsManifest = require.resolve("@vscode/tree-sitter-wasm/package.json");

const wasmFiles = [];

for (const grammar of GRAMMARS) {
  writeAtomic(join(wasmOut, wasmFile(grammar)), readFileSync(join(dirname(grammarsManifest), "wasm", wasmFile(grammar))));
  wasmFiles.push(`wasm/${wasmFile(grammar)}`);
}

writeAtomic(join(wasmOut, "web-tree-sitter.wasm"), readFileSync(join(dirname(require.resolve("web-tree-sitter")), "web-tree-sitter.wasm")));

const grammars = JSON.parse(readFileSync(grammarsManifest, "utf8"));

writeAtomic(join(wasmOut, "grammars.json"), `${JSON.stringify({ package: grammars.name, version: grammars.version }, null, 2)}\n`);

wasmFiles.push("wasm/web-tree-sitter.wasm", "wasm/grammars.json");

// One license per bundled or copied package: the minified bundles drop the comments.
const packages = new Set([dirname(grammarsManifest)]);

for (const input of [...Object.keys(page.metafile.inputs), ...Object.keys(worker.metafile.inputs)]) {
  const dir = packageDir(input);

  if (dir) packages.add(dir);
}

const shipped = [];

for (const dir of [...packages].sort()) {
  const { name } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const license = readdirSync(dir).find((file) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(file));
  const target = `${name.replace(/^@/, "").replace("/", "-")}.LICENSE`;
  writeAtomic(join(outdir, target), license ? readFileSync(join(dir, license)) : licenseOfManifest(dir));
  shipped.push(target);
}

// What a static site of `web --export` copies into its assets/.
const site = ["diagrams.js", "diagrams.css", "analysis.js", ...wasmFiles, ...shipped.sort()];

writeAtomic(join(outdir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);

const sizes = [...page.outputFiles, ...worker.outputFiles].map((file) => `${relative(root, file.path).split(sep).join("/")} ${Math.round(file.contents.length / 1024)} KiB`);

process.stderr.write(`build-web: ${sizes.join(", ")}; ${wasmFiles.length} wasm files; ${shipped.join(", ") || "no licenses"}\n`);
