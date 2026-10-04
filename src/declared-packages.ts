// Packages a repository declares, with their original names and version
// ranges. A rule or a flow may name one (`external.<segment>`) before any file
// imports it. Python manifests are not read: a distribution name is not an
// import name (`Pillow` is imported as `PIL`), so a Python package is known
// only from an import.
// A manifest counts at the root or in a directory between an analysed file and
// the root, unless `exclude` matches it; no directory is walked. Workspace
// ranges (`workspace:`, `file:`, `link:`, `portal:`) and the packages of the
// root `workspaces` are this repository's code, not externals. `@types/x`
// counts as `x`. A missing manifest is skipped. One that cannot be read, or
// whose JSON or TOML is invalid, is an error that names the file and the field.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { parse as parseToml } from "smol-toml";
import { isAnalysed, toPosix, type Config } from "./config.ts";
import { assignExternalIds } from "./external-ids.ts";
import { parseJsonc, parseJsoncStrict } from "./imports.ts";
import { compareText } from "./span.ts";

const PACKAGE_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const CRATE_FIELDS = ["dependencies", "dev-dependencies", "build-dependencies"] as const;

/** A manifest field a package is declared in. */
export type DependencyField = (typeof PACKAGE_FIELDS)[number] | (typeof CRATE_FIELDS)[number];

/** Field order within one manifest: npm first, then Cargo (`dependencies` is shared). */
const FIELD_ORDER: readonly DependencyField[] = [...new Set<DependencyField>([...PACKAGE_FIELDS, ...CRATE_FIELDS])];

/** Where one package is declared, and its version range as written (null when the manifest gives none). */
export interface Declaration {
  /** POSIX, root-relative. */
  manifest: string;
  field: DependencyField;
  range: string | null;
}

/** A package a repository declares, with its `external.<segment>` id. */
export interface DeclaredPackage {
  id: string;
  /** The name as declared; `@types/x` is `x`. */
  name: string;
  ecosystem: "npm" | "cargo";
  /** Sorted by manifest path, then field order. */
  declarations: Declaration[];
}

/** Ranges that name code in this repository rather than a version to install. */
const LOCAL_RANGE = /^(workspace|file|link|portal):/;

type Add = (name: string, manifest: string, field: DependencyField, range: string | null) => void;

/**
 * The packages declared by the manifests at the root and on the ancestors of
 * `files` (root-relative), sorted by id; their ids cover only these names.
 * `known` holds files a resolver already read (text, or null for absent), so
 * a manifest is parsed from the same text that went into the snapshot id.
 * `inputs` are the files read here (null: absent), for the snapshot id.
 */
export function readManifests(config: Config, files: readonly string[], known: ReadonlyMap<string, string | null> = new Map()): { packages: DeclaredPackage[]; inputs: Map<string, string | null> } {
  const inputs = new Map<string, string | null>();
  const read = (rel: string): string | null => {
    const held = inputs.has(rel) ? inputs.get(rel) : known.get(rel);
    const text = held !== undefined ? held : readInput(join(config.root, rel), rel);
    inputs.set(rel, text);
    return text;
  };
  const declared = new Map<string, Declaration[]>();
  const add: Add = (name, manifest, field, range) => {
    if (range !== null && LOCAL_RANGE.test(range)) return;
    const target = typesTarget(name);
    if (target === "") return;
    declared.set(target, [...(declared.get(target) ?? []), { manifest, field, range }]);
  };
  for (const dir of [...manifestDirs(files)].sort(compareText)) {
    const pkg = dir === "" ? "package.json" : `${dir}/package.json`;
    const cargo = dir === "" ? "Cargo.toml" : `${dir}/Cargo.toml`;
    if (isAnalysed(pkg, config)) {
      const text = read(pkg);
      if (text !== null) addPackages(pkg, text, add);
    }
    if (isAnalysed(cargo, config)) {
      const text = read(cargo);
      if (text !== null) addCrates(cargo, text, add);
    }
  }
  // The listing of `<base>/*` is the resolver's when it made one, and is not
  // an input otherwise: which directories exist changes no edge by itself.
  const list = (rel: string): string | null => known.get(rel) ?? readInput(join(config.root, rel), rel);
  const internal = workspaceNames(read, list);
  const entries = [...declared].filter(([name]) => !internal.has(name));
  const { ids } = assignExternalIds(entries.map(([name]) => name));
  const packages = entries
    .map(([name, declarations]): DeclaredPackage => ({
      id: ids.get(name)!,
      name,
      ecosystem: declarations.some((d) => posix.basename(d.manifest) === "package.json") ? "npm" : "cargo",
      declarations: declarations.sort((a, b) => compareText(a.manifest, b.manifest) || FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field)),
    }))
    .sort((a, b) => compareText(a.id, b.id));
  return { packages, inputs };
}

/** The root (`""`) and every directory between a file and the root. */
function manifestDirs(files: readonly string[]): Set<string> {
  const dirs = new Set<string>([""]);
  for (const file of files) {
    for (let dir = posix.dirname(toPosix(file)); dir !== "." && dir !== "/" && !dir.startsWith(".."); dir = posix.dirname(dir)) {
      if (dirs.has(dir)) break; // its ancestors are in already
      dirs.add(dir);
    }
  }
  return dirs;
}

