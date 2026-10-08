// Weakening of the spec since a base commit (K108, ticket 49): what an agent
// could change to switch a rule off without touching the code. In
// keylang.json: a file a rule reaches that `exclude`, `assume` or `outside`
// now leave unread, a `layers` glob that moves such a file out of its layer,
// and `frameworks` turned off. In the specs: a removed `deny` (or any rule
// line but `allow`), a new `allow`, a removed `step` or `trigger`, and a rule
// line in a `# rules` section outside `<dir>/rules.md` (the baseline is the
// generated exception; a wider baseline is a removed deny or a new allow).
// `hook stop`, `check --changed` and `feature` report each one; a plain
// `check` has no base and never does (ADR 0005, amendment).

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readingAid } from "./analyze.ts";
import { CONFIG_FILE, classifySources, guessLayers, sourceClass, specPath, toPosix, withoutBom, type Config } from "./config.ts";
import { diagnostic, type Diagnostic } from "./diag.ts";
import { planItems } from "./feature-status.ts";
import { collectMdFiles } from "./files.ts";
import { gitFileAt, gitSpecFilesAt } from "./git-changes.ts";
import { placeFile } from "./graph.ts";
import type { Document } from "./ir.ts";
import { parse } from "./parser.ts";
import { compareText } from "./span.ts";
import { compileSpec, type RuleAssertion, type SpecIR } from "./spec-ir.ts";

/** One way the spec got weaker. `file` is POSIX, relative to the root; the line is the current file's, or the base's for a removed line. */
export interface Weakening {
  kind: "config" | "rule" | "step";
  file: string;
  line: number;
  col: number;
  /** After `K108 `: `spec weakened: …`, with the old and the new text. */
  message: string;
}

/** The weakenings since a base, or why they were not compared (no git, no keylang.json at the base). */
export interface WeakeningReport {
  weakenings: Weakening[];
  note: string | null;
}

/** The fields of keylang.json that decide what the rules see, read leniently: a field of the wrong shape is absent. */
interface ScopeFields {
  dir: string;
  /** Null: no `layers`, the layout is guessed. */
  layers: Map<string, string[]> | null;
  exclude: string[];
  outside: string[];
  assume: string[];
  /** Undefined: detected. */
  frameworks: string[] | undefined;
}

type ClassField = "exclude" | "outside" | "assume";

const strings = (value: unknown): string[] | undefined => (Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : undefined);

function scopeFields(text: string): ScopeFields {
  let value: unknown;
  try {
    value = JSON.parse(withoutBom(text));
  } catch {
    value = {};
  }
  const raw = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  let layers: Map<string, string[]> | null = null;
  if (raw.layers !== null && typeof raw.layers === "object" && !Array.isArray(raw.layers)) {
    layers = new Map();
    for (const [name, globs] of Object.entries(raw.layers as Record<string, unknown>)) {
      const list = typeof globs === "string" ? [globs] : strings(globs);
      if (list !== undefined) layers.set(name, list);
    }
  }
  return {
    dir: typeof raw.dir === "string" ? raw.dir.replace(/\/$/, "") : "keylang",
    layers,
    exclude: strings(raw.exclude) ?? [],
    outside: strings(raw.outside) ?? [],
    assume: strings(raw.assume) ?? [],
    frameworks: strings(raw.frameworks),
  };
}

/** How much keylang reads of a file: analysed, a hole (`exclude`), or neither read nor a hole. */
const READ_RANK = { analysed: 0, excluded: 1, outside: 2, assumed: 2 } as const;
const FIELD_OF = { excluded: "exclude", outside: "outside", assumed: "assume" } as const;

/** The 1-based line of `"field"` in the JSON text, else 1. */
function fieldLine(text: string, field: string): number {
  const index = text.split("\n").findIndex((line) => line.includes(`"${field}"`));
  return index === -1 ? 1 : index + 1;
}

