// A repository for the entry explorer of `keylang web` (business-flows/22):
// TypeScript and Python in one repository. Two Express-style routes and a
// `[project.scripts]` entry point; `pay` calls `charge` through a closure it
// passes to `withLock` (a `closure-arg` edge), `charge → audit → write` is
// three levels down, and `pay` has a call keylang cannot resolve (a hole), as
// does `withLock` (a call through its parameter). In Python `main` passes
// `helper` to `apply`, and `helper → store`.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const EXPLORER_FILES: Record<string, string> = {
  "keylang.json": `${JSON.stringify({ languages: ["typescript", "python"], module: "file", layers: { app: ["src/app/**"], billing: ["src/billing/**"], shop: ["src/shop/**"] } })}\n`,
  "package.json": `${JSON.stringify({ name: "shop" })}\n`,
  "src/app/server.ts": [
    'import { pay, listOrders } from "./handlers.ts";',
    "const app = { get: (_p: string, ..._h: unknown[]) => 0, post: (_p: string, ..._h: unknown[]) => 0 };",
    'app.post("/pay", pay);',
    'app.get("/orders", listOrders);',
    "",
  ].join("\n"),
  "src/app/handlers.ts": [
    'import { charge } from "../billing/charge.ts";',
    'import { withLock } from "../billing/lock.ts";',
    "export function pay(): number {",
    "  withLock(() => charge());",
    "  const gateway: any = {};",
    "  gateway.refund();",
    "  return 1;",
    "}",
    "export function listOrders(): string[] {",
    "  return [];",
    "}",
    "",
  ].join("\n"),
  "src/billing/charge.ts": 'import { audit } from "./audit.ts";\nexport function charge(): void {\n  audit();\n}\n',
  "src/billing/audit.ts": "export function audit(): void {\n  write();\n}\nfunction write(): void {}\n",
  "src/billing/lock.ts": "export function withLock(run: () => void): void {\n  run();\n}\n",
  "pyproject.toml": '[project]\nname = "shop"\n\n[project.scripts]\nshop-py = "shop.cli:main"\n',
  "src/shop/__init__.py": "",
  "src/shop/cli.py": "def apply(f):\n    return f()\n\n\ndef helper() -> int:\n    return store()\n\n\ndef store() -> int:\n    return 1\n\n\ndef main() -> int:\n    return apply(helper)\n",
  "keylang/rules.md": "# rules\n\n- layers billing < app\n",
};

/** A temporary repository with the explorer's files (and `extra`), removed after the test. */
export function explorerRepo(t: { after: (f: () => void) => void }, extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-explorer-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, text] of Object.entries({ ...EXPLORER_FILES, ...extra })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
