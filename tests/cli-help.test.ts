// What the CLI says about itself: `--help` and the commands table of
// docs/tools.md, `explain` for every diagnostic code, and shell completions.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keylang, root } from "./cli-helpers.ts";

/** Command keys from `keylang --help`: the words of a line indented by exactly two spaces, up to a token that starts with `<`, `[` or `-`, or up to two spaces. Every `explain` variant is one key. */
function helpCommandKeys(help: string): string[] {
  const keys: string[] = [];
  for (const line of help.split("\n")) {
    if (!line.startsWith("  ") || line.startsWith("   ")) continue;
    const words: string[] = [];
    for (const token of line.slice(2).split(" ")) {
      if (token === "" || token.startsWith("<") || token.startsWith("[") || token.startsWith("-")) break;
      words.push(token);
    }
    if (words.length > 0) keys.push(words.join(" "));
  }
  return [...new Set(keys)];
}

/** First column of the commands table in tools.md, in backticks. */
function toolsCommandKeys(tools: string): string[] {
  const keys: string[] = [];
  for (const line of tools.split("\n")) {
    const cell = /^\| `([^`]+)` \|/.exec(line);
    if (cell) keys.push(cell[1]!);
  }
  return keys.filter((key) => key !== "keylang");
}

/** A help key missing from the table, or a table key that `--help` does not have. */
function commandTableDrift(help: string, tools: string): string | null {
  const fromHelp = new Set(helpCommandKeys(help));
  const fromTable = toolsCommandKeys(tools);
  for (const key of fromHelp) if (!fromTable.includes(key)) return key;
  for (const key of fromTable) if (!fromHelp.has(key)) return key;
  return null;
}

test("the commands table in tools.md lists every command from --help", () => {
  const help = keylang(root, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  const tools = readFileSync(join(root, "docs/tools.md"), "utf8");
  const drift = commandTableDrift(help.stdout, tools);
  assert.equal(drift, null, drift ?? "");
  assert.ok(tools.includes("| `keylang` |"), "the bare keylang row is the TUI");
  const withoutDoctor = tools.replace("| `doctor` |", "| `clerk` |");
  assert.equal(commandTableDrift(help.stdout, withoutDoctor), "doctor");
  const withInvented = tools.replace("| `doctor` |", "| `doctor` |\n| `teleport` | nowhere | | 2 | |");
  assert.equal(commandTableDrift(help.stdout, withInvented), "teleport");
});

test("explain covers every diagnostic code", () => {
  // The codes as `src/diag.ts` declares them, so a new code without an explanation fails here.
  const codes = [...readFileSync(join(root, "src/diag.ts"), "utf8").matchAll(/\| "(K\d{3})"/g)].map((m) => m[1]!);
  assert.ok(codes.length >= 13, codes.join(" "));
  const table = readFileSync(join(root, "docs/format.md"), "utf8");
  for (const code of codes) {
    assert.match(table, new RegExp(`\\| ${code} \\| (error|warning) \\|`), `format.md §7 lists ${code}`);
    const explained = keylang(root, ["explain", code]);
    assert.equal(explained.status, 0, explained.stderr);
    assert.match(explained.stdout, /example:/);
    assert.match(explained.stdout, /fix:/);
    // The npm package ships no docs/, so an explanation must not send the reader there.
    assert.doesNotMatch(explained.stdout, /format\.md|docs\//, `explain ${code} is self-contained`);
  }
  assert.match(keylang(root, ["explain", "K001"]).stdout, /planned[\s\S]*generated file[\s\S]*`keylang baseline`/);
  assert.match(keylang(root, ["explain", "k102"]).stdout, /^K102: /);
  assert.equal(keylang(root, ["explain", "NOPE"]).status, 2);
  assert.equal(keylang(root, ["explain", "toString"]).status, 2);
});

test("explain K005 shows the right form for every reason and the separate planned line", () => {
  const explained = keylang(root, ["explain", "K005"]);
  assert.equal(explained.status, 0, explained.stderr);
  assert.match(explained.stdout, /^fix: Write the keyword in one of its forms:/m);
  const forms: Record<string, string> = {
    arguments: "`# flow checkout`",
    id: "`module order`",
    link: "`calls [a.b](src/a.ts)`",
    quote: '`test f.ts "x"`',
    layer: "`layers domain < app`",
    scope: "`deny app app.checkout`",
  };
  for (const [reason, form] of Object.entries(forms)) {
    const line = explained.stdout.split("\n").find((row) => row.startsWith(`- ${reason}:`));
    assert.ok(line?.includes(`→ ${form}`), `${reason}: ${line}`);
  }
  assert.match(explained.stdout, /`- planned fn <id> <signature>` at the top of the flow/);
});

test("help lists agents, feature, baseline, check --changed and hook stop", () => {
  const help = keylang(root, ["--help"]);
  assert.equal(help.status, 0);
  for (const phrase of ["agents", "--agents", "feature", "baseline", "--changed", "hook stop"]) assert.match(help.stdout, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

// DX commands (design §7.5): shell completions.

test("completions print a script for bash, zsh and fish with every command and flag", () => {
  const help = keylang(root, ["--help"]).stdout;
  for (const shell of ["bash", "zsh", "fish"]) {
    const o = keylang(root, ["completions", shell]);
    assert.equal(o.status, 0, o.stderr);
    assert.equal(o.stderr, "");
    for (const word of ["check", "map", "hook", "install", "completions", "new", "module", "draft", "code-to-spec", "--changed", "--layer", "--format"]) {
      // fish names a long flag `-l changed`.
      const shown = shell === "fish" && word.startsWith("--") ? `-l ${word.slice(2)}` : word;
      assert.match(o.stdout, new RegExp(`(^|[\\s'"(])${shown.replace(/-/g, "\\-")}([\\s'");]|$)`, "m"), `${shell}: ${word}`);
      assert.ok(help.includes(word), `--help lists ${word}`);
    }
  }
  const bash = spawnSync("bash", ["-n"], { input: keylang(root, ["completions", "bash"]).stdout, encoding: "utf8" });
  if (!bash.error) assert.equal(bash.status, 0, bash.stderr);

  const unknown = keylang(root, ["completions", "tcsh"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /bash, zsh, fish/);
  assert.equal(keylang(root, ["completions"]).status, 2);
});