const listText = (list: readonly string[] | undefined): string => (list === undefined ? "(detected)" : JSON.stringify(list));

function someFiles(files: readonly string[]): string {
  const shown = files.slice(0, 3).join(", ");
  return files.length > 3 ? `${shown} and ${files.length - 3} more` : shown;
}

/**
 * keylang.json weakened from `base` to `now`. `files` are the source files of
 * the configured languages (POSIX, relative to the root), `place` the layer a
 * file is in under given fields (`outside`, or `unassigned` for none), and
 * `reached` the text of a rule whose scope holds a layer, or null.
 */
export function configWeakenings(input: {
  base: string;
  now: string;
  files?: readonly string[];
  place?: (file: string, fields: ScopeFields) => string;
  reached: (layer: string) => string | null;
}): Weakening[] {
  const base = scopeFields(input.base);
  const now = scopeFields(input.now);
  const out: Weakening[] = [];
  const at = (field: string, message: string): Weakening => ({ kind: "config", file: CONFIG_FILE, line: fieldLine(input.now, field), col: 1, message: `spec weakened: ${message}` });

  const unread = new Map<ClassField, { file: string; rule: string }[]>();
  const moved: { file: string; from: string; to: string; rule: string }[] = [];
  for (const file of input.files ?? []) {
    const before = sourceClass(file, base);
    const after = sourceClass(file, now);
    if (before === null || after === null || before === "assumed" || before === "outside") continue;
    const layer = input.place?.(file, base) ?? null;
    const rule = layer === null ? null : input.reached(layer);
    if (rule === null || layer === null) continue;
    if (READ_RANK[after] > READ_RANK[before]) {
      const field = FIELD_OF[after as keyof typeof FIELD_OF];
      unread.set(field, [...(unread.get(field) ?? []), { file, rule }]);
    } else if (after === before) {
      const to = input.place?.(file, now) ?? layer;
      if (to !== layer) moved.push({ file, from: layer, to, rule });
    }
  }
  for (const field of ["exclude", "assume", "outside"] as const) {
    const hits = unread.get(field);
    if (hits === undefined) continue;
    const rules = [...new Set(hits.map((hit) => `\`${hit.rule}\``))].join(", ");
    const what = field === "exclude" ? "is no longer read (a hole)" : field === "assume" ? "is no longer read, and an import of it is no edge" : "is put outside the architecture";
    out.push(at(field, `\`${field}\` ${listText(base[field])} → ${listText(now[field])}: ${someFiles(hits.map((hit) => hit.file))} ${what}, though ${rules} reaches it`));
  }
  if (moved.length > 0) {
    const list = moved.slice(0, 3).map((hit) => `${hit.file}: ${hit.from} → ${hit.to} (\`${hit.rule}\`)`);
    out.push(at("layers", `\`layers\` moves files a rule reaches out of their layer: ${list.join("; ")}${moved.length > 3 ? ` and ${moved.length - 3} more` : ""}`));
  }
  // Detection as the base: only `[]` is surely off; an explicit list there names what it turns on.
  if (now.frameworks !== undefined) {
    const off = base.frameworks === undefined ? now.frameworks.length === 0 : base.frameworks.some((name) => !now.frameworks!.includes(name));
    if (off) out.push(at("frameworks", `\`frameworks\` ${listText(base.frameworks)} → ${listText(now.frameworks)}: framework facts the rules saw are off`));
  }
  return out;
}

/** A rule line as the comparison counts it: a dependency rule once per target, so a baseline line that lost one target lost a deny. */
interface Atom {
  key: string;
  allow: boolean;
  file: string;
  line: number;
  col: number;
}

function atoms(spec: SpecIR): Atom[] {
  const out: Atom[] = [];
  for (const rule of spec.rules) {
    const at = { file: rule.file, line: rule.span.start.line, col: rule.span.start.col };
    if (rule.kind === "dependency") for (const to of rule.to) out.push({ key: `${rule.effect} ${rule.from.target} ${to.target}`, allow: rule.effect === "allow", ...at });
    else out.push({ key: rule.text, allow: false, ...at });
  }
  return out;
}

