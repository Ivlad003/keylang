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
  /** Member a call of the class runs (`new X()`, `X()`); null when calling a type runs no member (Rust). */
  constructor: string | null;
  /** Members the language calls without a call expression that names them (`then`, `__str__`, `drop`). */
  implicit: (name: string) => boolean;
  /** Class, function and method names compare without ASCII case, by `asciiLowerCase` (PHP: `new ORDER()` makes an `Order`, `$o->TOTAL()` runs `total()`, `äpfel` is no `Äpfel`). */
  caselessNames: boolean;
}

const JS_IMPLICIT = new Set(["then", "next", "return", "throw", "toString", "valueOf", "toJSON"]);

export const LANGUAGES = {
  javascript: { extensions: [".js", ".jsx", ".mjs", ".cjs"], module: "file", index: ["index"], constructor: "constructor", implicit: (name) => JS_IMPLICIT.has(name), caselessNames: false },
  // Dunder methods other than `__init__` run through syntax and built-ins: `with`, `for`, `str()`, operators, `x()`.
  python: { extensions: [".py"], module: "file", index: ["__init__"], constructor: "__init__", implicit: (name) => /^__.+__$/.test(name) && name !== "__init__", caselessNames: false },
  // PHP: magic methods other than `__construct` run through syntax: `__toString`, `__get`, `__call`, `__invoke`, `__destruct`…
  // A file is no directory's module: `index.php` is an entry script, not an index.
  php: { extensions: [".php"], module: "file", index: [] as string[], constructor: "__construct", implicit: (name) => name.startsWith("__") && asciiLowerCase(name) !== "__construct", caselessNames: true },
  // Rust: the extractor marks the methods of `impl Drop`, `impl Display`, … (a name alone does not say it).
  rust: { extensions: [".rs"], module: "file", index: ["mod"], constructor: null, implicit: () => false, caselessNames: false },
  typescript: { extensions: [".ts", ".tsx", ".mts", ".cts"], module: "file", index: ["index"], constructor: "constructor", implicit: (name) => JS_IMPLICIT.has(name), caselessNames: false },
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

/** The member a call of a class declared in `file` runs; JS `constructor` for a file of no known language. */
export function constructorName(file: string | null | undefined): string | null {
  const language = file ? languageOf(file) : undefined;
  return language === undefined ? "constructor" : LANGUAGES[language].constructor;
}

/** Classes, functions and methods declared in `file` compare their names without ASCII case: by `asciiLowerCase`. */
export function caselessNames(file: string | null | undefined): boolean {
  const language = file ? languageOf(file) : undefined;
  return language !== undefined && LANGUAGES[language].caselessNames;
}

/**
 * `name` with A–Z lowered and every other character kept: how PHP compares
 * class, function and method names (from 8.2 whatever the locale). `ORDER` is
 * `order`, while `Äpfel` and `äpfel` stay two names, which `toLowerCase`
 * would make one.
 */
export function asciiLowerCase(name: string): string {
  return name.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
}

/** A member of a class in `file` that the language calls without naming it. */
export function implicitMember(file: string | null | undefined, name: string): boolean {
  const language = file ? languageOf(file) : undefined;
  return LANGUAGES[language ?? "typescript"].implicit(name);
}
