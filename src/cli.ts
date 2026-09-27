// `keylang` command line: init, map, check, parse, fmt.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { CONFIG_FILE, configToJson, loadConfig, toPosix } from "./config.ts";
import { assess, sameFinding } from "./assess.ts";
import { formatDiagnostic, isError, type Diagnostic } from "./diag.ts";
import { collectMdFiles, load } from "./files.ts";
import { formatSource } from "./fmt.ts";
import { kindLabel, type Document, type Node } from "./ir.ts";
import { analyze } from "./analyze.ts";
import { diffMap, generateMap, writeMap } from "./map.ts";
import { explainCode } from "./explain.ts";
import { serveLsp } from "./lsp.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { formatVerdict, type Verdict } from "./verdict.ts";

const USAGE = `keylang: architecture description bound to a repository

Usage: keylang <command> [options] [paths…]

Commands:
  init [dir]                Detect languages and layers, write keylang.json, build the map
  map [dir] [--check]       Generate <dir>/keylang/map/*.md and .keylang/index.json
                            (--check: fail if the committed map is stale)
  explain <code>            Print why a diagnostic code happens and how to fix it
  lsp                       Speak LSP over stdio
  check [paths…]            Resolve IDs and check rules (default: ./keylang)
                            Rebuilds the analysis in memory; does not write the map
  parse [--json] <paths…>   Parse files (or all *.md under directories) and print the IR
  fmt [--check] <paths…>    Rewrite files in canonical format (--check: report only)

Options:
  -h, --help                Show this help
  -V, --version             Show version
  --strict                  Exit 1 when a required result is unverified
  --format <name>           check output: human (default), json, sarif, github
  --explain-edge <a> <b>    Print snapshot edges between two ids; writes nothing
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
      strict: { type: "boolean" },
      format: { type: "string" },
      "explain-edge": { type: "boolean" },
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
      return cmdCheck(paths, { strict: values.strict === true, format: values.format ?? "human", explain: values["explain-edge"] === true });
    case "explain":
      return cmdExplain(paths[0]);
    case "lsp":
      await serveLsp();
      return 0;
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

function cmdExplain(code: string | undefined): number {
  if (!code) throw new Error("explain: a code is required");
  const text = explainCode(code);
  if (!text) throw new Error(`unknown code \`${code}\``);
  process.stdout.write(`${text}\n`);
  return 0;
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

const FORMATS = ["human", "json", "sarif", "github"] as const;

async function cmdCheck(paths: string[], opts: { strict: boolean; format: string; explain: boolean }): Promise<number> {
  if (!FORMATS.includes(opts.format as (typeof FORMATS)[number])) {
    throw new Error(`unknown --format \`${opts.format}\`; expected ${FORMATS.join(", ")}`);
  }
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const explicit = paths.length > 0;
  if (!explicit) {
    if (!existsSync(join(cwd, config.dir))) throw new Error(`no \`${config.dir}/\` directory here; run \`keylang init\` or pass paths`);
    paths = [config.dir];
  }
  const specsAreRepo = paths.every((p) => p === config.dir || p.startsWith(`${config.dir}/`));
  let snapshot: AnalysisSnapshot | null = null;
  if ((opts.explain || specsAreRepo) && config.languages.length > 0) snapshot = (await analyze(config.root)).index;
  if (opts.explain) return explainEdge(explicit ? paths : [], snapshot);
  const files = collectMdFiles(paths);
  const docs = load(files);
  if (config.check.tests && !existsSync(join(config.root, config.check.tests))) throw new Error(`check.tests: no such file \`${config.check.tests}\``);
  if (config.check.trace && !existsSync(join(config.root, config.check.trace))) throw new Error(`check.trace: no such file \`${config.check.trace}\``);
  const assessed = assess(docs, snapshot, {
    root: config.root,
    ...(config.check.tests ? { testsPath: config.check.tests } : {}),
    ...(config.check.trace ? { tracePath: config.check.trace } : {}),
  });
  const diags = assessed.diagnostics;
  const channel = assessed.verdicts;
  const unverified = channel.filter((verdict) => verdict.verdict === "unverified");
  const oks = channel.filter((verdict) => verdict.verdict === "ok").length;
  const fails = diags.filter(isError).length + channel.filter((verdict) => verdict.verdict === "fail" && !sameFinding(verdict, diags)).length;
  const channels = new Set(["ID", "static", "tests", "trace"]);
  const rendered = [
    ...diags.map(formatDiagnostic),
    ...channel.filter((verdict) => !sameFinding(verdict, diags) && (verdict.verdict !== "ok" || channels.has(verdict.criterion))).map(formatVerdict),
  ];
  writeCheck(opts.format, rendered, channel, snapshot?.snapshotId ?? null, diags);
  process.stderr.write(`${fails} fail, ${unverified.length} unverified, ${oks} ok\n`);
  if (fails > 0) return 1;
  if (opts.strict && unverified.length > 0) return 1;
  return 0;
}

