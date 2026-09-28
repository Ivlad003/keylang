// Import specifier → file. Relative paths with extension probing, `tsconfig`
// (or `jsconfig`, and the configs it `references`) `paths`/`baseUrl`,
// `package.json` `imports` (`#alias`), Node built-ins. A bare specifier is an
// external package only when the project declares or installs it — at the
// root, or in a `package.json` / `node_modules` between the importing file and
// the root, as Node looks for it (`web/package.json` of a monorepo); any other
// is unresolved — an alias keylang does not know is a hole, not a package.
// A workspace package (a `node_modules` link into the repository, or a
// `workspaces` entry) is internal: its `exports`/`module`/`main` name the file.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { posix } from "node:path";
import { toPosix } from "./config.ts";
import { isNodeBuiltin } from "./extract/ts.ts";

export type Resolution =
  /** `workspace`: the package that names the file, when a workspace package resolved it. */
  /** `whole`: the specifier names the module itself, so a named binding is the module (Rust `use crate::a`). */
  | { kind: "internal"; file: string; workspace?: string; whole?: true }
  /** The specifier names the importing file itself (Rust `use self::X`): no dependency. */
  | { kind: "local" }
  | { kind: "external"; pkg: string }
  | { kind: "builtin" }
  | { kind: "generated" }
  | { kind: "unresolved" };

export interface SourceResolver {
  resolve(fromFile: string, spec: string): Resolution;
  /** Config files read, with their text (null: absent); the snapshot id depends on them. */
  readonly inputs: ReadonlyMap<string, string | null>;
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
  private readonly pkgImports: PathRule[];
  private readonly packages: Set<string>;
  private readonly workspaces: string[];
  private readonly read: (file: string) => unknown;
  private readonly cache = new Map<string, Resolution>();
  private readonly located = new Map<string, Located>();
  /** Per directory under the root: the packages its own `package.json` declares. */
  private readonly nested = new Map<string, Set<string>>();
  /** Config files read, with their text (null: absent); edges depend on them, so the snapshot id does too. */
  readonly inputs = new Map<string, string | null>();

  constructor(root: string) {
    this.root = root;
    const read = (file: string): unknown => {
      const abs = join(root, file);
      this.inputs.set(file, existsSync(abs) ? readFileSync(abs, "utf8") : null);
      return readJsonc(abs);
    };
    this.read = read;
    const configFile = existsSync(join(root, "tsconfig.json")) || !existsSync(join(root, "jsconfig.json")) ? "tsconfig.json" : "jsconfig.json";
    const ts = loadTsconfig(read, configFile, 0);
    this.baseUrl = ts.baseUrl;
    this.paths = ts.paths;
    const pkg = read("package.json") as { imports?: Record<string, unknown>; dependencies?: object; devDependencies?: object; peerDependencies?: object; optionalDependencies?: object; workspaces?: unknown } | null;
    this.pkgImports = Object.entries(pkg?.imports ?? {}).map(([pattern, t]) => ({ pattern, targets: flattenTarget(t) }));
    this.packages = new Set([pkg?.dependencies, pkg?.devDependencies, pkg?.peerDependencies, pkg?.optionalDependencies].flatMap((deps) => Object.keys(deps ?? {})));
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
    if (spec.startsWith("#")) {
      for (const rule of this.pkgImports) {
        const m = matchPattern(rule.pattern, spec);
        if (m === null) continue;
        for (const t of rule.targets) {
          const f = this.probe(posix.normalize(toPosix(t).replace("*", m)));
          if (f) return { kind: "internal", file: f };
        }
      }
      return { kind: "unresolved" };
    }
    if (isNodeBuiltin(spec)) return { kind: "builtin" };
    for (const rule of this.paths) {
      const m = matchPattern(rule.pattern, spec);
      if (m === null) continue;
      for (const t of rule.targets) {
        const f = this.probe(t.replace("*", m));
        if (f) return { kind: "internal", file: f };
      }
    }
    if (this.baseUrl) {
      const f = this.probe(posix.join(this.baseUrl, spec));
      if (f) return { kind: "internal", file: f };
    }
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
    const c = posix.normalize(candidate);
    if (c.startsWith("../")) return null;
    const tryFile = (p: string): string | null => {
      const abs = join(this.root, p);
      return existsSync(abs) && statSync(abs).isFile() ? p : null;
    };
    // NodeNext style: `./x.js` written for `./x.ts`.
    const swapped = /\.[cm]?js$/.exec(c) ? c.replace(/\.js$/, ".ts").replace(/\.mjs$/, ".mts").replace(/\.cjs$/, ".cts") : null;
    for (const p of [c, swapped, c.replace(/\.js$/, ".tsx")]) {
      if (p) {
        const f = tryFile(p);
        if (f) return f;
      }
    }
    for (const e of EXTS) {
      const f = tryFile(c + e);
      if (f) return f;
    }
    for (const e of EXTS) {
      const f = tryFile(posix.join(c, `index${e}`));
      if (f) return f;
    }
    return null;
  }
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
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(stripJsonc(readFileSync(path, "utf8")));
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

/**
 * `compilerOptions.baseUrl`/`paths` following relative `extends` chains.
 * `paths` targets resolve against `baseUrl`, or the directory of the config
 * that declares them. A solution config (`"files": []` with `references`, the
 * Vite template) takes the `paths` of the configs it references.
 */
function loadTsconfig(read: (file: string) => unknown, file: string, depth: number): Tsconfig {
  const raw = read(file) as { extends?: string | string[]; references?: { path?: string }[]; compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | null;
  let result: Tsconfig = { baseUrl: null, paths: [] };
  if (!raw || depth > 5) return result;
  const dir = posix.dirname(toPosix(file));
  const parents = typeof raw.extends === "string" ? [raw.extends] : (raw.extends ?? []);
  for (const e of parents) {
    if (!e.startsWith(".")) continue; // package configs (`@tsconfig/node22`) carry no paths
    const parentFile = posix.normalize(posix.join(dir, e.endsWith(".json") ? e : `${e}.json`));
    if (parentFile.startsWith("../")) continue;
    const p = loadTsconfig(read, parentFile, depth + 1);
    result = { baseUrl: p.baseUrl ?? result.baseUrl, paths: p.paths.length > 0 ? p.paths : result.paths };
  }
  const co = raw.compilerOptions;
  if (co?.baseUrl) result.baseUrl = posix.normalize(posix.join(dir, toPosix(co.baseUrl)));
  if (co?.paths) {
    const base = result.baseUrl ?? dir;
    result.paths = Object.entries(co.paths).map(([pattern, targets]) => ({ pattern, targets: targets.map((t) => posix.normalize(posix.join(base, toPosix(t)))) }));
  }
  if (depth === 0 && result.paths.length === 0) {
    for (const ref of raw.references ?? []) {
      if (typeof ref?.path !== "string") continue;
      const target = posix.normalize(posix.join(dir, toPosix(ref.path)));
      const refFile = target.endsWith(".json") ? target : posix.join(target, "tsconfig.json");
      if (refFile.startsWith("../")) continue;
      const p = loadTsconfig(read, refFile, depth + 1);
      result.paths.push(...p.paths);
      result.baseUrl ??= p.baseUrl;
    }
  }
  return result;
}
