// `keylang` command line: init, map, check, parse, fmt.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CONFIG_FILE, configToJson, loadConfig, toPosix } from "./config.ts";
import { sameFinding } from "./assess.ts";
import { formatDiagnostic, isError, type Diagnostic } from "./diag.ts";
import { collectMdFiles, load } from "./files.ts";
import { formatSource } from "./fmt.ts";
import { kindLabel, type Document, type Node } from "./ir.ts";
import { analyze, findRoot, within } from "./analyze.ts";
import { diffMap, writeMap } from "./map.ts";
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
  --explain-edge <a> <b>    Print snapshot edges from id a to id b, or the unresolved
                            constructs in a that could form one; writes nothing

Exit codes: 0 no blocking findings, 1 violations (or unverified with --strict)
or a stale map with --check, 2 usage or I/O error.
`;

/** Runs the CLI and returns the exit code: 0 ok, 1 findings, 2 usage or I/O error. */
export async function main(argv: readonly string[]): Promise<number> {
  // `keylang … | head` closes stdout early; that is not an error.
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EPIPE") process.exit(process.exitCode ?? 0);
  });
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
      return serveLsp();
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
  // `map --check` only reads; `map` also leaves the fact cache for the next run.
  const analyzed = await analyze({ root, specs: [], withoutEvidence: true, persistFacts: !checkOnly });
  const config = analyzed.config;
  const r = analyzed.map;
  if (r === null) throw new Error(`no supported source files under ${dir}; run \`keylang init\``);
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
  if (opts.explain) {
    const analyzed = await analyze({ root: findRoot(cwd), specs: [] });
    return explainEdge(paths, analyzed.snapshot);
  }
  const root = findRoot(cwd);
  const config = loadConfig(root);
  if (paths.length === 0 && !existsSync(join(root, config.dir))) throw new Error(`no \`${config.dir}/\` directory here; run \`keylang init\` or pass paths`);
  const specs = paths.length > 0 ? paths.map((p) => resolve(cwd, p)) : [join(root, config.dir)];
  for (const spec of specs) if (!existsSync(spec)) throw new Error(`${relative(cwd, spec) || spec}: not found`);
  // Specs outside the repository's spec directory (examples, a slide) have no code to check against.
  const inRepo = specs.every((spec) => within(spec, join(root, config.dir)));
  const analyzed = await analyze({
    root,
    specs,
    display: (abs) => toPosix(relative(cwd, abs)),
    ...(inRepo ? {} : { withoutCode: true }),
  });
  const diags = analyzed.diagnostics;
  const snapshot = analyzed.snapshot;
  const channel = analyzed.verdicts;
  const unverified = channel.filter((verdict) => verdict.verdict === "unverified");
  const oks = channel.filter((verdict) => verdict.verdict === "ok").length;
  const fails = diags.filter(isError).length + channel.filter((verdict) => verdict.verdict === "fail" && !sameFinding(verdict, diags)).length;
  const channels = new Set(["ID", "static", "tests", "trace"]);
  const rendered = [
    ...diags.map(formatDiagnostic),
    ...channel.filter((verdict) => !sameFinding(verdict, diags) && (verdict.verdict !== "ok" || channels.has(verdict.criterion))).map(formatVerdict),
  ];
  writeCheck(opts.format, rendered, channel, snapshot, diags);
  process.stderr.write(`${fails} fail, ${unverified.length} unverified, ${oks} ok\n`);
  if (fails > 0) return 1;
  if (opts.strict && unverified.length > 0) return 1;
  return 0;
}

function explainEdge(ids: string[], snapshot: AnalysisSnapshot | null): number {
  const [from, to, extra] = ids;
  if (!from || !to || extra !== undefined) throw new Error("check --explain-edge needs exactly two ids: <from> <to>");
  if (!snapshot) throw new Error("no snapshot; run inside a repository with sources");
  // An id names a node or an ancestor of nodes (a layer or a directory), never an unknown tail.
  const known = (id: string): boolean => snapshot.nodes[id] !== undefined || Object.keys(snapshot.nodes).some((key) => key.startsWith(`${id}.`));
  for (const id of [from, to]) if (!known(id)) throw new Error(`unknown id \`${id}\``);
  const under = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const hits = snapshot.edges
    .filter((edge) => under(edge.source, from) && ((edge.target !== null && under(edge.target, to)) || (edge.candidates ?? []).some((id) => under(id, to))))
    .sort((a, b) => cmpText(a.kind, b.kind) || cmpText(a.file ?? "", b.file ?? "") || a.line - b.line || a.col - b.col || cmpText(a.source, b.source));
  for (const edge of hits) {
    const via = edge.candidates?.length ? ` [${edge.candidates.join(", ")}]` : "";
    const fragment = edge.text ? ` \`${edge.text.replace(/\s+/g, " ")}\`` : "";
    process.stdout.write(`${edge.kind} ${edge.resolution} ${edge.provenance} ${edge.file}:${edge.line}:${edge.col}-${edge.endLine}:${edge.endCol}${fragment} ${edge.source} → ${edge.target ?? "?"}${via}${edge.reason ? ` (${edge.reason})` : ""}\n`);
  }
  if (hits.length > 0) return 0;
  const holes = snapshot.coverage
    .filter((item) => item.source !== null && under(item.source, from))
    .sort((a, b) => cmpText(a.file, b.file) || a.line - b.line || a.col - b.col || cmpText(a.reason, b.reason));
  if (holes.length === 0) {
    process.stdout.write("no edge, coverage complete\n");
    return 0;
  }
  process.stdout.write(`no confirmed edge; ${holes.length} unresolved construct(s) in \`${from}\` could form one\n`);
  for (const hole of holes) process.stdout.write(`unresolved ${hole.file}:${hole.line}:${hole.col} ${hole.reason}\n`);
  return 0;
}