/** `@types/x` → `x`, `@types/scope__pkg` → `@scope/pkg`; any other name is itself. */
function typesTarget(name: string): string {
  if (!name.startsWith("@types/")) return name;
  const bare = name.slice("@types/".length);
  const scoped = bare.indexOf("__");
  return scoped > 0 ? `@${bare.slice(0, scoped)}/${bare.slice(scoped + 2)}` : bare;
}

/**
 * Names of the packages in the directories the root `workspaces` names
 * (`packages/*`, `apps/web`), read as the import resolver reads them: the same
 * input keys and texts, and a member manifest that does not parse names none.
 */
function workspaceNames(read: (rel: string) => string | null, list: (rel: string) => string | null): Set<string> {
  const rootText = read("package.json");
  const manifest = rootText === null ? null : parseJsonc(rootText);
  if (!isRecord(manifest)) return new Set();
  const patterns = Array.isArray(manifest.workspaces) ? manifest.workspaces : isRecord(manifest.workspaces) && Array.isArray(manifest.workspaces.packages) ? manifest.workspaces.packages : [];
  const names = new Set<string>();
  for (const pattern of patterns) {
    if (typeof pattern !== "string") continue;
    for (const dir of workspaceDirs(pattern, list)) {
      const text = read(`${dir}/package.json`);
      const member = text === null ? null : parseJsonc(text);
      if (isRecord(member) && typeof member.name === "string") names.add(member.name);
    }
  }
  return names;
}

/** Directories one `workspaces` entry names; a trailing `/*` expands one level, as in `src/imports.ts`. */
function workspaceDirs(pattern: string, list: (rel: string) => string | null): string[] {
  const clean = posix.normalize(toPosix(pattern)).replace(/\/$/, "");
  if (clean.startsWith("../") || clean.startsWith("/")) return [];
  if (!clean.endsWith("/*")) return clean.includes("*") ? [] : [clean];
  const base = clean.slice(0, -2);
  if (base.includes("*")) return [];
  const listing = list(`${base}/*`);
  return listing === null || listing === "" ? [] : listing.split("\n");
}

/** A file's text, null when there is none; a `<base>/*` key lists the subdirectories of `<base>`. */
function readInput(abs: string, rel: string): string | null {
  if (rel.endsWith("/*")) {
    const dir = abs.slice(0, -2);
    const base = rel.slice(0, -2);
    if (!isDirectory(dir)) return "";
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${base}/${e.name}`)
      .sort()
      .join("\n");
  }
  return isFile(abs) ? readText(abs, rel) : null;
}

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function isDirectory(abs: string): boolean {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/** The file is there but cannot be read. That is not the same error as invalid contents. */
function readText(path: string, rel: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    throw new Error(`${rel}: cannot read${code === "" ? "" : ` (${code})`}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function table(rel: string, field: string, value: unknown, kind: "object" | "table"): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${rel}: \`${field}\` must be ${kind === "object" ? "an object" : "a table"}, got ${JSON.stringify(value)}`);
  return value;
}

/** `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`. Not `node_modules`. */
function addPackages(rel: string, text: string, add: Add): void {
  let value: unknown;
  try {
    value = parseJsoncStrict(text);
  } catch (error) {
    throw new Error(`${rel}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${rel}: the document must be an object, got ${JSON.stringify(value)}`);
  for (const key of PACKAGE_FIELDS) {
    const names = table(rel, key, key in value ? value[key] : undefined, "object");
    if (names === undefined) continue;
    for (const [name, range] of Object.entries(names)) add(name, rel, key, typeof range === "string" ? range : null);
  }
}

/** `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and the same under `[target.*]`. */
function addCrates(rel: string, text: string, add: Add): void {
  let value: unknown;
  try {
    value = parseToml(text);
  } catch (error) {
    throw new Error(`${rel}: invalid TOML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${rel}: the document must be a table, got ${JSON.stringify(value)}`);
  // A workspace file without `[package]` is not a crate manifest.
  if (!isRecord(value.package)) return;
  const targets = table(rel, "target", "target" in value ? value.target : undefined, "table");
  const nested = targets === undefined ? [] : Object.entries(targets).flatMap(([name, item]) => {
    const crate = table(rel, `target.${name}`, item, "table");
    return crate === undefined ? [] : crateTables(rel, crate, `target.${name}.`);
  });
  for (const [field, names] of [...crateTables(rel, value, ""), ...nested]) {
    for (const [key, dep] of Object.entries(names)) {
      const renamed = isRecord(dep) && typeof dep.package === "string" ? dep.package : key;
      const range = typeof dep === "string" ? dep : isRecord(dep) && typeof dep.version === "string" ? dep.version : null;
      add(renamed, rel, field, range);
    }
  }
}

function crateTables(rel: string, source: Record<string, unknown>, prefix: string): [DependencyField, Record<string, unknown>][] {
  const out: [DependencyField, Record<string, unknown>][] = [];
  for (const key of CRATE_FIELDS) {
    const names = table(rel, `${prefix}${key}`, key in source ? source[key] : undefined, "table");
    if (names !== undefined) out.push([key, names]);
  }
  return out;
}
