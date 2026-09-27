// Import specifier → file. Relative paths with extension probing, `tsconfig`
// `paths`/`baseUrl`, `package.json` `imports` (`#alias`), bare specifiers as
// external packages, Node built-ins.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { posix } from "node:path";
import { toPosix } from "./config.ts";
import { isNodeBuiltin } from "./extract/ts.ts";

export type Resolution =
  | { kind: "internal"; file: string }
  | { kind: "external"; pkg: string }
  | { kind: "builtin" }
  | { kind: "generated" }
  | { kind: "unresolved" };

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
  private readonly cache = new Map<string, Resolution>();

  constructor(root: string) {
    this.root = root;
    const ts = loadTsconfig(root, "tsconfig.json", 0);
    this.baseUrl = ts.baseUrl;
    this.paths = ts.paths;
    const pkg = readJsonc(join(root, "package.json")) as { imports?: Record<string, unknown> } | null;
    this.pkgImports = Object.entries(pkg?.imports ?? {}).map(([pattern, t]) => ({ pattern, targets: flattenTarget(t) }));
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
    return { kind: "external", pkg: packageName(spec) };
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
 * that declares them.
 */
function loadTsconfig(root: string, file: string, depth: number): Tsconfig {
  const raw = readJsonc(join(root, file)) as { extends?: string | string[]; compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | null;
  let result: Tsconfig = { baseUrl: null, paths: [] };
  if (!raw || depth > 5) return result;
  const dir = posix.dirname(toPosix(file));
  const parents = typeof raw.extends === "string" ? [raw.extends] : (raw.extends ?? []);
  for (const e of parents) {
    if (!e.startsWith(".")) continue; // package configs (`@tsconfig/node22`) carry no paths
    const parentFile = posix.normalize(posix.join(dir, e.endsWith(".json") ? e : `${e}.json`));
    if (parentFile.startsWith("../")) continue;
    const p = loadTsconfig(root, parentFile, depth + 1);
    result = { baseUrl: p.baseUrl ?? result.baseUrl, paths: p.paths.length > 0 ? p.paths : result.paths };
  }
  const co = raw.compilerOptions;
  if (co?.baseUrl) result.baseUrl = posix.normalize(posix.join(dir, toPosix(co.baseUrl)));
  if (co?.paths) {
    const base = result.baseUrl ?? dir;
    result.paths = Object.entries(co.paths).map(([pattern, targets]) => ({ pattern, targets: targets.map((t) => posix.normalize(posix.join(base, toPosix(t)))) }));
  }
  return result;
}
