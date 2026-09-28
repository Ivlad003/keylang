// Rust path → file. A crate is a directory with `Cargo.toml` and `src/`;
// `crate::a::b` is `src/a/b.rs` or `src/a/b/mod.rs`, the crate root is
// `src/lib.rs` (else `src/main.rs`). `self`/`super` start at the importing
// file's module, a workspace member's name at that crate's root, a
// `[dependencies]` name is an external package. The longest prefix of the
// path that is a module names the file; when that is the whole path, the
// import binds the module itself. Anything else is unresolved.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Resolution, SourceResolver } from "./imports.ts";
import { globToRegExp } from "./glob.ts";

/** Crates of the toolchain: always there, never in `Cargo.toml`. */
const TOOLCHAIN = new Set(["std", "core", "alloc", "proc_macro", "test"]);

interface Crate {
  /** Directory of `Cargo.toml`, POSIX, relative to the root ("" for the root). */
  dir: string;
  /** Crate name as code writes it (`-` → `_`). */
  name: string | null;
  /** Directory of the crate root file (`src`). */
  src: string;
  /** Names code uses for dependencies → the package name. */
  deps: Map<string, string>;
}

export class RustResolver implements SourceResolver {
  private readonly root: string;
  private readonly crates = new Map<string, Crate | null>();
  private readonly members = new Map<string, Crate>();
  readonly inputs = new Map<string, string | null>();

  constructor(root: string) {
    this.root = root;
    const top = this.crateAt("");
    for (const dir of this.workspaceMembers()) {
      const crate = this.crateAt(dir);
      if (crate?.name) this.members.set(crate.name, crate);
    }
    if (top?.name) this.members.set(top.name, top);
  }

  resolve(fromFile: string, spec: string): Resolution {
    const crate = this.crateOf(fromFile);
    if (!crate) return { kind: "unresolved" };
    const segments = spec.split("::");
    const head = segments[0]!;
    const here = modulePath(crate, fromFile);
    let target = crate;
    let base: string[];
    let rest: string[];
    if (head === "crate") {
      // `build.rs` and other files outside `src/` are crate roots of their own.
      if (here === null) return { kind: "unresolved" };
      base = [];
      rest = segments.slice(1);
    } else if (head === "self" || head === "super") {
      if (here === null) return { kind: "unresolved" };
      base = here;
      rest = segments;
      if (rest[0] === "self") rest = rest.slice(1);
      while (rest[0] === "super") {
        if (base.length === 0) return { kind: "unresolved" };
        base = base.slice(0, -1);
        rest = rest.slice(1);
      }
    } else if (TOOLCHAIN.has(head)) {
      return { kind: "external", pkg: head };
    } else if (this.members.has(head)) {
      target = this.members.get(head)!;
      base = [];
      rest = segments.slice(1);
    } else if (crate.deps.has(head)) {
      return { kind: "external", pkg: crate.deps.get(head)! };
    } else {
      // Edition 2018: a path may start at a child of the current module.
      if (here === null || this.moduleFile(crate, [...here, head]) === null) return { kind: "unresolved" };
      base = here;
      rest = segments;
    }
    for (let k = rest.length; k >= 0; k--) {
      const file = this.moduleFile(target, [...base, ...rest.slice(0, k)]);
      if (file === null) continue;
      if (file === fromFile) return { kind: "local" };
      return k === rest.length ? { kind: "internal", file, whole: true } : { kind: "internal", file };
    }
    return { kind: "unresolved" };
  }

  /** The file of a module path, or null: `a/b.rs`, `a/b/mod.rs`, the crate root for `[]`. */
  private moduleFile(crate: Crate, path: string[]): string | null {
    const candidates = path.length === 0 ? ["lib.rs", "main.rs"] : [`${path.join("/")}.rs`, `${path.join("/")}/mod.rs`];
    for (const c of candidates) {
      const file = posix.join(crate.src, c);
      if (existsSync(join(this.root, file))) return file;
    }
    return null;
  }

  private crateOf(file: string): Crate | null {
    for (let dir = posix.dirname(file); ; dir = posix.dirname(dir)) {
      const at = dir === "." ? "" : dir;
      const crate = this.crateAt(at);
      if (crate) return crate;
      if (at === "") return null;
    }
  }

  private crateAt(dir: string): Crate | null {
    const cached = this.crates.get(dir);
    if (cached !== undefined) return cached;
    const manifest = this.readToml(posix.join(dir, "Cargo.toml"));
    let crate: Crate | null = null;
    if (manifest && isObject(manifest.package)) {
      const pkg = manifest.package;
      const lib = isObject(manifest.lib) && typeof manifest.lib.path === "string" ? manifest.lib.path : null;
      const name = typeof pkg.name === "string" ? pkg.name.replace(/-/g, "_") : null;
      const deps = new Map<string, string>();
      // `[target.'cfg(…)'.dependencies]` add platform-specific ones.
      const targets = isObject(manifest.target) ? Object.values(manifest.target).filter(isObject) : [];
      const tables = [manifest, ...targets].flatMap((t) => [t.dependencies, t["dev-dependencies"], t["build-dependencies"]]);
      for (const table of tables) {
        if (!isObject(table)) continue;
        for (const [key, value] of Object.entries(table)) {
          const renamed = isObject(value) && typeof value.package === "string" ? value.package : key;
          deps.set(key.replace(/-/g, "_"), renamed);
        }
      }
      crate = { dir, name, src: posix.join(dir, lib ? posix.dirname(lib) : "src"), deps };
    }
    this.crates.set(dir, crate);
    return crate;
  }

  /** `[workspace] members` of the root manifest, globs expanded one directory level at a time. */
  private workspaceMembers(): string[] {
    const manifest = this.readToml("Cargo.toml");
    const workspace = manifest && isObject(manifest.workspace) ? manifest.workspace : null;
    const members = Array.isArray(workspace?.members) ? workspace.members.filter((m): m is string => typeof m === "string") : [];
    const out: string[] = [];
    for (const member of members) {
      if (!/[*?[{]/.test(member)) {
        out.push(posix.normalize(member));
        continue;
      }
      const parent = member.slice(0, member.lastIndexOf("/") + 1);
      const pattern = globToRegExp(member);
      const abs = join(this.root, parent);
      if (!existsSync(abs)) continue;
      for (const name of readdirNames(abs)) if (pattern.test(`${parent}${name}`)) out.push(`${parent}${name}`);
    }
    return out.sort();
  }

  private readToml(file: string): Record<string, unknown> | null {
    const abs = join(this.root, file);
    if (!existsSync(abs)) {
      this.inputs.set(file, null);
      return null;
    }
    const text = readFileSync(abs, "utf8");
    this.inputs.set(file, text);
    try {
      return parseToml(text) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`${file}: invalid TOML: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** Module path of a file inside its crate: `src/a/b.rs` → `[a, b]`, `src/a/mod.rs` → `[a]`, the root → `[]`; null outside `src`. */
function modulePath(crate: Crate, file: string): string[] | null {
  const prefix = crate.src === "" ? "" : `${crate.src}/`;
  if (!file.startsWith(prefix)) return null;
  const parts = file.slice(prefix.length).replace(/\.rs$/, "").split("/");
  if (parts.length === 1 && (parts[0] === "lib" || parts[0] === "main")) return [];
  if (parts.at(-1) === "mod") parts.pop();
  return parts;
}

function readdirNames(abs: string): string[] {
  return readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