function counts<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return out;
}

/** Each layer a rule's scope holds, with the rule's text; `*` for a rule over every module (`no-cycles *`). */
function ruleLayers(rule: RuleAssertion): string[] {
  const layer = (id: string): string => id.split(".")[0]!;
  if (rule.kind === "dependency") return [rule.from.target, ...rule.to.map((ref) => ref.target)].map(layer);
  if (rule.kind === "layers") return [...rule.layers];
  if (rule.kind === "no-cycles") return rule.under === null ? ["*"] : [layer(rule.under.target)];
  if (rule.kind === "entry") return rule.entries.map((ref) => layer(ref.target));
  return [layer(rule.module.target)];
}

/** The text of the first rule whose scope holds `layer`, over the specs given. */
export function reachingRule(specs: readonly SpecIR[]): (layer: string) => string | null {
  const scopes = specs.flatMap((spec) => spec.rules.map((rule) => ({ text: rule.text, layers: ruleLayers(rule) })));
  return (layer) => scopes.find((scope) => scope.layers.includes("*") || scope.layers.includes(layer))?.text ?? null;
}

/**
 * The specs weakened from `baseDocs` to `nowDocs` (both POSIX, relative to
 * the root; `dir` is the spec directory, `at` how a sentence names the base).
 */
export function specWeakenings(baseDocs: readonly Document[], nowDocs: readonly Document[], dir: string, at: string): Weakening[] {
  const base = compileSpec(baseDocs).spec;
  const now = compileSpec(nowDocs).spec;
  const rulesFile = specPath(dir, "rules.md");
  const ruleFiles = new Set([rulesFile, specPath(dir, "rules.baseline.md")]);
  const out: Weakening[] = [];
  const weakened = (kind: Weakening["kind"], file: string, line: number, col: number, message: string): void => {
    out.push({ kind, file, line, col, message: `spec weakened: ${message}` });
  };

  const baseAtoms = atoms(base);
  const nowAtoms = atoms(now);
  const left = counts(nowAtoms, (atom) => atom.key);
  for (const atom of baseAtoms) {
    const count = left.get(atom.key) ?? 0;
    if (count > 0) left.set(atom.key, count - 1);
    else if (!atom.allow) weakened("rule", atom.file, atom.line, atom.col, `\`${atom.key}\` (${atom.file}:${atom.line} at ${at}) was removed`);
  }
  // A line kept in its file is no change; one moved from another file is not new, but outside `rules.md` it still breaks the rule that rules live there.
  const before = counts(baseAtoms, (atom) => atom.key);
  const inFile = counts(baseAtoms, (atom) => `${atom.file}\0${atom.key}`);
  for (const atom of nowAtoms) {
    const fileKey = `${atom.file}\0${atom.key}`;
    const same = inFile.get(fileKey) ?? 0;
    if (same > 0) {
      inFile.set(fileKey, same - 1);
      continue;
    }
    if (!ruleFiles.has(atom.file)) weakened("rule", atom.file, atom.line, atom.col, `${atom.allow ? "new " : ""}\`${atom.key}\` in a \`# rules\` section outside ${rulesFile}: rules live only there`);
    else if (atom.allow && (before.get(atom.key) ?? 0) === 0) weakened("rule", atom.file, atom.line, atom.col, `new \`${atom.key}\``);
  }

  // A removed step or trigger of a hand-written flow; a generated one is rewritten by its command.
  const flowItems = (spec: SpecIR, docs: readonly Document[]) => {
    const generated = new Set(docs.filter((doc) => doc.generated !== null).map((doc) => doc.path));
    return spec.flows
      .filter((flow) => !generated.has(flow.file))
      .flatMap((flow) => planItems(flow).flatMap(({ key, item }) => (item.kind === "question" ? [] : [{ key: `${flow.file}\0${key}`, item, flow }])));
  };
  const kept = counts(flowItems(now, nowDocs), (entry) => entry.key);
  for (const { key, item, flow } of flowItems(base, baseDocs)) {
    const count = kept.get(key) ?? 0;
    if (count > 0) {
      kept.set(key, count - 1);
      continue;
    }
    const { line, col } = item.span.start;
    weakened("step", flow.file, line, col, `${item.kind} \`${item.target.target}\` of flow \`${flow.name}\` (${flow.file}:${line} at ${at}) was removed`);
  }
  return out.sort((a, b) => compareText(a.file, b.file) || a.line - b.line || a.col - b.col || compareText(a.message, b.message));
}

