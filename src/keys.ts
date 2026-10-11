// API keys kept outside the environment: `~/.config/keylang/<name>.key`,
// mode 0600. Shared by the model adapter and voice, without loading either.
// Not part of the language pipeline: a side utility for the LLM adapter
// (`llm.ts`), voice (`voice.ts`) and the TUI forms that call them.
// Entry point: `readKey`.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The key in `~/.config/keylang/<name>.key`; a file others can read is refused, not used. */
export function readKey(home: string, name: string): string | undefined {
  const file = join(home, ".config/keylang", `${name}.key`);

  if (!existsSync(file)) return undefined;

  // Refuse group/world-readable key files, the same policy ssh applies to private keys.
  if ((statSync(file).mode & 0o077) !== 0) throw new Error(`${file}: readable by others; run \`chmod 600 ${file}\``);
  const key = readFileSync(file, "utf8").trim();

  return key === "" ? undefined : key;
}
