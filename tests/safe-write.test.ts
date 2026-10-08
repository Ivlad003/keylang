// The one write protocol of the CLI (`src/safe-write.ts`): which paths it
// refuses — the edge cases of links are simpler to show here than through
// every command — and what an atomic rewrite keeps.

import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { keepLineEndings, safeWrite, safeWriteAll, writeProblem } from "../src/safe-write.ts";

function dirs(t: TestContext): { repo: string; outside: string } {
  const base = mkdtempSync(join(tmpdir(), "keylang-write-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(join(base, "repo"));
  mkdirSync(join(base, "outside"));
  return { repo: join(base, "repo"), outside: join(base, "outside") };
}

test("safe write: only a plain relative path inside the repository, links followed — a link whose target does not exist yet and a loop included", (t) => {
  const { repo, outside } = dirs(t);
  for (const path of ["", "/etc/x.ts", "C:\\x.ts", "a\\b.ts", "../x.ts", "a/../x.ts", "./x.ts", "a//x.ts"]) assert.equal(writeProblem(repo, path), "not a plain relative path", path);
  symlinkSync(outside, join(repo, "out"));
  assert.equal(writeProblem(repo, "out/new/x.ts"), "leads out of the repository through a link");
  symlinkSync(join(outside, "later.ts"), join(repo, "dangling.ts"));
  assert.equal(writeProblem(repo, "dangling.ts"), "leads out of the repository through a link");
  symlinkSync("loop-b", join(repo, "loop-a"));
  symlinkSync("loop-a", join(repo, "loop-b"));
  assert.equal(writeProblem(repo, "loop-a/x.ts"), "leads through a loop of links");
  mkdirSync(join(repo, ".keylang"));
  symlinkSync(outside, join(repo, ".keylang/proposals"));
  assert.equal(writeProblem(repo, ".keylang/proposals/x.md", { under: ".keylang/proposals" }), "leads out of the repository through a link");
  mkdirSync(join(repo, "store"));
  symlinkSync(join(repo, "src"), join(repo, "store/src"));
  assert.equal(writeProblem(repo, "store/src/x.md", { under: "store" }), "leads out of store/ through a link");
  assert.throws(() => safeWrite(repo, "dangling.ts", "x"), /^Error: dangling\.ts: leads out of the repository through a link$/);
  assert.deepEqual(readdirSync(outside), [], "nothing lands outside");
  // A link that stays inside is written at its target, and stays a link.
  writeFileSync(join(repo, "real.ts"), "old\n");
  symlinkSync("real.ts", join(repo, "alias.ts"));
  safeWrite(repo, "alias.ts", "new\n");
  assert.equal(readFileSync(join(repo, "real.ts"), "utf8"), "new\n");
  assert.ok(lstatSync(join(repo, "alias.ts")).isSymbolicLink());
});

test("safe write: a generated file is only for its generator; an expected text that changed on disk stops every write of the batch", (t) => {
  const { repo } = dirs(t);
  writeFileSync(join(repo, "gen.ts"), "\n// keylang:generated — не редагувати, `keylang wire`\nexport {};\n");
  assert.equal(writeProblem(repo, "gen.ts"), "a generated file: only its generator writes it");
  assert.equal(writeProblem(repo, "gen.ts", { generated: true }), null);
  writeFileSync(join(repo, "a.ts"), "mine\n");
  assert.throws(
    () =>
      safeWriteAll(repo, [
        { path: "new.ts", text: "x\n", options: { expect: null } },
        { path: "a.ts", text: "theirs\n", options: { expect: "what it was\n" } },
      ]),
    /a\.ts: changed on disk while the change was prepared; nothing written/,
  );
  assert.deepEqual(readdirSync(repo).sort(), ["a.ts", "gen.ts"], "the first file of the batch is not written either");
  assert.equal(writeProblem(repo, "a.ts", { expect: null }), "created on disk while the change was prepared; nothing written");
  mkdirSync(join(repo, "dir.ts"));
  assert.equal(writeProblem(repo, "dir.ts"), "a directory");
});

test("safe write: atomic — a missing directory is created, permissions and CRLF of the replaced file stay, no temporary file is left", (t) => {
  const { repo } = dirs(t);
  safeWrite(repo, "deep/new/file.ts", "a\nb\n");
  assert.equal(readFileSync(join(repo, "deep/new/file.ts"), "utf8"), "a\nb\n");
  const file = join(repo, "crlf.md");
  writeFileSync(file, "one\r\ntwo\r\n");
  chmodSync(file, 0o600);
  safeWrite(repo, "crlf.md", "one\ntwo\nthree\n");
  assert.equal(readFileSync(file, "utf8"), "one\r\ntwo\r\nthree\r\n");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  writeFileSync(file, "mixed\r\nlines\n");
  safeWrite(repo, "crlf.md", "lf\nonly\n");
  assert.equal(readFileSync(file, "utf8"), "lf\nonly\n", "mixed endings are not a CRLF file");
  assert.deepEqual(readdirSync(repo).sort(), ["crlf.md", "deep"]);
});

test("keepLineEndings: LF and all-CRLF files keep their kind; in a mixed file kept lines keep theirs and new lines take the most common", () => {
  const lf = (text: string): string => text.replace(/\r\n/g, "\n");
  assert.equal(keepLineEndings("a\nb\n", "a\nx\nb\n"), "a\nx\nb\n");
  assert.equal(keepLineEndings("a\r\nb\r\n", "a\nx\nb\n"), "a\r\nx\r\nb\r\n");
  const mixed = "a\r\nb\r\nc\nd\r\n";
  assert.equal(keepLineEndings(mixed, `${lf(mixed)}NEW\n`), `${mixed}NEW\r\n`, "an append");
  assert.equal(keepLineEndings(mixed, "a\nb\nX\nc\nd\n"), "a\r\nb\r\nX\r\nc\nd\r\n", "an insertion in the middle");
  assert.equal(keepLineEndings(mixed, "TOP\na\nb\nc\nX\nd\n"), "TOP\r\na\r\nb\r\nc\nX\r\nd\r\n", "two insertions");
  assert.equal(keepLineEndings(mixed, "a\nY\nd\n"), "a\r\nY\r\nd\r\n", "a replacement");
  assert.equal(keepLineEndings("a\r\nb\nc\n", "a\nb\nc\nd"), "a\r\nb\nc\nd", "a tie of endings is LF; no final newline stays none");
  // Linear: a large file of `\r`-only differences costs no quadratic table.
  const big = Array.from({ length: 30000 }, (_, i) => `line ${i}${i % 2 === 0 ? "\r" : ""}\n`).join("");
  const started = Date.now();
  assert.equal(keepLineEndings(big, `TOP\n${lf(big)}end\n`), `TOP\n${big}end\n`);
  assert.ok(Date.now() - started < 2000);
});