/** K108 at a weakening's position, `display` turning its root-relative path into the report's. */
export function weakeningDiagnostic(weakening: Weakening, display: (path: string) => string = (path) => path): Diagnostic {
  const { line, col } = weakening;
  return diagnostic("K108", display(weakening.file), { start: { offset: 0, line, col }, end: { offset: 0, line, col: col + 1 } }, weakening.message);
}

/**
 * The spec at `ref` against the working tree: keylang.json and the `.md`
 * files of the spec directory (the generated map and reading aids left out).
 * Without git, or without keylang.json at `ref` (a first commit, an unborn
 * HEAD), nothing is compared and `note` says why: that is not an error.
 * `at` names the base in a sentence (`HEAD`, `merge-base 1a2b3c4 with main`).
 */
export function readWeakenings(config: Config, ref: string, label: string, at: string = ref): WeakeningReport {
  const root = config.root;
  let baseConfig: string | null;
  let baseSpecs: Map<string, string>;
  const skip = (dir: string) => (path: string) => path.startsWith(`${specPath(dir, "map")}/`) || readingAid(join(root, dir), join(root, path));
  try {
    baseConfig = gitFileAt(root, ref, CONFIG_FILE, label);
    if (baseConfig === null) return { weakenings: [], note: `no ${CONFIG_FILE} at ${at}: the spec was not compared` };
    const baseDir = scopeFields(baseConfig).dir;
    baseSpecs = gitSpecFilesAt(root, ref, baseDir, label, skip(baseDir));
  } catch (error) {
    return { weakenings: [], note: `the spec was not compared with ${at}: ${error instanceof Error ? error.message : String(error)}` };
  }
  const specDir = join(root, config.dir);
  const nowSpecs = existsSync(specDir)
    ? collectMdFiles([specDir])
        .map((abs) => toPosix(relative(root, abs)))
        .filter((path) => !skip(config.dir)(path))
        .sort(compareText)
    : [];
  const baseDocs = [...baseSpecs].map(([path, text]) => parse(path, text));
  const nowDocs = nowSpecs.map((path) => parse(path, readFileSync(join(root, path), "utf8")));
  const reached = reachingRule([compileSpec(baseDocs).spec, compileSpec(nowDocs).spec]);
  const guessed = new Map<string, Map<string, string[]>>();
  const place = (file: string, fields: ScopeFields): string => {
    let layers = fields.layers;
    if (layers === null) {
      const key = JSON.stringify([fields.exclude, fields.outside, fields.assume]);
      if (!guessed.has(key)) guessed.set(key, config.guessed && key === JSON.stringify([config.exclude, config.outside, config.assume]) ? config.layers : guessLayers(root, [...fields.exclude, ...fields.outside, ...fields.assume]));
      layers = guessed.get(key)!;
    }
    return placeFile({ ...config, layers, outside: fields.outside }, file)?.layer ?? "unassigned";
  };
  const files = classifySources({ ...config, exclude: [], outside: [], assume: [] }).analysed;
  const weakenings = [...configWeakenings({ base: baseConfig, now: config.text ?? "{}", files, place, reached }), ...specWeakenings(baseDocs, nowDocs, config.dir, at)];
  return { weakenings, note: null };
}
