// A git repository on a feature branch, for the «Зміни» tab (.scratch/web-git):
// tests/web-git.test.ts and the browser tests in tests/web-e2e/.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { git } from "./cli-helpers.ts";

export const GIT_LAYERS = { languages: ["typescript"], module: "file", layers: { domain: ["src/domain/**"], app: ["src/app/**"] } };

/**
 * A repository on a feature branch: `main` has two modules and a rule; the
 * branch commits a call that breaks the rule, deletes a module, adds one,
 * changes a binary file, and leaves a spec edited and a text and a binary
 * file untracked in the working tree; another binary file stays as it was.
 */
export function branchRepo(t: { after: (f: () => void) => void }): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-web-git-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };

  write("keylang.json", `${JSON.stringify(GIT_LAYERS, null, 2)}\n`);
  write("keylang/rules.md", "# rules\n\n- deny domain app\n");
  write("src/app/pay.ts", "export function charge(): number {\n  return 1;\n}\n");
  write("src/domain/order.ts", "export function price(): number {\n  return 2;\n}\n");
  write("src/domain/old.ts", "export function legacy(): number {\n  return 3;\n}\n");
  // Binary files app.html does not read: git must still see them, unchanged or not.
  write("docs/logo.png", "\u0000PNG logo");
  write("docs/banner.png", "\u0000PNG banner");
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "main"]);
  git(dir, ["checkout", "-q", "-b", "feature"]);
  write("src/domain/order.ts", 'import { charge } from "../app/pay.ts";\nexport function price(): number {\n  return charge() + 2;\n}\n');
  rmSync(join(dir, "src/domain/old.ts"));
  write("src/app/refund.ts", "export function refund(): number {\n  return 0;\n}\n");
  // A binary change has no hunk: `check --changed` does not list it.
  write("docs/banner.png", "\u0000PNG banner, wider");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feature"]);
  write("keylang/rules.md", "# rules\n\n- deny domain app\n- deny app domain\n");
  write("notes.txt", "untracked\n");
  write("docs/shot.png", "\u0000PNG untracked");

  return dir;
}

