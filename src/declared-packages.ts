// Packages a repository declares, with their original names and version
// ranges. A rule or a flow may name one (`external.<segment>`) before any file
// imports it. Python manifests are not read: a distribution name is not an
// import name (`Pillow` is imported as `PIL`), so a Python package is known
// only from an import. `composer.json` declares PHP packages by their composer
// names (`monolog/monolog`), the name a PHP import resolves to as well; PHP
// itself, its extensions and composer's own APIs are no packages.
// A manifest counts at the root or in a directory between an analysed file and
// the root, unless `exclude` matches it; no directory is walked. Workspace
// ranges (`workspace:`, `file:`, `link:`, `portal:`), the packages of the
// root `workspaces` or of `pnpm-workspace.yaml` (any glob, `**` and `{a,b}`
// included, listed under its fixed prefix; less what `!pattern` takes), a package
// whose `node_modules` entry links into the repository, a Cargo `path`
// dependency inside it (directly or through `workspace = true`) and the
// members of a Cargo workspace are this repository's code, not externals, as
// the resolvers read them. `@types/x`
// counts as `x`. A missing manifest is skipped. One that cannot be read, or
// whose JSON or TOML is invalid, is an error that names the file and the field.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { parse as parseToml } from "smol-toml";
import { isAnalysed, toPosix, withoutBom, type Config } from "./config.ts";
import { assignExternalIds } from "./external-ids.ts";
import { globToRegExp } from "./glob.ts";
import { inside, isGlob, listWorkspaceGlob, parseJsonc, parseJsoncStrict, pnpmWorkspacePackages, withoutNegated, workspaceGlob } from "./imports.ts";
import { compareText } from "./span.ts";

const PACKAGE_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const CRATE_FIELDS = ["dependencies", "dev-dependencies", "build-dependencies"] as const;
const COMPOSER_FIELDS = ["require", "require-dev"] as const;

/** A manifest field a package is declared in. */
export type DependencyField = (typeof PACKAGE_FIELDS)[number] | (typeof CRATE_FIELDS)[number] | (typeof COMPOSER_FIELDS)[number];

/** Field order within one manifest: npm, then Cargo (`dependencies` is shared), then composer. */
const FIELD_ORDER: readonly DependencyField[] = [...new Set<DependencyField>([...PACKAGE_FIELDS, ...CRATE_FIELDS, ...COMPOSER_FIELDS])];

/** Composer requirements that are no package: PHP, its extensions and libraries, composer's APIs. */
const PLATFORM = /^(php(-64bit|-ipv6|-zts|-debug)?|hhvm|ext-.+|lib-.+|composer|composer-plugin-api|composer-runtime-api)$/i;

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
  ecosystem: "npm" | "cargo" | "composer";
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
  const cargo = cargoWorkspaces(read);
  const add: Add = (name, manifest, field, range) => {
    if (range !== null && LOCAL_RANGE.test(range)) return;
    const target = typesTarget(name);
    if (target === "") return;
    declared.set(target, [...(declared.get(target) ?? []), { manifest, field, range }]);
  };
  const dirs = [...manifestDirs(files)].sort(compareText);
  for (const dir of dirs) {
    const pkg = dir === "" ? "package.json" : `${dir}/package.json`;
    const cargoFile = dir === "" ? "Cargo.toml" : `${dir}/Cargo.toml`;
    const composer = dir === "" ? "composer.json" : `${dir}/composer.json`;
    if (isAnalysed(pkg, config)) {
      const text = read(pkg);
      if (text !== null) addPackages(pkg, text, add);
    }
    if (isAnalysed(cargoFile, config)) {
      const text = read(cargoFile);
      if (text !== null) addCrates(cargoFile, text, add, (key, dep) => cargo.local(dir, key, dep));
    }
    if (isAnalysed(composer, config)) {
      const text = read(composer);
      if (text !== null) addComposer(composer, text, add);
    }
  }
  // The listing of a workspace glob is the resolver's when it made one, and is not
  // an input otherwise: which directories exist changes no edge by itself.
  const list = (rel: string): string | null => known.get(rel) ?? listWorkspaceGlob(config.root, rel);
  const crateDirs = dirs.filter((dir) => inputs.get(dir === "" ? "Cargo.toml" : `${dir}/Cargo.toml`) != null);
  const internal = new Set([
    ...workspaceNames(read, list),
    ...composerPathNames(read, list),
    ...cargo.memberNames(crateDirs, list),
    ...linkedPackages(config.root, declared, inputs),
  ]);
  const entries = [...declared].filter(([name]) => !internal.has(name));
  const { ids } = assignExternalIds(entries.map(([name]) => name));
  const packages = entries
    .map(([name, declarations]): DeclaredPackage => ({
      id: ids.get(name)!,
      name,
      ecosystem: ecosystemOf(declarations),
      declarations: declarations.sort((a, b) => compareText(a.manifest, b.manifest) || FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field)),
    }))
    .sort((a, b) => compareText(a.id, b.id));
  return { packages, inputs };
}

