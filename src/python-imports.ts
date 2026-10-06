// Python dotted path → file. `.m.x` starts at the importing file's package
// (one dot per level), `a.b.x` at a source root (the repository root, then
// `src/`). A module is `p.py` or the package `p/__init__.py`; the longest
// prefix of the path that is a module names the file, and when that is the
// whole path the import binds the module itself. The last segment is the
// imported name (`from m import x` is `m.x`), so the prefix is never shorter
// than the module the statement names: `from .missing import x` of a module
// that does not exist is unresolved, not a name of the package above it. In
// `m.*` (`from m import *`) the module is `m` itself. A top-level name found in
// no source root is the standard library when `sys.stdlib_module_names` lists
// it, else a package: Python has no path aliases, so a name that is not in the
// repository comes from the environment.

import { existsSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import type { Resolution, SourceResolver } from "./imports.ts";
import { isPythonStdlib } from "./python-stdlib.ts";

const ROOTS = ["", "src"];

export class PythonResolver implements SourceResolver {
  private readonly root: string;
  private readonly roots: string[];
  /** Files of the analysis (unsaved buffers included) and their directories: they exist for resolution, on disk or not. */
  private readonly sources: ReadonlySet<string>;
  private readonly sourceDirs: ReadonlySet<string>;
  /** The resolver reads no configuration files: edges depend only on the indexed sources. */
  readonly inputs = new Map<string, string | null>();

  constructor(root: string, sources: ReadonlySet<string> = new Set()) {
    this.root = root;
    this.sources = sources;
    this.sourceDirs = directoriesOf(sources);
    this.roots = ROOTS.filter((dir) => dir === "" || this.isDir(dir));
  }

  resolve(fromFile: string, spec: string): Resolution {
    const dots = /^\.*/.exec(spec)![0].length;
    const segments = spec.slice(dots).split(".").filter((s) => s !== "");
    // `m.*`: every public name of `m`, which must be a module itself.
    const glob = segments.at(-1) === "*";
    if (glob) segments.pop();
    if (dots > 0) {
      let base = posix.dirname(fromFile);
      for (let i = 1; i < dots; i++) {
        if (base === ".") return { kind: "unresolved" };
        base = posix.dirname(base);
      }
      // `from . import x`: the package itself may be the module that has `x`.
      return this.longest(base === "." ? "" : base, segments, fromFile, glob ? segments.length : Math.max(0, segments.length - 1)) ?? { kind: "unresolved" };
    }
    for (const root of this.roots) {
      const head = posix.join(root, segments[0]!);
      if (!this.moduleFile(head) && !this.isDir(head)) continue;
      // A source root is no module of an absolute import.
      return this.longest(root, segments, fromFile, glob ? segments.length : Math.max(1, segments.length - 1)) ?? { kind: "unresolved" };
    }
    return isPythonStdlib(segments[0]!) ? { kind: "stdlib" } : { kind: "external", pkg: segments[0]! };
  }

  /** The longest prefix of `segments` of at least `least` segments under `base` that is a module. */
  private longest(base: string, segments: string[], fromFile: string, least: number): Resolution | null {
    for (let k = segments.length; k >= least; k--) {
      if (k === 0 && base === "") return null;
      const file = this.moduleFile(posix.join(base, ...segments.slice(0, k)));
      if (file === null) continue;
      if (file === fromFile) return { kind: "local" };
      return k === segments.length ? { kind: "internal", file, whole: true } : { kind: "internal", file };
    }
    return null;
  }

  /** `a/b.py`, else the package `a/b/__init__.py`; null for neither. */
  private moduleFile(path: string): string | null {
    for (const file of [`${path}.py`, posix.join(path, "__init__.py")]) if (this.sources.has(file) || existsSync(join(this.root, file))) return file;
    return null;
  }

  private isDir(path: string): boolean {
    if (this.sourceDirs.has(path)) return true;
    const abs = join(this.root, path);
    return existsSync(abs) && statSync(abs).isDirectory();
  }
}

/** Every directory above a file of `files` (POSIX, relative). */
function directoriesOf(files: ReadonlySet<string>): Set<string> {
  const dirs = new Set<string>();
  for (const file of files) for (let dir = posix.dirname(file); dir !== "." && !dirs.has(dir); dir = posix.dirname(dir)) dirs.add(dir);
  return dirs;
}
