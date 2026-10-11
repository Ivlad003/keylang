// `node:path` for the analysis in the browser: POSIX paths (path-browserify,
// Node's own POSIX implementation), with the one `win32` question keylang
// asks — whether a written path is absolute on Windows — answered by hand.

import path from "path-browserify";

export const { basename, delimiter, dirname, extname, format, isAbsolute, join, normalize, parse, relative, resolve, sep } = path;

export const posix = path;

/** The `path.win32` subset keylang uses: the separator and whether a path is absolute on Windows. */
export const win32 = {
  sep: "\\",
  // A drive letter and a slash (`C:\`, `C:/`), or a root/UNC path starting with a slash of either kind.
  isAbsolute: (p: string): boolean => /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]/.test(p),
};

export default { ...path, posix, win32 };
