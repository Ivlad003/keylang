// Shared entry for the CLI and the language server: load config, reuse
// unchanged file facts, rebuild the snapshot. Rules stay independent of tree-sitter.

import { loadConfig, type Config } from "./config.ts";
import { generateMap, type MapResult } from "./map.ts";

export { filesToReextract } from "./fact-cache.ts";

export async function analyze(root: string): Promise<MapResult & { config: Config }> {
  const config = loadConfig(root);
  const result = await generateMap(config);
  return { ...result, config };
}
