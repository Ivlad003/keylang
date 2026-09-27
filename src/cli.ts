// `keylang` command line: parse, check, fmt.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { compareDiagnostics, formatDiagnostic, isError, type Diagnostic } from "./diag.ts";
import { collectMdFiles, load } from "./files.ts";
import { formatSource } from "./fmt.ts";
import { kindLabel, type Document, type Node } from "./ir.ts";
import { check } from "./resolve.ts";

const USAGE = `keylang: architecture description bound to a repository

Usage: keylang <command> [options] <paths…>

Commands:
  parse [--json] <paths…>   Parse files (or all *.md under directories) and print the IR
  check <paths…>            Resolve IDs across all *.md files and report diagnostics
  fmt [--check] <paths…>    Rewrite files in canonical format (--check: report only)

Options:
  -h, --help                Show this help
  -V, --version             Show version
`;

/** Runs the CLI and returns the exit code: 0 ok, 1 findings, 2 usage or I/O error. */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    return run(argv);
  } catch (e) {
    process.stderr.write(`keylang: ${e instanceof Error ? e.message : String(e)}\n`);
    return 2;
  }
}

function run(argv: readonly string[]): number {
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
  if (paths.length === 0) throw new Error(`${cmd}: at least one path is required`);

  switch (cmd) {
    case "parse":
      return cmdParse(paths, values.json === true);
    case "check":
      return cmdCheck(paths);
    case "fmt":
      return cmdFmt(paths, values.check === true);
    default:
      throw new Error(`unknown command \`${cmd}\`; see --help`);
  }
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
  const files = collectMdFiles(paths);
  const docs = load(files);
  const diags: Diagnostic[] = [...docs.flatMap((d) => d.diagnostics), ...check(docs).diagnostics];
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
