// `keylang` command line: init, map, check, parse, fmt.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { CONFIG_FILE, configToJson, loadConfig, toPosix } from "./config.ts";
import { compareDiagnostics, formatDiagnostic, isError, type Diagnostic } from "./diag.ts";
import { collectMdFiles, load } from "./files.ts";
import { formatSource } from "./fmt.ts";
import { kindLabel, type Document, type Node } from "./ir.ts";
import { diffMap, generateMap, writeMap } from "./map.ts";
import { check } from "./resolve.ts";
import { checkRules } from "./rules.ts";

const USAGE = `keylang: architecture description bound to a repository

Usage: keylang <command> [options] [paths…]

Commands:
  init [dir]                Detect languages and layers, write keylang.json, build the map
  map [dir] [--check]       Generate <dir>/keylang/map/*.md and .keylang/index.json
                            (--check: fail if the committed map is stale)
  check [paths…]            Resolve IDs and check rules over all *.md (default: ./keylang)
  parse [--json] <paths…>   Parse files (or all *.md under directories) and print the IR
  fmt [--check] <paths…>    Rewrite files in canonical format (--check: report only)

Options:
  -h, --help                Show this help
  -V, --version             Show version
`;

/** Runs the CLI and returns the exit code: 0 ok, 1 findings, 2 usage or I/O error. */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    return await run(argv);
  } catch (e) {
    process.stderr.write(`keylang: ${e instanceof Error ? e.message : String(e)}\n`);
    return 2;
  }
}

async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "V" },
      json: { type: "boolean" },
      check: { type: "boolean" },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (values.version) {
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    process.stdout.write(`keylang ${pkg.version}\n`);
    return 0;
  }
  const [cmd, ...paths] = positionals;
  if (cmd === undefined) {
    process.stderr.write(USAGE);
    return 2;
  }
  switch (cmd) {
    case "init":
      return cmdInit(paths[0] ?? ".");
    case "map":
      return cmdMap(paths[0] ?? ".", values.check === true);
    case "check":
      return cmdCheck(paths);
    case "parse":
      needPaths(cmd, paths);
      return cmdParse(paths, values.json === true);
    case "fmt":
      needPaths(cmd, paths);
      return cmdFmt(paths, values.check === true);
    default:
      throw new Error(`unknown command \`${cmd}\`; see --help`);
  }
}

function needPaths(cmd: string, paths: string[]): void {
  if (paths.length === 0) throw new Error(`${cmd}: at least one path is required`);
}

async function cmdInit(dir: string): Promise<number> {
  const root = join(process.cwd(), dir);
  const file = join(root, CONFIG_FILE);
  const config = loadConfig(root);
  if (config.languages.length === 0) {
    process.stderr.write(`keylang: no supported source files found under ${dir} (TypeScript, JavaScript)\n`);
    return 1;
  }
  if (existsSync(file)) {
    process.stdout.write(`${relative(process.cwd(), file) || CONFIG_FILE}: already exists, kept\n`);
  } else {
    writeFileSync(file, configToJson(config));
    process.stdout.write(`${relative(process.cwd(), file) || CONFIG_FILE}: written (${config.languages.join(", ")}; layers: ${[...config.layers.keys()].join(", ")})\n`);
  }
  return cmdMap(dir, false);
}

