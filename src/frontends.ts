// A frontend reads one family of languages: its extractor turns a file into
// `FileFacts`, its resolver turns an import specifier into a file, and its
// capabilities say which edges it looks for. Graph, snapshot and checks are
// the same for every language; adding one means a frontend here.

import type { FileFacts } from "./extract/facts.ts";
import { extractPython } from "./extract/python.ts";
import { extractRust } from "./extract/rust.ts";
import { extractTs } from "./extract/ts.ts";
import { ImportResolver, type SourceResolver } from "./imports.ts";
import { languageOf, type Language } from "./languages.ts";
import { PythonResolver } from "./python-imports.ts";
import { RustResolver } from "./rust-imports.ts";

export interface Frontend {
  name: string;
  extract(path: string, src: string): Promise<FileFacts>;
  /**
   * One resolver per graph: files of all this frontend's languages share it.
   * `sources`: the files of the analysis, which exist for resolution even when
   * the disk does not have them (an unsaved or proposed file).
   */
  resolver(root: string, sources: ReadonlySet<string>): SourceResolver;
  /** Edge kinds the extractor reports; a kind missing here is absent from the snapshot, not proven absent from the code. */
  edges: readonly ("import" | "call" | "type" | "reexport")[];
  /** Names of the language and platform: a call or type through them is external, not unresolved. */
  globals: { values: ReadonlySet<string>; types: ReadonlySet<string> };
}

const ecmascript: Frontend = {
  name: "ecmascript",
  extract: extractTs,
  resolver: ecmascriptResolver,
  edges: ["import", "call", "type", "reexport"],
  globals: {
    values: new Set(
      "Array ArrayBuffer BigInt Boolean Buffer DataView Date Error EvalError Float32Array Float64Array Function Int8Array Int16Array Int32Array Intl JSON Map Math Number Object Promise Proxy RangeError Reflect RegExp Set String Symbol SyntaxError TypeError URIError URL URLSearchParams Uint8Array Uint16Array Uint32Array Uint8ClampedArray WeakMap WeakRef WeakSet AbortController TextDecoder TextEncoder Response Request Headers FormData Blob Event EventTarget WebSocket Worker console process globalThis window document navigator crypto performance fetch structuredClone queueMicrotask setTimeout clearTimeout setInterval clearInterval setImmediate clearImmediate requestAnimationFrame cancelAnimationFrame parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI atob btoa alert require".split(" "),
    ),
    types: new Set(
      "Promise Array ReadonlyArray Record Partial Required Readonly Pick Omit Exclude Extract NonNullable ReturnType Parameters ConstructorParameters InstanceType Map Set WeakMap WeakSet Date RegExp Error Iterable Iterator AsyncIterable AsyncIterator Generator IterableIterator Buffer Function Object Boolean Number String".split(" "),
    ),
  },
};

// Calls through values, trait objects and macros are holes, not edges; types are not followed yet.
const rust: Frontend = {
  name: "rust",
  extract: extractRust,
  resolver: rustResolver,
  edges: ["import", "call", "reexport"],
  globals: {
    values: new Set(
      "Box Vec String Option Result Rc Arc Cell RefCell Mutex RwLock HashMap HashSet BTreeMap BTreeSet VecDeque Default From Into Iterator PathBuf Path Duration Instant drop std core alloc bool char str f32 f64 i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize".split(" "),
    ),
    types: new Set(),
  },
};

// Methods through values, `getattr`, dynamic imports and replacing decorators are holes; types are not followed yet.
const python: Frontend = {
  name: "python",
  extract: extractPython,
  resolver: pythonResolver,
  edges: ["import", "call"],
  globals: {
    values: new Set(
      "abs aiter all anext any ascii bin bool breakpoint bytearray bytes callable chr classmethod compile complex delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip __import__ ArithmeticError AssertionError AttributeError BaseException ConnectionError Exception FileExistsError FileNotFoundError ImportError IndexError KeyError KeyboardInterrupt LookupError NotImplementedError OSError OverflowError PermissionError RuntimeError StopIteration TimeoutError TypeError UnicodeDecodeError ValueError ZeroDivisionError".split(" "),
    ),
    types: new Set(),
  },
};

const FRONTENDS: Record<Language, Frontend> = {
  javascript: ecmascript,
  python,
  rust,
  typescript: ecmascript,
};

function ecmascriptResolver(root: string, sources: ReadonlySet<string>): SourceResolver {
  return new ImportResolver(root, sources);
}

function pythonResolver(root: string): SourceResolver {
  return new PythonResolver(root);
}

function rustResolver(root: string): SourceResolver {
  return new RustResolver(root);
}

export function frontendOf(language: Language): Frontend {
  return FRONTENDS[language];
}

/** The frontend for a source file; undefined for a file of no known language. */
export type { SourceResolver };

export function frontendFor(path: string): Frontend | undefined {
  const language = languageOf(path);
  return language === undefined ? undefined : FRONTENDS[language];
}