function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface CheckResult {
  criterion: string;
  area: string;
  /** `warning` is a diagnostic that does not fail the check (K006, K103). */
  verdict: "ok" | "fail" | "unverified" | "warning";
  evidence: string;
  snapshotId: string | null;
  file: string;
  line: number;
  col: number;
  code: string | null;
  provenance?: string;
  runId?: string;
  testId?: string;
}

/** Diagnostics and verdicts as one list; a verdict that repeats a diagnostic lends it its criterion. */
function checkResults(verdicts: Verdict[], snapshotId: string | null, diags: Diagnostic[]): CheckResult[] {
  const fromDiags = diags.map((diag): CheckResult => {
    const owner = verdicts.find((verdict) => sameFinding(verdict, [diag]));
    return {
      criterion: owner?.criterion ?? diag.code,
      area: owner?.area ?? diag.file,
      verdict: isError(diag) ? "fail" : "warning",
      evidence: diag.message,
      snapshotId,
      file: diag.file,
      line: diag.span.start.line,
      col: diag.span.start.col,
      code: diag.code,
    };
  });
  const fromVerdicts = verdicts
    .filter((verdict) => !sameFinding(verdict, diags))
    .map((verdict): CheckResult => ({
      criterion: verdict.criterion,
      area: verdict.area,
      verdict: verdict.verdict,
      evidence: verdict.message,
      snapshotId: verdict.snapshotId,
      file: verdict.file,
      line: verdict.line,
      col: verdict.col,
      code: verdict.code,
      ...(verdict.evidence ?? {}),
    }));
  return [...fromDiags, ...fromVerdicts];
}

function writeCheck(format: string, lines: string[], verdicts: Verdict[], snapshot: AnalysisSnapshot | null, diags: Diagnostic[]): void {
  if (format === "human") {
    for (const line of lines) process.stdout.write(`${line}\n`);
    return;
  }
  const snapshotId = snapshot?.snapshotId ?? null;
  const results = checkResults(verdicts, snapshotId, diags);
  if (format === "github") {
    for (const result of results) {
      if (result.verdict === "ok") continue;
      const level = result.verdict === "fail" ? "error" : result.verdict === "warning" ? "warning" : "notice";
      const title = result.code ?? result.verdict;
      process.stdout.write(`::${level} file=${githubProperty(result.file)},line=${result.line},col=${result.col},title=${githubProperty(title)}::${githubData(result.evidence)}\n`);
    }
    return;
  }
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ snapshotId, results, coverage: snapshot?.coverage ?? [] }, null, 2)}\n`);
    return;
  }
  const reported = results.filter((result) => result.verdict !== "ok");
  const ruleIds = [...new Set(reported.map((result) => result.code ?? result.verdict))].sort();
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "keylang", informationUri: "https://www.npmjs.com/package/keylang", rules: ruleIds.map((id) => ({ id, shortDescription: { text: ruleText(id) } })) } },
        results: reported.map((result) => ({
          ruleId: result.code ?? result.verdict,
          ruleIndex: ruleIds.indexOf(result.code ?? result.verdict),
          level: result.verdict === "fail" ? "error" : result.verdict === "warning" ? "warning" : "note",
          message: { text: result.evidence },
          locations: [{ physicalLocation: { artifactLocation: { uri: result.file }, region: { startLine: result.line, startColumn: result.col } } }],
          properties: { verdict: result.verdict, criterion: result.criterion, area: result.area, snapshotId: result.snapshotId },
        })),
        properties: { snapshotId },
      },
    ],
  };
  process.stdout.write(`${JSON.stringify(sarif, null, 2)}\n`);
}

function ruleText(id: string): string {
  if (id === "unverified") return "evidence for this criterion is incomplete";
  return explainCode(id)?.split("\n")[0] ?? id;
}

// GitHub workflow commands: https://docs.github.com/actions/reference/workflow-commands-for-github-actions
function githubData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function githubProperty(text: string): string {
  return githubData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
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
