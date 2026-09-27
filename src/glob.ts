// Minimal glob matching for `keylang.json` (no dependency, no experimental
// Node API). Supports `**`, `*`, `?` and `{a,b}`; paths are POSIX-relative.

export function globToRegExp(glob: string): RegExp {
  let re = "^";
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
      const close = glob.indexOf("}", i);
      if (close === -1) {
        re += "\\{";
      } else {
        const alts = glob.slice(i + 1, close).split(",").map(escape);
        re += `(?:${alts.join("|")})`;
        i = close;
      }
    } else {
      re += escape(c);
    }
  }
  return new RegExp(`${re}$`);
}

function escape(s: string): string {
  return s.replace(/[.+^$()|[\]\\]/g, "\\$&");
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path);
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
