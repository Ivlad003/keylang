// `node:path` for the analysis in the browser: POSIX paths (path-browserify,
// Node's own POSIX implementation), with the one `win32` question keylang
// asks — whether a written path is absolute on Windows — answered by hand.

import path from "path-browserify";

export const { basename, delimiter, dirname, extname, format, isAbsolute, join, normalize, parse, relative, resolve, sep } = path;
export const posix = path;
export const win32 = {
  sep: "\\",
  isAbsolute: (p: string): boolean => /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]/.test(p),
};
export default { ...path, posix, win32 };
