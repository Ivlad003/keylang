// Import specifier → file. Relative paths with extension probing, the
// `paths`/`baseUrl` of the `tsconfig` (or `jsconfig`) that governs the
// importing file — the nearest one above it, with the configs a solution
// config `references` lending theirs to the files under them —,
// `package.json` `imports` (`#alias`), Node built-ins. A bare specifier goes
// through `paths` (the most specific pattern, as `tsc` picks it) and
// `baseUrl` before it is a built-in or a package, so an alias named like a
// built-in (`constants`, `events`) is the project's file. A bare specifier is an
// external package only when the project declares or installs it — at the
// root, or in a `package.json` / `node_modules` between the importing file and
// the root, as Node looks for it (`web/package.json` of a monorepo); any other
// is unresolved — an alias keylang does not know is a hole, not a package.
// A workspace package (a `node_modules` link into the repository — at the
// root or, as pnpm installs it, next to the importing package — a `workspaces`
// entry of the root `package.json`, or a `packages` entry of
// `pnpm-workspace.yaml`) is internal: its `exports`/`module`/`main` name the
// file. A `workspace:`, `file:`, `link:` or `portal:` range declares this
// repository's code, never an external package (ADR 0010).
// Files of the analysis (including unsaved or proposed ones, not yet on disk)
// exist for the resolver whatever the disk says, so one snapshot resolves the
// same way before and after a candidate is written.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { posix } from "node:path";
import { toPosix } from "./config.ts";
import { isNodeBuiltin } from "./extract/ts.ts";
import { languageOf } from "./languages.ts";

export type Resolution =
  /** `workspace`: the package that names the file, when a workspace package resolved it. */
  /** `whole`: the specifier names the module itself, so a named binding is the module (Rust `use crate::a`). */
  /** `nested`: the path goes on into a module declared inside the file (Rust `mod x {}`): a dependency on the file, but the name is not its member. */
  | { kind: "internal"; file: string; workspace?: string; whole?: true; nested?: true }
  /** The specifier names the importing file itself (Rust `use self::X`): no dependency. */
  | { kind: "local" }
  | { kind: "external"; pkg: string }
  | { kind: "builtin" }
  /** A module of the language's standard library that is no package (Python `typing`): no node, no dependency; calls through it are external. */
  | { kind: "stdlib" }
  | { kind: "generated" }
  | { kind: "unresolved" };

export interface SourceResolver {
  resolve(fromFile: string, spec: string): Resolution;
  /** Config files read, with their text (null: absent); the snapshot id depends on them. */
  readonly inputs: ReadonlyMap<string, string | null>;
  /**
   * The source paths the specifier would name, whether or not they exist, in
   * the order resolution tries them; empty for a package. A language whose
   * resolver does not say finds only the files that exist (`resolve`).
   */
  wouldName?(fromFile: string, spec: string): string[];
  /**
   * TypeScript: whether the tsconfig that governs `file` sets
   * `verbatimModuleSyntax`, so `import { type A } from` stays `import {} from`
   * and loads the module. A resolver without it keeps such an import one
   * that runs.
   */
  verbatimModuleSyntax?(file: string): boolean;
}

/**
 * The path an import names when `assumed` holds for it (`assume` in
 * keylang.json): the file `r` resolved it to, or — when no file answers, as
 * in a checkout without the generated or untracked file — a path the
 * specifier would name with the usual extension candidates (`wouldName`,
 * `SourceResolver.wouldName`). Null otherwise.
 */
export function assumedTarget(r: Resolution, wouldName: () => readonly string[], assumed: (path: string) => boolean): string | null {
  if (r.kind === "internal") return assumed(r.file) ? r.file : null;
  if (r.kind !== "unresolved") return null;
  // `src/gen/**` also matches the extensionless `src/gen/x`: the source file is the better name for it.
  const matches = wouldName().filter(assumed);
  return matches.find((path) => languageOf(path) !== undefined) ?? matches[0] ?? null;
}

const EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

interface PathRule {
  pattern: string;
  /** Targets relative to root, already joined with the base directory. */
  targets: string[];
}

