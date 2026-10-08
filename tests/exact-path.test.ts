// Resolvers on a case-insensitive file system (APFS, NTFS): `existsSync`
// finds `models/User.rs` through `models/user.rs`, so a resolver that trusts
// it names a file the index does not have instead of falling back to
// `mod.rs` / `__init__.py`. Linux has no such file system to test on, so the
// two calls are emulated: `existsSync` matches a path ignoring case, while the
// directory listing keeps the real spelling, as the real ones do.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { test, type TestContext } from "node:test";
import { exactExistence, type ExactFs } from "../src/exact-path.ts";
import { ImportResolver } from "../src/imports.ts";
import { PythonResolver } from "../src/python-imports.ts";
import { RustResolver } from "../src/rust-imports.ts";

function repo(t: TestContext, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-casefold-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

/** The real spelling of `abs` under `root` when some spelling of it exists ignoring case; null otherwise. */
function casefold(root: string, abs: string): string | null {
  let at = root;
  for (const segment of relative(root, abs).split(sep)) {
    if (segment === "" || segment === ".") continue;
    if (!existsSync(at)) return null;
    const real = readdirSync(at).find((name) => name.normalize("NFC").toLowerCase() === segment.normalize("NFC").toLowerCase());
    if (real === undefined) return null;
    at = join(at, real);
  }
  return at;
}

/** A file system that is case-insensitive and case-preserving, like APFS and NTFS. */
function caseInsensitive(root: string): ExactFs {
  return {
    existsSync: (path) => casefold(root, path) !== null,
    readdirSync: (path) => {
      const real = casefold(root, path);
      if (real === null) throw new Error(`ENOENT: ${path}`);
      return readdirSync(real);
    },
  };
}

test("exactExistence: a path spelled otherwise than on disk does not exist, even where the file system says it does", (t) => {
  const root = repo(t, { "src/models/user.rs": "", "src/models/mod.rs": "", "src/café.rs": "" });
  const exact = exactExistence(root, caseInsensitive(root));
  assert.equal(exact("src/models/user.rs"), true);
  assert.equal(exact("src/models/mod.rs"), true);
  assert.equal(exact("src/models"), true, "a directory");
  assert.equal(exact("src/models/User.rs"), false, "the file is `user.rs`");
  assert.equal(exact("src/Models/user.rs"), false, "a directory segment in another case");
  assert.equal(exact("src/models/order.rs"), false, "absent");
  assert.equal(exact("src/café.rs"), true, "NFD and NFC name the same file");
  assert.equal(exact("src/../src/models/user.rs"), false, "`..` is no spelling of a path");
  // On a case-sensitive file system the check costs nothing it would not have found anyway.
  const linux = exactExistence(root);
  assert.equal(linux("src/models/user.rs"), true);
  assert.equal(linux("src/models/User.rs"), false);
});

test("rust: `use crate::models::User` with `models/user.rs` resolves to `models/mod.rs` on a case-insensitive file system, not to a phantom `User.rs`", (t) => {
  const files = {
    "Cargo.toml": '[package]\nname = "shop"\n',
    "src/lib.rs": "pub mod api;\npub mod models;\n",
    "src/models/mod.rs": "mod user;\npub use user::User;\n",
    "src/models/user.rs": "pub struct User;\nimpl User { pub fn new() -> Self { User } }\n",
    "src/api/mod.rs": "use crate::models::User;\npub fn handle() { let _ = User::new(); }\n",
  };
  const root = repo(t, files);
  const sources = new Set(Object.keys(files).filter((f) => f.endsWith(".rs")));
  for (const resolver of [new RustResolver(root, sources, caseInsensitive(root)), new RustResolver(root, sources)]) {
    assert.deepEqual(resolver.resolve("src/api/mod.rs", "crate::models::User"), { kind: "internal", file: "src/models/mod.rs" });
    assert.deepEqual(resolver.resolve("src/api/mod.rs", "crate::models::user"), { kind: "internal", file: "src/models/user.rs", whole: true });
    assert.deepEqual(resolver.resolve("src/api/mod.rs", "crate::models::user::User"), { kind: "internal", file: "src/models/user.rs" });
  }
  // A file the index does not list yet (an unsaved buffer) is still found on disk when spelled as on disk.
  const partial = new RustResolver(root, new Set(["src/lib.rs"]), caseInsensitive(root));
  assert.deepEqual(partial.resolve("src/api/mod.rs", "crate::models::User"), { kind: "internal", file: "src/models/mod.rs" });
  assert.deepEqual(partial.resolve("src/api/mod.rs", "crate::models::user::User"), { kind: "internal", file: "src/models/user.rs" });
});

test("python: `from app.models import User` with `models/user.py` resolves to `models/__init__.py` on a case-insensitive file system", (t) => {
  const files = {
    "app/__init__.py": "",
    "app/models/__init__.py": "from .user import User\n",
    "app/models/user.py": "class User:\n    pass\n",
    "app/api/__init__.py": "",
    "app/api/views.py": "from app.models import User\n\ndef handle():\n    return User()\n",
  };
  const root = repo(t, files);
  const sources = new Set(Object.keys(files));
  for (const resolver of [new PythonResolver(root, sources, caseInsensitive(root)), new PythonResolver(root, sources)]) {
    assert.deepEqual(resolver.resolve("app/api/views.py", "app.models.User"), { kind: "internal", file: "app/models/__init__.py" });
    assert.deepEqual(resolver.resolve("app/api/views.py", "app.models.user"), { kind: "internal", file: "app/models/user.py", whole: true });
    assert.deepEqual(resolver.resolve("app/api/views.py", "app.models.user.User"), { kind: "internal", file: "app/models/user.py" });
  }
  const partial = new PythonResolver(root, new Set(["app/api/views.py"]), caseInsensitive(root));
  assert.deepEqual(partial.resolve("app/api/views.py", "app.models.User"), { kind: "internal", file: "app/models/__init__.py" });
  assert.deepEqual(partial.resolve("app/api/views.py", "..models.User"), { kind: "internal", file: "app/models/__init__.py" });
});

test("typescript: `./models/User` with `models/user.ts` is unresolved on a case-insensitive file system, as tsc reports it, not a phantom file", (t) => {
  const files = {
    "src/models/user.ts": "export class User {}\n",
    "src/models/index.ts": "export { User } from './user';\n",
    "src/api/handler.ts": "import { User } from '../models/User';\n",
  };
  const root = repo(t, files);
  const sources = new Set(Object.keys(files));
  for (const resolver of [new ImportResolver(root, sources, caseInsensitive(root)), new ImportResolver(root, sources)]) {
    assert.deepEqual(resolver.resolve("src/api/handler.ts", "../models/User"), { kind: "unresolved" });
    assert.deepEqual(resolver.resolve("src/api/handler.ts", "../models/user"), { kind: "internal", file: "src/models/user.ts" });
    assert.deepEqual(resolver.resolve("src/api/handler.ts", "../models"), { kind: "internal", file: "src/models/index.ts" });
  }
  const partial = new ImportResolver(root, new Set(["src/api/handler.ts"]), caseInsensitive(root));
  assert.deepEqual(partial.resolve("src/api/handler.ts", "../models/User"), { kind: "unresolved" });
  assert.deepEqual(partial.resolve("src/api/handler.ts", "../models/user"), { kind: "internal", file: "src/models/user.ts" });
});
