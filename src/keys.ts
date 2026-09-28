// API keys kept outside the environment: `~/.config/keylang/<name>.key`,
// mode 0600. Shared by the model adapter and voice, without loading either.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The key in `~/.config/keylang/<name>.key`; a file others can read is refused, not used. */
export function readKey(home: string, name: string): string | undefined {
  const file = join(home, ".config/keylang", `${name}.key`);
  if (!existsSync(file)) return undefined;
  if ((statSync(file).mode & 0o077) !== 0) throw new Error(`${file}: readable by others; run \`chmod 600 ${file}\``);
  const key = readFileSync(file, "utf8").trim();
  return key === "" ? undefined : key;
}