export class ImportResolver {
  private readonly root: string;
  /** Per config file: its `baseUrl`/`paths` after `extends`, and those of the projects it `references`. */
  private readonly tsconfigs = new Map<string, LoadedTsconfig>();
  /** Per directory under the root: the `baseUrl`/`paths` that apply to its files. */
  private readonly options = new Map<string, Tsconfig>();
  /** The packages the root `package.json` declares, with their ranges (null: not a string). */
  private readonly declared: Map<string, string | null>;
  /** Workspace globs: root `workspaces`, then `packages` of `pnpm-workspace.yaml`. */
  private readonly workspaces: string[];
  /** A config file's text (null: absent), and its JSONC value (null: absent or no JSON). */
  private readonly text: (file: string) => string | null;
  private readonly read: (file: string) => unknown;
  /** Source files of the analysis: they exist even when the disk does not have them (yet). */
  private readonly sources: ReadonlySet<string>;
  private readonly cache = new Map<string, Resolution>();
  private readonly located = new Map<string, Located>();
  /** Per directory under the root: the packages its own `package.json` declares, with their ranges. */
  private readonly nested = new Map<string, Map<string, string | null>>();
  /** Per directory under the root: the `imports` of its `package.json`, null without one. */
  private readonly scopes = new Map<string, PathRule[] | null>();
  /** Per directory under the root: the tsconfig that governs its files, null without one up to the root. */
  private readonly governing = new Map<string, string | null>();
  /** Per governing tsconfig: whether `verbatimModuleSyntax` holds for its files. */
  private readonly verbatim = new Map<string, boolean>();
  /** Config files read, with their text (null: absent); edges depend on them, so the snapshot id does too. */
  readonly inputs = new Map<string, string | null>();

  constructor(root: string, sources: ReadonlySet<string> = new Set()) {
    this.root = root;
    this.sources = sources;
    // One read per file: the text hashed into the snapshot id is the text parsed.
    const text = (file: string): string | null => {
      const known = this.inputs.get(file);
      const read = known !== undefined ? known : readText(join(root, file));
      this.inputs.set(file, read);
      return read;
    };
    const read = (file: string): unknown => {
      const known = text(file);
      return known === null ? null : parseJsonc(known);
    };
    this.text = text;
    this.read = read;
    // The root config is an input of the snapshot id whether or not a bare import asks for it.
    this.governingConfig(".");
    const pkg = read("package.json") as { workspaces?: unknown } | null;
    this.declared = dependencies(pkg);
    const workspaces = Array.isArray(pkg?.workspaces) ? pkg.workspaces : isObject(pkg?.workspaces) && Array.isArray(pkg.workspaces.packages) ? pkg.workspaces.packages : [];
    // pnpm keeps the list in its own file and hoists no workspace link to the root `node_modules`.
    const pnpm = text("pnpm-workspace.yaml");
    this.workspaces = [...workspaces.filter((w): w is string => typeof w === "string"), ...(pnpm === null ? [] : pnpmWorkspacePackages(pnpm))];
  }

  /**
   * Whether `compilerOptions.verbatimModuleSyntax` holds for `file`: in the
   * tsconfig that governs it — the nearest `tsconfig.json` (else
   * `jsconfig.json`) from its directory up to the root, through `extends` —
   * or in a config that one `references`, since a solution config (Vite's
   * `"files": []`) hands its files to those. Read like `paths`: every config
   * file is an input of the snapshot id, so a changed tsconfig changes edges
   * on the next run. A config keylang cannot read to the end counts as
   * setting it (`verbatimSetting`); no config at all is tsc's default, unset.
   */
  verbatimModuleSyntax(file: string): boolean {
    const config = this.governingConfig(posix.dirname(file));
    if (config === null) return false;
    const known = this.verbatim.get(config);
    if (known !== undefined) return known;
    let held = this.verbatimSetting(config, 0);
    const raw = this.read(config);
    for (const ref of isObject(raw) && Array.isArray(raw.references) ? raw.references : []) {
      if (held === true || held === "unknown") break;
      const target = isObject(ref) && typeof ref.path === "string" ? posix.normalize(posix.join(posix.dirname(config), toPosix(ref.path))) : null;
      if (target === null) held = "unknown";
      // A project outside the root governs no file of this analysis.
      else if (!target.startsWith("../")) held = this.verbatimSetting(target.endsWith(".json") ? target : posix.join(target, "tsconfig.json"), 1);
    }
    const holds = held === true || held === "unknown";
    this.verbatim.set(config, holds);
    return holds;
  }

