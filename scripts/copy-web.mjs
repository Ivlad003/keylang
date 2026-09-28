// Copies xterm.js (and its fit addon) into dist/web/ for `keylang web`. They
// are dev dependencies: the published package carries these files, not the
// packages, so installing keylang adds nothing to the dependency tree.
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const to = join(dirname(fileURLToPath(import.meta.url)), "../dist/web");
mkdirSync(to, { recursive: true });
const files = [
  ["@xterm/xterm", "lib/xterm.js", "xterm.js"],
  ["@xterm/xterm", "css/xterm.css", "xterm.css"],
  ["@xterm/xterm", "LICENSE", "xterm.LICENSE"],
  ["@xterm/addon-fit", "lib/addon-fit.js", "addon-fit.js"],
  ["@xterm/addon-fit", "LICENSE", "addon-fit.LICENSE"],
];
for (const [pkg, from, name] of files) cpSync(join(dirname(require.resolve(`${pkg}/package.json`)), from), join(to, name));