async function cmdMap(dir: string, checkOnly: boolean): Promise<number> {
  const root = join(process.cwd(), dir);
  const config = loadConfig(root);
  if (config.languages.length === 0) throw new Error(`no supported source files under ${dir}; run \`keylang init\``);
  const r = await generateMap(config);
  const s = r.graph.stats;
  for (const w of r.graph.warnings) process.stderr.write(`warning: ${w}\n`);
  const reportConflict = (p: string): void => {
    process.stdout.write(`${toPosix(relative(process.cwd(), p))}: manual file without keylang:generated marker\n`);
  };
  if (checkOnly) {
    const diff = diffMap(config, r);
    for (const p of diff.conflicts) reportConflict(p);
    // A manual file blocks `map` itself, so "run keylang map" would not refresh the rest.
    if (diff.conflicts.length === 0) {
      for (const p of diff.stale) process.stdout.write(`${toPosix(relative(process.cwd(), p))}: stale, run \`keylang map\`\n`);
    }
    return diff.conflicts.length === 0 && diff.stale.length === 0 ? 0 : 1;
  }
  const { written, removed, conflicts } = writeMap(config, r);
  if (conflicts.length > 0) {
    for (const p of conflicts) reportConflict(p);
    return 1;
  }
  for (const p of written) process.stdout.write(`${toPosix(relative(process.cwd(), p))}: written\n`);
  for (const p of removed) process.stdout.write(`${toPosix(relative(process.cwd(), p))}: removed\n`);
  process.stderr.write(
    `${s.files} file(s), ${s.modules} module(s), ${s.fns} fn, ${s.types} type(s), ${s.deps} dep(s); calls ${s.callsResolved} resolved, ${s.callsExternal} external, ${s.callsDynamic} dynamic, ${s.callsUnresolved} unresolved` +
      (s.importsUnresolved ? `; ${s.importsUnresolved} unresolved import(s)` : "") +
      (s.unassignedFiles ? `; ${s.unassignedFiles} file(s) outside any layer` : "") +
      (r.skipped ? `; ${r.skipped} file(s) outside guessed layers skipped` : "") +
      (config.guessed ? " (layers guessed; run `keylang init` to write keylang.json)" : "") +
      "\n",
  );
  return 0;
}

function cmdParse(paths: string[], json: boolean): number {
  const docs = load(collectMdFiles(paths));
  if (json) process.stdout.write(`${JSON.stringify(docs, null, 2)}\n`);
  else for (const d of docs) printTree(d);
  const diags = docs.flatMap((d) => d.diagnostics);
  for (const d of diags) process.stderr.write(`${formatDiagnostic(d)}\n`);
  return diags.some(isError) ? 1 : 0;
}

function cmdCheck(paths: string[]): number {
  if (paths.length === 0) {
    const cfg = loadConfig(process.cwd());
    if (!existsSync(join(process.cwd(), cfg.dir))) throw new Error(`no \`${cfg.dir}/\` directory here; run \`keylang init\` or pass paths`);
    paths = [cfg.dir];
  }
  const files = collectMdFiles(paths);
  const docs = load(files);
  const { index, diagnostics: resolveDiags } = check(docs);
  const diags: Diagnostic[] = [...docs.flatMap((d) => d.diagnostics), ...resolveDiags, ...checkRules(docs, index)];
  diags.sort(compareDiagnostics);
  for (const d of diags) process.stdout.write(`${formatDiagnostic(d)}\n`);
  const errors = diags.filter(isError).length;
  const warnings = diags.length - errors;
  process.stderr.write(`${files.length} file(s): ${errors} error(s), ${warnings} warning(s)\n`);
  return errors === 0 ? 0 : 1;
}

function cmdFmt(paths: string[], checkOnly: boolean): number {
  let ok = true;
  for (const file of collectMdFiles(paths)) {
    const src = readFileSync(file, "utf8");
    const r = formatSource(file, src);
    if (!r.ok) {
      ok = false;
      for (const d of r.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
    } else if (r.text !== src) {
      if (checkOnly) {
        ok = false;
        process.stdout.write(`${file}: not formatted\n`);
      } else {
        writeFileSync(file, r.text);
        process.stdout.write(`${file}: formatted\n`);
      }
    }
  }
  return ok ? 0 : 1;
}

function printTree(doc: Document): void {
  process.stdout.write(`${doc.path}${doc.generated !== null ? " (generated)" : ""}\n`);
  for (const s of doc.sections) {
    process.stdout.write(`  [${s.kind}] ${s.heading?.value ?? "(no heading)"}\n`);
    for (const item of s.items) if (item.type === "node") printNode(item, 2);
  }
}

function printNode(n: Node, depth: number): void {
  let line = `${"  ".repeat(depth)}${kindLabel(n.kind)}`;
  const id = n.id ?? n.name?.value;
  if (id !== undefined) line += ` ${id}`;
  if (n.link) line += ` <${n.link.target}>`;
  if (n.text) line += ` ${JSON.stringify(n.text.value)}`;
  if (n.label) line += ` ${JSON.stringify(n.label.value)}`;
  if (n.refs.length > 0) line += ` -> ${n.refs.map((r) => r.target).join(", ")}`;
  process.stdout.write(`${line}  @${n.span.start.line}:${n.span.start.col}\n`);
  for (const c of n.children) printNode(c, depth + 1);
}