  /**
   * The `baseUrl`/`paths` that apply to `fromFile`: those of the tsconfig that
   * governs it (`governingConfig`, the same one `verbatimModuleSyntax` reads)
   * after its `extends` chain. A config without `paths` of its own that
   * `references` projects (a solution config, Vite's `"files": []`) lends its
   * files the `paths` of the referenced projects whose directory holds the
   * file (a project config at the root holds every file), as `tsc -b`
   * compiles each file under its own project. Cached per config and per
   * directory; none without a config.
   */
  private optionsFor(fromFile: string): Tsconfig {
    const dir = posix.dirname(fromFile);
    const known = this.options.get(dir);
    if (known !== undefined) return known;
    const config = this.governingConfig(dir);
    let result: Tsconfig = { baseUrl: null, paths: [] };
    if (config !== null) {
      let loaded = this.tsconfigs.get(config);
      if (loaded === undefined) {
        loaded = loadTsconfig(this.read, config);
        this.tsconfigs.set(config, loaded);
      }
      if (loaded.own.paths.length > 0) result = loaded.own;
      else {
        result = { baseUrl: loaded.own.baseUrl, paths: [] };
        for (const ref of loaded.references) {
          if (ref.dir !== "." && dir !== ref.dir && !dir.startsWith(`${ref.dir}/`)) continue;
          result.paths.push(...ref.options.paths);
          result.baseUrl ??= ref.options.baseUrl;
        }
      }
    }
    this.options.set(dir, result);
    return result;
  }

  /** The tsconfig (else jsconfig) of `dir` or the nearest directory above it, up to the root; null without one. */
  private governingConfig(dir: string): string | null {
    const known = this.governing.get(dir);
    if (known !== undefined) return known;
    const at = (name: string): string => (dir === "." ? name : `${dir}/${name}`);
    let found: string | null = null;
    if (this.text(at("tsconfig.json")) !== null) found = at("tsconfig.json");
    else if (this.text(at("jsconfig.json")) !== null) found = at("jsconfig.json");
    else if (dir !== ".") found = this.governingConfig(posix.dirname(dir));
    this.governing.set(dir, found);
    return found;
  }

  /**
   * `verbatimModuleSyntax` as `file` sets it, its own option first, then its
   * `extends` from the last (which tsc lets override the earlier ones).
   * `unknown`: a config in the chain is missing, is no JSON object, is a
   * package keylang does not find, or the chain is deeper than tsc would go.
   */
  private verbatimSetting(file: string, depth: number): boolean | "unset" | "unknown" {
    if (depth > 5) return "unknown";
    const raw = this.read(file);
    if (!isObject(raw)) return "unknown";
    const options = isObject(raw.compilerOptions) ? raw.compilerOptions : {};
    const own = options.verbatimModuleSyntax;
    if (typeof own === "boolean") return own;
    if (own !== undefined) return "unknown";
    const parents: unknown[] = raw.extends === undefined ? [] : Array.isArray(raw.extends) ? raw.extends : [raw.extends];
    for (const parent of [...parents].reverse()) {
      const target = typeof parent === "string" ? this.extendedConfig(posix.dirname(file), parent) : null;
      const setting = target === null ? "unknown" : this.verbatimSetting(target, depth + 1);
      if (setting !== "unset") return setting;
    }
    return "unset";
  }

