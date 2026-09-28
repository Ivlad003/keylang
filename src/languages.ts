// Languages keylang indexes: names, file extensions and the
// default module granularity. Plain data, so config and the language core
// know which files are source without loading any frontend or grammar.

export interface LanguageInfo {
  /** File extensions with the dot. */
  extensions: readonly string[];
  /** What a module is when `keylang.json` does not say (`module`). */
  module: "file" | "dir";
  /** File names (without extension) that stand for their directory's module, like `index.ts`. */
  index: readonly string[];
}

export const LANGUAGES = {
  javascript: { extensions: [".js", ".jsx", ".mjs", ".cjs"], module: "file", index: ["index"] },
  python: { extensions: [".py"], module: "file", index: ["__init__"] },
  rust: { extensions: [".rs"], module: "file", index: ["mod"] },
  typescript: { extensions: [".ts", ".tsx", ".mts", ".cts"], module: "file", index: ["index"] },
} satisfies Record<string, LanguageInfo>;

export type Language = keyof typeof LANGUAGES;

export const LANGUAGE_NAMES = (Object.keys(LANGUAGES) as Language[]).sort();

export function isLanguage(name: unknown): name is Language {
  return typeof name === "string" && Object.hasOwn(LANGUAGES, name);
}

export function languageOf(path: string): Language | undefined {
  for (const name of LANGUAGE_NAMES) {
    if (LANGUAGES[name].extensions.some((ext) => path.endsWith(ext))) return name;
  }
  return undefined;
}
