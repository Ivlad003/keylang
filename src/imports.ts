// Import specifier → file. Relative paths with extension probing, `tsconfig`
// (or `jsconfig`, and the configs it `references`) `paths`/`baseUrl`,
// `package.json` `imports` (`#alias`), Node built-ins. A bare specifier goes
// through `paths` (the most specific pattern, as `tsc` picks it) and
// `baseUrl` before it is a built-in or a package, so an alias named like a
// built-in (`constants`, `events`) is the project's file. A bare specifier is an
// external package only when the project declares or installs it — at the
// root, or in a `package.json` / `node_modules` between the importing file and
// the root, as Node looks for it (`web/package.json` of a monorepo); any other
// is unresolved — an alias keylang does not know is a hole, not a package.
// A workspace package (a `node_modules` link into the repository, or a
// `workspaces` entry) is internal: its `exports`/`module`/`main` name the file.
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
  private readonly baseUrl: string | null;
  private readonly paths: PathRule[];
  private readonly packages: Set<string>;
  private readonly workspaces: string[];
  private readonly read: (file: string) => unknown;
  /** Source files of the analysis: they exist even when the disk does not have them (yet). */
  private readonly sources: ReadonlySet<string>;
  private readonly cache = new Map<string, Resolution>();
  private readonly located = new Map<string, Located>();
  /** Per directory under the root: the packages its own `package.json` declares. */
  private readonly nested = new Map<string, Set<string>>();
  /** Per directory under the root: the `imports` of its `package.json`, null without one. */
  private readonly scopes = new Map<string, PathRule[] | null>();
  /** Config files read, with their text (null: absent); edges depend on them, so the snapshot id does too. */
  readonly inputs = new Map<string, string | null>();

  constructor(root: string, sources: ReadonlySet<string> = new Set()) {
    this.root = root;
    this.sources = sources;
    // One read per file: the text hashed into the snapshot id is the text parsed.
    const read = (file: string): unknown => {
      const known = this.inputs.get(file);
      const text = known !== undefined ? known : readText(join(root, file));
      this.inputs.set(file, text);
      return text === null ? null : parseJsonc(text);
    };
    this.read = read;
    const configFile = existsSync(join(root, "tsconfig.json")) || !existsSync(join(root, "jsconfig.json")) ? "tsconfig.json" : "jsconfig.json";
    const ts = loadTsconfig(read, configFile);
    this.baseUrl = ts.baseUrl;
    this.paths = ts.paths;
    const pkg = read("package.json") as { dependencies?: object; devDependencies?: object; peerDependencies?: object; optionalDependencies?: object; workspaces?: unknown } | null;
    this.packages = new Set([pkg?.dependencies, pkg?.devDependencies, pkg?.peerDependencies, pkg?.optionalDependencies].flatMap((deps) => (isObject(deps) ? Object.keys(deps) : [])));
    const workspaces = Array.isArray(pkg?.workspaces) ? pkg.workspaces : isObject(pkg?.workspaces) && Array.isArray(pkg.workspaces.packages) ? pkg.workspaces.packages : [];
    this.workspaces = workspaces.filter((w): w is string => typeof w === "string");
  }

  /** A package the project declares, or one installed in a `node_modules` at or above the root. */
  private known(pkg: string): boolean {
    if (this.packages.has(pkg) || this.packages.has(`@types/${pkg.replace(/^@/, "").replace("/", "__")}`)) return true;
    return this.locate(pkg) !== null;
  }

  /**
   * Where `node_modules` at or above the root has the package: a link into the
   * repository is a workspace package. Without an install, a `workspaces`
   * entry of the root `package.json` with that `name` is one too. Every answer
   * is an input of the snapshot id: `npm install` changes edges.
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

  /** Directories the root `workspaces` globs name (`packages/*`, `apps/web`). */
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
    const matched = bestMatch(this.paths, spec);
    if (matched) {
      for (const t of matched.rule.targets) {
        const f = this.probe(t.replace("*", matched.star));
        if (f) return { kind: "internal", file: f };
      }
    }
    if (this.baseUrl) {
      const f = this.probe(posix.join(this.baseUrl, spec));
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

  private resolvePackage(fromFile: string, spec: string): Resolution {
    const pkg = packageName(spec);
    const located = this.locate(pkg);
    if (located?.kind === "workspace") {
      const f = this.packageEntry(located.dir, spec.slice(pkg.length));
      return f ? { kind: "internal", file: f, workspace: pkg } : { kind: "unresolved" };
    }
    return this.known(pkg) || this.knownNear(fromFile, pkg) ? { kind: "external", pkg } : { kind: "unresolved" };
  }

  /** Declared in, or installed next to, a `package.json` between `fromFile` and the root. */
  private knownNear(fromFile: string, pkg: string): boolean {
    for (let dir = posix.dirname(fromFile); dir !== "." && dir !== "" && !dir.startsWith(".."); dir = posix.dirname(dir)) {
      let declared = this.nested.get(dir);
      if (declared === undefined) {
        const manifest = this.read(`${dir}/package.json`) as Record<string, unknown> | null;
        declared = new Set(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) => (isObject(manifest?.[k]) ? Object.keys(manifest[k]) : [])));
        this.nested.set(dir, declared);
      }
      if (declared.has(pkg) || declared.has(`@types/${pkg.replace(/^@/, "").replace("/", "__")}`)) return true;
      const installed = existsSync(join(this.root, dir, "node_modules", pkg));
      if (installed) {
        this.inputs.set(`${dir}/node_modules/${pkg}`, "installed");
        return true;
      }
    }
    return false;
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
    const matched = bestMatch(this.paths, spec);
    if (matched) for (const t of matched.rule.targets) out.push(...probeCandidates(t.replace("*", matched.star)));
    if (this.baseUrl) out.push(...probeCandidates(posix.join(this.baseUrl, spec)));
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

/** A file's text, or null when it is missing. */
function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
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

/** Options of one config after its `extends` chain, before `paths` targets are placed. */
interface MergedOptions {
  baseUrl: string | null;
  /** `paths` as written, with the directory of the config that declares them. */
  paths: { rules: Record<string, unknown>; dir: string } | null;
}

/**
 * `compilerOptions.baseUrl`/`paths` following relative `extends` chains.
 * As in `tsc`, `paths` targets resolve against the `baseUrl` of the final
 * options (a child config's `baseUrl` moves inherited `paths` too), or the
 * directory of the config that declares them. A solution config (`"files": []`
 * with `references`, the Vite template) takes the `paths` of the configs it references.
 */
function loadTsconfig(read: (file: string) => unknown, file: string): Tsconfig {
  const own = mergedOptions(read, file, 0);
  const result: Tsconfig = { baseUrl: own.baseUrl, paths: placePaths(own) };
  if (result.paths.length > 0) return result;
  const raw = read(file);
  const references = isObject(raw) && Array.isArray(raw.references) ? raw.references : [];
  const dir = posix.dirname(toPosix(file));
  for (const ref of references) {
    if (!isObject(ref) || typeof ref.path !== "string") continue;
    const target = posix.normalize(posix.join(dir, toPosix(ref.path)));
    const refFile = target.endsWith(".json") ? target : posix.join(target, "tsconfig.json");
    if (refFile.startsWith("../")) continue;
    const referenced = mergedOptions(read, refFile, 1);
    result.paths.push(...placePaths(referenced));
    result.baseUrl ??= referenced.baseUrl;
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