  /**
   * The config file an `extends` entry of a config in `dir` names, as tsc
   * finds it: a relative path (with `.json` added when the path itself is no
   * file), or a package's config in a `node_modules` from `dir` up to the
   * root — `<pkg>/<path>.json` as written or with `.json` added, the file the
   * `tsconfig` field of its `package.json` names, or its `tsconfig.json`.
   * Null when the entry leads out of the root or no file answers.
   */
  private extendedConfig(dir: string, spec: string): string | null {
    const name = toPosix(spec);
    if (/^\.\.?(\/|$)/.test(name)) {
      const path = posix.normalize(posix.join(dir, name));
      if (path.startsWith("../")) return null;
      return this.text(path) !== null || path.endsWith(".json") ? path : `${path}.json`;
    }
    if (name === "" || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return null;
    for (let at = dir; ; at = posix.dirname(at)) {
      const base = at === "." ? `node_modules/${name}` : `${at}/node_modules/${name}`;
      const field = name.endsWith(".json") ? null : (this.read(`${base}/package.json`) as { tsconfig?: unknown } | null)?.tsconfig;
      const candidates = name.endsWith(".json") ? [base] : [`${base}.json`, ...(typeof field === "string" ? [posix.normalize(posix.join(base, field))] : []), `${base}/tsconfig.json`];
      const found = candidates.find((candidate) => this.text(candidate) !== null);
      if (found !== undefined) return found;
      if (at === ".") return null;
    }
  }

  /**
   * Where `node_modules` at or above the root has the package: a link into the
   * repository is a workspace package. Without an install, a `workspaces`
   * entry of the root `package.json` or a `packages` entry of
   * `pnpm-workspace.yaml` with that `name` is one too. Every answer is an
   * input of the snapshot id: `npm install` changes edges.
   */
  private locate(pkg: string): Located {
    const known = this.located.get(pkg);
    if (known !== undefined) return known;
    let found: Located = null;
    for (let dir = this.root; ; ) {
      const installed = join(dir, "node_modules", pkg);
      if (existsSync(installed)) {
        const rel = inside(this.root, installed);
        found = rel !== null ? { kind: "workspace", dir: rel } : { kind: "installed" };
        break;
      }
      if (existsSync(join(dir, "node_modules/@types", pkg.replace(/^@/, "").replace("/", "__")))) {
        found = { kind: "installed" };
        break;
      }
      const parent = join(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
    if (found === null) {
      const dir = this.workspaceDirs().find((d) => (this.read(`${d}/package.json`) as { name?: unknown } | null)?.name === pkg);
      if (dir !== undefined) found = { kind: "workspace", dir };
    }
    this.located.set(pkg, found);
    this.inputs.set(`node_modules/${pkg}`, found === null ? null : found.kind === "installed" ? "installed" : `workspace ${found.dir}`);
    return found;
  }

  /** Directories the workspace globs name (`packages/*`, `apps/web`): root `workspaces` and pnpm `packages`. */
  private workspaceDirs(): string[] {
    const dirs: string[] = [];
    for (const pattern of this.workspaces) {
      const clean = posix.normalize(toPosix(pattern)).replace(/\/$/, "");
      if (clean.startsWith("../") || clean.startsWith("/")) continue;
      if (!clean.endsWith("/*")) {
        if (!clean.includes("*")) dirs.push(clean);
        continue;
      }
      const base = clean.slice(0, -2);
      if (base.includes("*")) continue;
      const abs = join(this.root, base);
      const entries = existsSync(abs) ? readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${base}/${e.name}`).sort() : [];
      this.inputs.set(`${base}/*`, entries.join("\n"));
      dirs.push(...entries);
    }
    return dirs;
  }

  /**
   * The source file a workspace package names for `subpath` (`""`, `/util`):
   * `exports` (a string, subpaths, `*` patterns, conditions), else `module`,
   * `main`, `index`. A declaration file is not source. Null when none exists.
   */
  private packageEntry(dir: string, subpath: string): string | null {
    const manifest = this.read(`${dir}/package.json`) as { exports?: unknown; module?: unknown; main?: unknown } | null;
    const key = `.${subpath}`;
    const candidates: string[] = [];
    const exports = manifest?.exports;
    if (typeof exports === "string" || Array.isArray(exports)) {
      if (key === ".") candidates.push(...flattenTarget(exports));
    } else if (isObject(exports)) {
      const subpaths = Object.keys(exports).some((k) => k.startsWith("."));
      if (!subpaths) {
        if (key === ".") candidates.push(...flattenTarget(exports));
      } else if (key in exports) candidates.push(...flattenTarget(exports[key]));
      else {
        for (const [pattern, target] of Object.entries(exports)) {
          const m = matchPattern(pattern, key);
          if (m !== null && pattern.includes("*")) candidates.push(...flattenTarget(target).map((t) => t.replace("*", m)));
        }
      }
    } else if (key === ".") {
      for (const field of [manifest?.module, manifest?.main]) if (typeof field === "string") candidates.push(field);
      candidates.push("index");
    } else candidates.push(key);
    for (const target of candidates) {
      if (/\.d\.[cm]?ts$/.test(target)) continue;
      const f = this.probe(posix.join(dir, toPosix(target)));
      if (f && !/\.d\.[cm]?ts$/.test(f)) return f;
    }
    return null;
  }

  resolve(fromFile: string, spec: string): Resolution {
    const key = `${fromFile}\0${spec}`;
    let r = this.cache.get(key);
    if (!r) {
      r = this.resolveUncached(fromFile, spec);
      this.cache.set(key, r);
    }
    return r;
  }

  private resolveUncached(fromFile: string, spec: string): Resolution {
    // Framework-generated type modules (React Router `./+types/route`).
    if (spec.includes("+types/")) return { kind: "generated" };
    if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
      const f = this.probe(posix.join(posix.dirname(fromFile), spec));
      return f ? { kind: "internal", file: f } : { kind: "unresolved" };
    }
    if (spec.startsWith("#")) return this.resolveSubpathImport(fromFile, spec);
    // `tsc` tries only the most specific `paths` pattern, then `baseUrl`, then built-ins and packages.
    const ts = this.optionsFor(fromFile);
    const matched = bestMatch(ts.paths, spec);
    if (matched) {
      for (const t of matched.rule.targets) {
        const f = this.probe(t.replace("*", matched.star));
        if (f) return { kind: "internal", file: f };
      }
    }
    if (ts.baseUrl) {
      const f = this.probe(posix.join(ts.baseUrl, spec));
      if (f) return { kind: "internal", file: f };
    }
    if (isNodeBuiltin(spec)) return { kind: "builtin" };
    return this.resolvePackage(fromFile, spec);
  }

  /**
   * `#alias`: the `imports` of the nearest `package.json` above the importing
   * file, as Node scopes them (an exact key, else the longest pattern prefix).
   * A target that is not a relative path names a package.
   */
  private resolveSubpathImport(fromFile: string, spec: string): Resolution {
    for (let dir = posix.dirname(fromFile); ; dir = posix.dirname(dir)) {
      const scope = dir === "." || dir === "" ? "" : dir;
      const rules = this.scopeImports(scope);
      if (rules !== null) {
        const matched = bestMatch(rules, spec);
        if (!matched) return { kind: "unresolved" };
        for (const t of matched.rule.targets) {
          const target = toPosix(t).replaceAll("*", matched.star);
          if (!target.startsWith(".")) {
            if (target.startsWith("#") || target.startsWith("/")) continue;
            return this.resolve(fromFile, target);
          }
          const f = this.probe(posix.normalize(posix.join(scope, target)));
          if (f) return { kind: "internal", file: f };
        }
        return { kind: "unresolved" };
      }
      if (scope === "") return { kind: "unresolved" };
    }
  }

  /** `imports` of `<dir>/package.json`; an empty list when it has none, null without the file. */
  private scopeImports(dir: string): PathRule[] | null {
    const known = this.scopes.get(dir);
    if (known !== undefined) return known;
    const manifest = this.read(dir === "" ? "package.json" : `${dir}/package.json`);
    const imports = isObject(manifest) && isObject(manifest.imports) ? manifest.imports : {};
    const rules = manifest === null ? null : Object.entries(imports).map(([pattern, t]) => ({ pattern, targets: flattenTarget(t) }));
    this.scopes.set(dir, rules);
    return rules;
  }

  /**
   * A bare specifier's package: a workspace package at the root (`locate`)
   * names its file; one installed at or above the root is external; otherwise
   * the `node_modules` and `package.json` on the way from the file up
   * (`near`), then the root's declaration, decide — and a package nothing
   * declares or installs is unresolved.
   */
  private resolvePackage(fromFile: string, spec: string): Resolution {
    const pkg = packageName(spec);
    const subpath = spec.slice(pkg.length);
    const located = this.locate(pkg);
    if (located?.kind === "workspace") return this.workspaceFile(located.dir, pkg, subpath);
    if (located !== null) return { kind: "external", pkg };
    return this.near(fromFile, pkg, subpath) ?? this.declaredDependency("", this.declared, pkg, subpath) ?? { kind: "unresolved" };
  }

  /** The file a workspace package in `dir` names for `subpath`; unresolved without one (a `dist/` entry keylang does not index). */
  private workspaceFile(dir: string, pkg: string, subpath: string): Resolution {
    const f = this.packageEntry(dir, subpath);
    return f ? { kind: "internal", file: f, workspace: pkg } : { kind: "unresolved" };
  }

  /**
   * The package as Node finds it from `fromFile` up to (not including) the
   * root: in the `node_modules` of a directory on the way — a link into the
   * repository is a workspace package, as pnpm installs them next to the
   * importing package rather than at the root — or declared by that
   * directory's `package.json` (`declaredDependency`). Null when no directory
   * on the way knows it. Each `node_modules` entry found is an input of the
   * snapshot id.
   */
  private near(fromFile: string, pkg: string, subpath: string): Resolution | null {
    for (let dir = posix.dirname(fromFile); dir !== "." && dir !== "" && !dir.startsWith(".."); dir = posix.dirname(dir)) {
      const installed = join(this.root, dir, "node_modules", pkg);
      if (existsSync(installed)) {
        const rel = inside(this.root, installed);
        this.inputs.set(`${dir}/node_modules/${pkg}`, rel === null ? "installed" : `workspace ${rel}`);
        return rel === null ? { kind: "external", pkg } : this.workspaceFile(rel, pkg, subpath);
      }
      let declared = this.nested.get(dir);
      if (declared === undefined) {
        declared = dependencies(this.read(`${dir}/package.json`));
        this.nested.set(dir, declared);
      }
      const r = this.declaredDependency(dir, declared, pkg, subpath);
      if (r !== null) return r;
    }
    return null;
  }

  /**
   * What a `package.json` in `dir` (`""`: the root) says about `pkg` through
   * its dependency fields: null when it does not declare it (nor its
   * `@types`); external for a version range; for a `workspace:`, `file:`,
   * `link:` or `portal:` range this repository's code (ADR 0010) — the
   * directory a `file:`/`link:`/`portal:` path names under the root, else
   * nothing the workspace lists found either, so unresolved, never external.
   * A `file:` tarball (`file:vendor/x.tgz`) is installed code: external.
   */
  private declaredDependency(dir: string, declared: ReadonlyMap<string, string | null>, pkg: string, subpath: string): Resolution | null {
    const types = `@types/${pkg.replace(/^@/, "").replace("/", "__")}`;
    const range = declared.has(pkg) ? declared.get(pkg)! : declared.has(types) ? declared.get(types)! : undefined;
    if (range === undefined) return null;
    if (range === null || !LOCAL_RANGE.test(range)) return { kind: "external", pkg };
    if (range.startsWith("workspace:")) return { kind: "unresolved" };
    const target = toPosix(range.replace(LOCAL_RANGE, ""));
    if (/\.(tgz|tar\.gz|tar)$/.test(target)) return { kind: "external", pkg };
    const at = posix.normalize(posix.join(dir === "" ? "." : dir, target));
    if (at === ".." || at.startsWith("../") || at.startsWith("/")) return { kind: "unresolved" };
    return this.workspaceFile(at, pkg, subpath);
  }

  /** Candidate file (POSIX, relative to root) → existing source file, or null. */
  private probe(candidate: string): string | null {
    for (const p of probeCandidates(candidate)) {
      if (this.sources.has(p)) return p;
      const abs = join(this.root, p);
      if (existsSync(abs) && statSync(abs).isFile()) return p;
    }
    return null;
  }

  /**
   * The paths a relative specifier, the `imports` of the nearest
   * `package.json`, the most specific `paths` pattern or `baseUrl` would name,
   * each with the candidates `probe` tries, whether they exist or not.
   */
  wouldName(fromFile: string, spec: string): string[] {
    if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") return probeCandidates(posix.join(posix.dirname(fromFile), spec));
    const out: string[] = [];
    if (spec.startsWith("#")) {
      for (let dir = posix.dirname(fromFile); ; dir = posix.dirname(dir)) {
        const scope = dir === "." || dir === "" ? "" : dir;
        const rules = this.scopeImports(scope);
        if (rules !== null) {
          // Only relative targets name files; a target that is a package is not this repository's.
          const matched = bestMatch(rules, spec);
          if (matched) {
            for (const t of matched.rule.targets) {
              const target = toPosix(t).replaceAll("*", matched.star);
              if (target.startsWith(".")) out.push(...probeCandidates(posix.join(scope, target)));
            }
          }
          return out;
        }
        if (scope === "") return out;
      }
    }
    const ts = this.optionsFor(fromFile);
    const matched = bestMatch(ts.paths, spec);
    if (matched) for (const t of matched.rule.targets) out.push(...probeCandidates(t.replace("*", matched.star)));
    if (ts.baseUrl) out.push(...probeCandidates(posix.join(ts.baseUrl, spec)));
    return out;
  }
}

/**
 * The files a candidate path may be, in the order resolution tries them: as
 * written, the NodeNext swaps (`./x.js` written for `./x.ts`, `.tsx` or
 * `.jsx`; `./x.jsx` for `./x.tsx`), with each extension, then its index
 * file. None for a path that leaves the root.
 */
function probeCandidates(candidate: string): string[] {
  const c = posix.normalize(candidate);
  if (c.startsWith("../")) return [];
  const swapped = /\.[cm]?js$/.test(c) ? [c.replace(/\.js$/, ".ts").replace(/\.mjs$/, ".mts").replace(/\.cjs$/, ".cts"), c.replace(/\.js$/, ".tsx"), c.replace(/\.js$/, ".jsx")] : /\.jsx$/.test(c) ? [c.replace(/\.jsx$/, ".tsx")] : [];
  return [c, ...swapped, ...EXTS.map((e) => c + e), ...EXTS.map((e) => posix.join(c, `index${e}`))];
}

type Located = { kind: "workspace"; dir: string } | { kind: "installed" } | null;

/** `abs` (after links) as a POSIX path under `root`, outside any `node_modules`; null otherwise. */
function inside(root: string, abs: string): string | null {
  let real: string;
  let base: string;
  try {
    real = realpathSync(abs);
    base = realpathSync(root);
  } catch {
    return null;
  }
  const rel = relative(base, real);
  if (rel === "" || rel.startsWith("..") || rel.startsWith(sep) || /^[A-Za-z]:/.test(rel)) return null;
  const posixRel = toPosix(rel);
  return posixRel.split("/").includes("node_modules") ? null : posixRel;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ranges that name code in this repository rather than a version to install (as `src/declared-packages.ts` reads them). */
const LOCAL_RANGE = /^(workspace|file|link|portal):/;

/** The packages a manifest's dependency fields declare: name → range as written (null when it is no string); the first field that has a name wins. */
function dependencies(manifest: unknown): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = isObject(manifest) ? manifest[field] : undefined;
    if (!isObject(deps)) continue;
    for (const [name, range] of Object.entries(deps)) if (!out.has(name)) out.set(name, typeof range === "string" ? range : null);
  }
  return out;
}

/**
 * The `packages` globs of a `pnpm-workspace.yaml`: the block list under the
 * key (items quoted or bare, a trailing `# comment` dropped) or an inline
 * `[a, b]` list. An exclusion (`!**\/test/**`) names no directory. Any other
 * key of the file is ignored.
 */
export function pnpmWorkspacePackages(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages:/.test(line));
  if (start === -1) return [];
  const unquote = (item: string): string => item.trim().replace(/\s+#.*$/, "").trim().replace(/^(['"])(.*)\1$/, "$2");
  const inline = lines[start]!.slice("packages:".length).trim();
  const items: string[] = [];
  if (inline.startsWith("[")) {
    const end = inline.indexOf("]");
    items.push(...(end === -1 ? inline.slice(1) : inline.slice(1, end)).split(",").map(unquote));
  } else {
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\s*(#|$)/.test(line)) continue;
      const item = /^\s*-\s*(.*)$/.exec(line);
      if (item === null) break;
      items.push(unquote(item[1]!));
    }
  }
  return items.filter((item) => item !== "" && !item.startsWith("!"));
}

/**
 * The rule `tsc` (`matchPatternOrExact`) and Node (`PATTERN_KEY_COMPARE`)
 * apply: an exact key, else the matching pattern with the longest prefix
 * before `*` (then the longer key), else the first in the file. `star` is the
 * text the `*` stands for.
 */
function bestMatch(rules: readonly PathRule[], spec: string): { rule: PathRule; star: string } | null {
  let best: { rule: PathRule; star: string; prefix: number } | null = null;
  for (const rule of rules) {
    const star = matchPattern(rule.pattern, spec);
    if (star === null) continue;
    if (!rule.pattern.includes("*")) return { rule, star };
    const prefix = rule.pattern.indexOf("*");
    if (!best || prefix > best.prefix || (prefix === best.prefix && rule.pattern.length > best.rule.pattern.length)) best = { rule, star, prefix };
  }
  return best && { rule: best.rule, star: best.star };
}

function matchPattern(pattern: string, spec: string): string | null {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === spec ? "" : null;
  const pre = pattern.slice(0, star);
  const post = pattern.slice(star + 1);
  if (spec.startsWith(pre) && spec.endsWith(post) && spec.length >= pre.length + post.length) {
    return spec.slice(pre.length, spec.length - post.length);
  }
  return null;
}

function flattenTarget(t: unknown): string[] {
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.flatMap(flattenTarget);
  if (t && typeof t === "object") return Object.values(t).flatMap(flattenTarget);
  return [];
}

export function packageName(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/** JSON with comments and trailing commas (tsconfig style). */
export function readJsonc(path: string): unknown {
  const text = readText(path);
  return text === null ? null : parseJsonc(text);
}

/** The value of JSONC text; null when it does not parse. */
export function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(stripJsonc(text));
  } catch {
    return null;
  }
}

/** The value of JSONC text; throws the `JSON.parse` error when it does not parse. */
export function parseJsoncStrict(text: string): unknown {
  return JSON.parse(stripJsonc(text));
}

/**
 * A file's text, or null when the path is no regular file (missing, or a
 * directory, as `configs/base/` beside `configs/base.json` when `extends`
 * names `./configs/base`) or cannot be read — tsc's `fileExists`, so an
 * `extends` without `.json` falls back to `<path>.json` instead of failing.
 */
function readText(path: string): string | null {
  try {
    return statSync(path).isFile() ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

/** Remove comments and trailing commas outside of strings. */
function stripJsonc(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

interface Tsconfig {
  baseUrl: string | null;
  paths: PathRule[];
}

/** One config file as `optionsFor` combines it: its own options, and those of each project it `references` with that project's directory. */
interface LoadedTsconfig {
  own: Tsconfig;
  references: { dir: string; options: Tsconfig }[];
}

/** Options of one config after its `extends` chain, before `paths` targets are placed. */
interface MergedOptions {
  baseUrl: string | null;
  /** `paths` as written, with the directory of the config that declares them. */
  paths: { rules: Record<string, unknown>; dir: string } | null;
}

/**
 * `compilerOptions.baseUrl`/`paths` of one config following relative
 * `extends` chains. As in `tsc`, `paths` targets resolve against the
 * `baseUrl` of the final options (a child config's `baseUrl` moves inherited
 * `paths` too), or the directory of the config that declares them. The
 * projects the config `references` (a solution config, `"files": []` with
 * `references`, the Vite template) come with their options and their
 * directory, for `optionsFor` to hand to the files under each; a project
 * outside the root is skipped.
 */
function loadTsconfig(read: (file: string) => unknown, file: string): LoadedTsconfig {
  const own = mergedOptions(read, file, 0);
  const result: LoadedTsconfig = { own: { baseUrl: own.baseUrl, paths: placePaths(own) }, references: [] };
  // Own `paths` win outright, so the referenced configs are read (and become inputs) only when they can matter.
  if (result.own.paths.length > 0) return result;
  const raw = read(file);
  const references = isObject(raw) && Array.isArray(raw.references) ? raw.references : [];
  const dir = posix.dirname(toPosix(file));
  for (const ref of references) {
    if (!isObject(ref) || typeof ref.path !== "string") continue;
    const target = posix.normalize(posix.join(dir, toPosix(ref.path)));
    const refFile = target.endsWith(".json") ? target : posix.join(target, "tsconfig.json");
    if (refFile.startsWith("../")) continue;
    const referenced = mergedOptions(read, refFile, 1);
    result.references.push({ dir: posix.dirname(refFile), options: { baseUrl: referenced.baseUrl, paths: placePaths(referenced) } });
  }
  return result;
}

function mergedOptions(read: (file: string) => unknown, file: string, depth: number): MergedOptions {
  const raw = read(file);
  let result: MergedOptions = { baseUrl: null, paths: null };
  if (!isObject(raw) || depth > 5) return result;
  const dir = posix.dirname(toPosix(file));
  const parents = typeof raw.extends === "string" ? [raw.extends] : Array.isArray(raw.extends) ? raw.extends.filter((e): e is string => typeof e === "string") : [];
  for (const e of parents) {
    if (!e.startsWith(".")) continue; // package configs (`@tsconfig/node22`) carry no paths
    const parentFile = posix.normalize(posix.join(dir, e.endsWith(".json") ? e : `${e}.json`));
    if (parentFile.startsWith("../")) continue;
    const p = mergedOptions(read, parentFile, depth + 1);
    result = { baseUrl: p.baseUrl ?? result.baseUrl, paths: p.paths ?? result.paths };
  }
  const co = isObject(raw.compilerOptions) ? raw.compilerOptions : {};
  if (typeof co.baseUrl === "string" && co.baseUrl !== "") result.baseUrl = posix.normalize(posix.join(dir, toPosix(co.baseUrl)));
  if (isObject(co.paths)) result.paths = { rules: co.paths, dir };
  return result;
}

function placePaths(options: MergedOptions): PathRule[] {
  if (!options.paths) return [];
  const base = options.baseUrl ?? options.paths.dir;
  return Object.entries(options.paths.rules).map(([pattern, targets]) => ({
    pattern,
    targets: (Array.isArray(targets) ? targets : []).filter((t): t is string => typeof t === "string").map((t) => posix.normalize(posix.join(base, toPosix(t)))),
  }));
}
