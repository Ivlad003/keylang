// Minimal glob matching for `keylang.json` (no dependency, no experimental
// Node API). Supports `**`, `*`, `?` and `{a,b}`; paths are POSIX-relative.

export function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${source(glob)}$`);
}

/** The regex body of a glob; each `{a,b}` alternative is a glob itself (`{src/**,lib/*.ts}`). */
function source(glob: string): string {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?"; // `**/` matches zero or more directories
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const close = closingBrace(glob, i);
      if (close === -1) {
        re += "\\{";
      } else {
        re += `(?:${splitAlternatives(glob.slice(i + 1, close)).map(source).join("|")})`;
        i = close;
      }
    } else {
      re += escape(c);
    }
  }
  return re;
}

function closingBrace(glob: string, open: number): number {
  let depth = 0;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === "{") depth++;
    else if (glob[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Top-level commas of a brace body: `a,{b,c}` → `a`, `{b,c}`. */
function splitAlternatives(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}") depth--;
    else if (body[i] === "," && depth === 0) {
      out.push(body.slice(from, i));
      from = i + 1;
    }
  }
  out.push(body.slice(from));
  return out;
}

function escape(s: string): string {
  return s.replace(/[.+^$()|[\]\\{}]/g, "\\$&");
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path);
}

/**
 * The one directory a set of globs owns: `D` when every glob is `D/**` or
 * `D/**` followed by a file pattern, else null. A set that lists files, or
 * spreads over two directories, owns none, so a README beside its files does
 * not speak for it.
 */
export function globDirectory(globs: readonly string[]): string | null {
  let dir: string | null = null;
  for (const glob of globs) {
    const m = /^((?:[^*?{}[\]/]+\/)*[^*?{}[\]/]+)\/\*\*(?:\/[^/]*)?$/.exec(glob);
    if (!m || (dir !== null && dir !== m[1])) return null;
    dir = m[1]!;
  }
  return dir;
}

/** Directory prefix of a glob, up to the first wildcard: `src/domain/**` → `src/domain`. */
export function globPrefix(glob: string): string {
  const parts = glob.split("/");
  const fixed: string[] = [];
  for (const p of parts) {
    if (/[*?{]/.test(p)) break;
    fixed.push(p);
  }
  // A trailing fixed component is a file name unless the glob had a wildcard after it.
  if (fixed.length === parts.length) fixed.pop();
  return fixed.join("/");
}