function explainEdge(paths: string[], snapshot: AnalysisSnapshot | null): number {
  const [from, to] = paths.filter((p) => p.includes("."));
  if (!from || !to) throw new Error("check --explain-edge needs two ids");
  if (!snapshot) throw new Error("no snapshot; run inside a repository with sources");
  const known = (id: string): boolean => snapshot.nodes[id] !== undefined || Object.keys(snapshot.nodes).some((key) => key.startsWith(`${id}.`) || id.startsWith(`${key}.`));
  if (!known(from) || !known(to)) throw new Error(`unknown id \`${!known(from) ? from : to}\``);
  const hits = snapshot.edges
    .filter((edge) => edge.source === from || edge.source.startsWith(`${from}.`) || edge.target === to || edge.target?.startsWith(`${to}.`))
    .filter((edge) => (edge.source === from || edge.source.startsWith(`${from}.`)) && (edge.target === to || edge.target?.startsWith(`${to}.`) || edge.target === null))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.line - b.line || a.col - b.col);
  if (hits.length === 0) {
    const holes = snapshot.coverage.filter((item) => item.source === from || item.source?.startsWith(`${from}.`));
    if (holes.length === 0) process.stdout.write(`no edge, coverage complete\n`);
    else for (const hole of holes) process.stdout.write(`unresolved ${hole.file}:${hole.line}:${hole.col} ${hole.reason}\n`);
    return 0;
  }
  for (const edge of hits) {
    const via = edge.candidates?.length ? ` [${edge.candidates.join(", ")}]` : "";
    const fragment = edge.text ? ` \`${edge.text.replace(/\s+/g, " ")}\`` : "";
    process.stdout.write(`${edge.kind} ${edge.resolution} ${edge.provenance} ${edge.file}:${edge.line}:${edge.col}-${edge.endLine}:${edge.endCol}${fragment} ${edge.source} → ${edge.target ?? "unresolved"}${via}${edge.reason ? ` (${edge.reason})` : ""}\n`);
  }
  return 0;
}

function writeCheck(format: string, lines: string[], verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]): void {
  if (format === "human") {
    for (const line of lines) process.stdout.write(`${line}\n`);
    return;
  }
  if (format === "github") {
    for (const diag of diags) {
      const level = isError(diag) ? "error" : "warning";
      process.stdout.write(`::${level} file=${diag.file},line=${diag.span.start.line},col=${diag.span.start.col}::${diag.code} ${diag.message}\n`);
    }
    for (const verdict of verdicts) {
      if (verdict.verdict === "ok" || sameFinding(verdict, diags)) continue;
      const level = verdict.verdict === "fail" ? "error" : "warning";
      process.stdout.write(`::${level} file=${verdict.file},line=${verdict.line},col=${verdict.col}::${verdict.message}\n`);
    }
    return;
  }
  const results = [
    ...diags.map((diag) => ({
      criterion: diag.code,
      area: diag.file,
      verdict: isError(diag) ? "fail" : "ok",
      evidence: diag.message,
      snapshotId,
      file: diag.file,
      line: diag.span.start.line,
      col: diag.span.start.col,
      code: diag.code,
    })),
    ...verdicts.filter((verdict) => !sameFinding(verdict, diags)).map((verdict) => ({
      criterion: verdict.criterion,
      area: verdict.area,
      verdict: verdict.verdict,
      evidence: verdict.message,
      snapshotId: verdict.snapshotId,
      file: verdict.file,
      line: verdict.line,
      col: verdict.col,
      code: verdict.code,
    })),
  ];
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ snapshotId, results }, null, 2)}\n`);
    return;
  }
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "keylang", rules: [] as { id: string }[] } },
        results: results
          .filter((result) => result.verdict === "fail")
          .map((result) => ({
            ruleId: result.code ?? "unverified",
            level: "error",
            message: { text: String(result.evidence) },
            locations: [{ physicalLocation: { artifactLocation: { uri: result.file }, region: { startLine: result.line, startColumn: result.col } } }],
          })),
      },
    ],
  };
  process.stdout.write(`${JSON.stringify(sarif, null, 2)}\n`);
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