/** npm when a `package.json` declares the package, else composer for a `composer.json`, else Cargo. */
function ecosystemOf(declarations: readonly Declaration[]): DeclaredPackage["ecosystem"] {
  const manifests = new Set(declarations.map((d) => posix.basename(d.manifest)));
  return manifests.has("package.json") ? "npm" : manifests.has("composer.json") ? "composer" : "cargo";
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
 * Names of the packages in the directories the root `workspaces` or the
 * `packages` of `pnpm-workspace.yaml` name (`packages/*`, `apps/web`), read as
 * the import resolver reads them: the same input keys and texts, and a member
 * manifest that does not parse names none. Any glob counts (`packages/**`,
 * `{a,b}`), less what a `!pattern` takes out.
 */
function workspaceNames(read: (rel: string) => string | null, list: (rel: string) => string | null): Set<string> {
  const rootText = read("package.json");
  const manifest = rootText === null ? null : parseJsonc(rootText);
  const declared = isRecord(manifest) ? manifest.workspaces : undefined;
  const pnpm = read("pnpm-workspace.yaml");
  const patterns: unknown[] = [...(Array.isArray(declared) ? declared : isRecord(declared) && Array.isArray(declared.packages) ? declared.packages : []), ...(pnpm === null ? [] : pnpmWorkspacePackages(pnpm))];
  const names = new Set<string>();
  const dirs = patterns.flatMap((pattern) => (typeof pattern === "string" && !pattern.startsWith("!") ? workspaceDirs(pattern, list) : []));
  for (const dir of withoutNegated(dirs, patterns)) {
    const text = read(`${dir}/package.json`);
    const member = text === null ? null : parseJsonc(text);
    if (isRecord(member) && typeof member.name === "string") names.add(member.name);
  }
  return names;
}

/**
 * npm packages a declaring manifest's directory, or one above it, has in
 * `node_modules` as a link into the repository (`npm link`, a workspace, pnpm
 * next to the package): the resolver reads such an entry as a workspace
 * package. Each entry looked at is an input, keyed as the resolver keys it.
 */
function linkedPackages(root: string, declared: ReadonlyMap<string, readonly Declaration[]>, inputs: Map<string, string | null>): Set<string> {
  const names = new Set<string>();
  for (const [name, declarations] of declared) {
    for (const { manifest } of declarations) {
      if (posix.basename(manifest) !== "package.json" || names.has(name)) continue;
      for (let dir = posix.dirname(manifest); ; dir = posix.dirname(dir)) {
        const at = dir === "." ? "" : dir;
        const key = at === "" ? `node_modules/${name}` : `${at}/node_modules/${name}`;
        const abs = join(root, key);
        if (existsSync(abs)) {
          const rel = inside(root, abs);
          if (!inputs.has(key)) inputs.set(key, rel === null ? "installed" : `workspace ${rel}`);
          if (rel !== null) names.add(name);
          break;
        }
        if (at === "") break;
      }
    }
  }
  return names;
}

/**
 * Cargo workspaces as `src/rust-imports.ts` reads them: the nearest
 * `Cargo.toml` with `[workspace]` from a crate's directory up to the root.
 * A dependency is local when its `path`, or the `path` of the
 * `[workspace.dependencies]` entry it inherits (`workspace = true`), stays
 * inside the repository; every member of a workspace (and its root package)
 * is internal, as the resolver binds a member's name to its library.
 */
function cargoWorkspaces(read: (rel: string) => string | null): {
  local(dir: string, key: string, dep: unknown): boolean;
  memberNames(crateDirs: readonly string[], list: (rel: string) => string | null): Set<string>;
} {
  const parsed = new Map<string, Record<string, unknown> | null>();
  const manifestAt = (dir: string): Record<string, unknown> | null => {
    const cached = parsed.get(dir);
    if (cached !== undefined) return cached;
    const text = read(dir === "" ? "Cargo.toml" : `${dir}/Cargo.toml`);
    let value: unknown = null;
    try {
      value = text === null ? null : parseToml(withoutBom(text));
    } catch {
      // Reported where its packages are read.
    }
    const manifest = isRecord(value) ? value : null;
    parsed.set(dir, manifest);
    return manifest;
  };
  const workspaceOf = (dir: string): { dir: string; table: Record<string, unknown> } | null => {
    for (let at = dir; ; at = posix.dirname(at)) {
      const here = at === "." ? "" : at;
      const table = manifestAt(here)?.workspace;
      if (isRecord(table)) return { dir: here, table };
      if (here === "") return null;
    }
  };
  const insideAt = (dir: string, path: string): boolean => {
    const at = posix.normalize(posix.join(dir === "" ? "." : dir, toPosix(path)));
    return at !== ".." && !at.startsWith("../") && !at.startsWith("/");
  };
  return {
    local(dir, key, dep) {
      if (!isRecord(dep)) return false;
      if (typeof dep.path === "string") return insideAt(dir, dep.path);
      if (dep.workspace !== true) return false;
      const workspace = workspaceOf(dir);
      const dependencies = workspace?.table.dependencies;
      const inherited = isRecord(dependencies) ? dependencies[key] : undefined;
      return workspace !== null && isRecord(inherited) && typeof inherited.path === "string" && insideAt(workspace.dir, inherited.path);
    },
    memberNames(crateDirs, list) {
      const names = new Set<string>();
      const seen = new Set<string>();
      for (const crate of crateDirs) {
        const workspace = workspaceOf(crate);
        if (workspace === null || seen.has(workspace.dir)) continue;
        seen.add(workspace.dir);
        const members = Array.isArray(workspace.table.members) ? workspace.table.members.filter((m): m is string => typeof m === "string") : [];
        const dirs = [workspace.dir, ...members.flatMap((member) => cargoMemberDirs(workspace.dir, member, list))];
        for (const dir of dirs) {
          const pkg = manifestAt(dir)?.package;
          if (isRecord(pkg) && typeof pkg.name === "string") names.add(pkg.name);
        }
      }
      return names;
    },
  };
}

/** Directories one `[workspace] members` entry names, root-relative; a glob in the last segment is expanded, as the resolver does. */
function cargoMemberDirs(workspace: string, member: string, list: (rel: string) => string | null): string[] {
  const full = posix.normalize(posix.join(workspace === "" ? "." : workspace, toPosix(member))).replace(/\/$/, "");
  if (full === ".." || full.startsWith("../") || full.startsWith("/")) return [];
  if (!/[*?[{]/.test(full)) return [full === "." ? "" : full];
  const parent = posix.dirname(full);
  if (/[*?[{]/.test(parent) || parent === ".") return [];
  const listing = list(`${parent}/*`);
  const pattern = globToRegExp(full);
  return listing === null || listing === "" ? [] : listing.split("\n").filter((dir) => pattern.test(dir));
}

/**
 * Names of the packages in the root `composer.json`'s `path` repositories
 * (`packages/*`, `modules/billing`): this repository's code, not external.
 */
function composerPathNames(read: (rel: string) => string | null, list: (rel: string) => string | null): Set<string> {
  const rootText = read("composer.json");
  let manifest: unknown = null;
  try {
    manifest = rootText === null ? null : JSON.parse(withoutBom(rootText));
  } catch {
    // Reported where its packages are read.
  }
  const names = new Set<string>();
  if (!isRecord(manifest) || !Array.isArray(manifest.repositories)) return names;
  for (const repository of manifest.repositories) {
    if (!isRecord(repository) || repository.type !== "path" || typeof repository.url !== "string") continue;
    for (const dir of workspaceDirs(repository.url, list)) {
      const text = read(`${dir}/composer.json`);
      try {
        const member: unknown = text === null ? null : JSON.parse(withoutBom(text));
        if (isRecord(member) && typeof member.name === "string") names.add(member.name);
      } catch {
        // A member that does not parse names no package.
      }
    }
  }
  return names;
}

/** Directories one `workspaces` entry names, through the same listing as `src/imports.ts` (`listWorkspaceGlob`). */
function workspaceDirs(pattern: string, list: (rel: string) => string | null): string[] {
  const glob = workspaceGlob(pattern);
  if (glob === null) return [];
  if (!isGlob(glob)) return [glob];
  const listing = list(glob);
  return listing === null || listing === "" ? [] : listing.split("\n");
}

/** A file's text, null when there is none. */
function readInput(abs: string, rel: string): string | null {
  return isFile(abs) ? readText(abs, rel) : null;
}

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}


/**
 * The file is there but cannot be read. That is not the same error as invalid
 * contents. A leading BOM is dropped: Node and npm read such a manifest.
 */
function readText(path: string, rel: string): string {
  try {
    return withoutBom(readFileSync(path, "utf8"));
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

/** `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and the same under `[target.*]`; `local` ones are left out. */
function addCrates(rel: string, text: string, add: Add, local: (key: string, dep: unknown) => boolean): void {
  let value: unknown;
  try {
    value = parseToml(withoutBom(text));
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
      // This repository's crate (`path`, or a `path` the workspace gives): never an external package.
      if (local(key, dep)) continue;
      const renamed = isRecord(dep) && typeof dep.package === "string" ? dep.package : key;
      const range = typeof dep === "string" ? dep : isRecord(dep) && typeof dep.version === "string" ? dep.version : null;
      add(renamed, rel, field, range);
    }
  }
}

/** `require` and `require-dev` of a `composer.json`, without PHP and its extensions. */
function addComposer(rel: string, text: string, add: Add): void {
  let value: unknown;
  try {
    value = JSON.parse(withoutBom(text));
  } catch (error) {
    throw new Error(`${rel}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${rel}: the document must be an object, got ${JSON.stringify(value)}`);
  for (const key of COMPOSER_FIELDS) {
    const names = table(rel, key, key in value ? value[key] : undefined, "object");
    if (names === undefined) continue;
    for (const [name, range] of Object.entries(names)) if (!PLATFORM.test(name)) add(name, rel, key, typeof range === "string" ? range : null);
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
