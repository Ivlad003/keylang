// The repository brief and the layer doc (.scratch/c4-zoom/issues/01): the
// system and container levels of C4 in the explained map, from the README or
// a manifest and the README of a layer's own directory, a model's brief only
// where they say nothing, through the real CLI.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { readmeBrief } from "../src/brief.ts";
import { globDirectory } from "../src/glob.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "bin/keylang.js");
const today = new Date().toISOString().slice(0, 10);

function keylang(cwd: string, args: string[], env: Record<string, string | undefined> = {}): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** `keylang` without blocking this process: the mock server answers while the CLI waits. */
function keylangAsync(cwd: string, args: string[], env: Record<string, string | undefined>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

/** The explained fixture with the explained map on, and `files` written over it. */
function repo(t: TestContext, files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "keylang-repository-brief-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "tests/fixtures/explained"), dir, { recursive: true });
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(dir, "keylang.json"), `${JSON.stringify({ ...config, explain: { map: true } }, null, 2)}\n`);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

function readme(dir: string): string {
  return readFileSync(join(dir, "keylang/map-explained/README.md"), "utf8");
}

/** The lines between the generator marker and `## Explained map`: the repository's section of the start page. */
function systemSection(dir: string): string {
  const text = readme(dir);
  return text.slice(text.indexOf("\n\n") + 2, text.indexOf("## Explained map")).trimEnd();
}

type Snapshot = { snapshotId: string; system: { name: string | null; brief: string | null; source: string | null }; nodes: Record<string, { doc: string | null }> };

function snapshot(dir: string): Snapshot {
  return JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as Snapshot;
}

const README = `# shop

**English** · [Українською](README.uk.md)

[![CI](https://ci.example/badge.svg)](https://ci.example) ![logo](logo.png)

Shop is a *tiny* store for [tests](docs/tests.md). It keeps orders in memory and never saves them. A third sentence the map leaves out.
`;

test("readmeBrief: the first paragraph that reads as a sentence, past switchers, badges, headings, code and HTML", () => {
  assert.equal(readmeBrief(README), "Shop is a tiny store for tests. It keeps orders in memory and never saves them.");
  assert.equal(readmeBrief(""), null);
  assert.equal(readmeBrief("# Title\n\n[![a](b)](c)\n\n**EN** · [UK](x)\n"), null);
  // A heading in either form, fenced and indented code, an HTML block and comment, a list, a quote, a table: none is prose.
  const blocks = [
    "Setext Heading Line Here.",
    "=========",
    "",
    "```sh",
    "",
    "npm install the package. Then run it.",
    "```",
    "",
    "    indented code that reads like a sentence.",
    "",
    "<p align=\"center\">A centred tagline of four words.</p>",
    "",
    "<!--",
    "A hidden note of several words.",
    "-->",
    "",
    "- A list item with a full sentence.",
    "1. A numbered item with one too.",
    "> A quoted line of several words.",
    "| a table row with several words. |",
    "",
    "The real description of the project starts here. It has two sentences.",
  ].join("\n");
  assert.equal(readmeBrief(blocks), "The real description of the project starts here. It has two sentences.");
  assert.equal(readmeBrief("Uses **strong** and _emphasis_ and `code` words. Done."), "Uses strong and emphasis and `code` words. Done.");
  assert.equal(readmeBrief("Three words only.\n\nThis paragraph has enough words to count."), "This paragraph has enough words to count.");
});

test("globDirectory: the one directory every glob owns, else none", () => {
  assert.equal(globDirectory(["src/tui/**"]), "src/tui");
  assert.equal(globDirectory(["src/app/**/*.ts", "src/app/**"]), "src/app");
  assert.equal(globDirectory(["src/a/**", "src/b/**"]), null);
  assert.equal(globDirectory(["src/cli.ts", "src/lsp.ts"]), null);
  assert.equal(globDirectory(["src/**/*.ts", "bin/**"]), null);
  assert.equal(globDirectory([]), null);
});

test("map: the start page of the explained map opens with the README's first sentences under the manifest name", (t) => {
  const dir = repo(t, { "README.md": README, "package.json": '{"name":"shop","description":"A test shop for keylang."}\n' });
  const o = keylang(dir, ["map"]);
  assert.equal(o.status, 0, o.stderr);
  assert.equal(systemSection(dir), "## shop\n\nShop is a tiny store for tests. It keeps orders in memory and never saves them. _(README.md)_");
  assert.deepEqual(snapshot(dir).system, { name: "shop", brief: "Shop is a tiny store for tests. It keeps orders in memory and never saves them.", source: "README.md" });
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);
  assert.equal(keylang(dir, ["parse", "keylang/map-explained"]).status, 0);
});

test("map: without a README a manifest describes the repository: package.json, Cargo.toml, pyproject.toml", (t) => {
  const npm = repo(t, { "package.json": '{"name":"shop","description":"A test shop for keylang."}\n' });
  assert.equal(keylang(npm, ["map"]).status, 0);
  assert.equal(systemSection(npm), "## shop\n\nA test shop for keylang. _(package.json)_");

  const cargo = repo(t, { "Cargo.toml": '[package]\nname = "shop-rs"\ndescription = "A shop in Rust."\n' });
  assert.equal(keylang(cargo, ["map"]).status, 0);
  assert.equal(systemSection(cargo), "## shop-rs\n\nA shop in Rust. _(Cargo.toml)_");

  const python = repo(t, { "pyproject.toml": '[project]\nname = "shop-py"\ndescription = "A shop in Python."\n' });
  assert.equal(keylang(python, ["map"]).status, 0);
  assert.equal(systemSection(python), "## shop-py\n\nA shop in Python. _(pyproject.toml)_");

  // A README without a sentence leaves the word to the manifest.
  const badges = repo(t, { "README.md": "# shop\n\n[![CI](b.svg)](c)\n", "package.json": '{"description":"Described by the manifest."}\n' });
  assert.equal(keylang(badges, ["map"]).status, 0);
  assert.equal(systemSection(badges), "## Repository\n\nDescribed by the manifest. _(package.json)_");
});

test("map: with neither a README paragraph nor a description, a dash and how to ask a model", (t) => {
  const dir = repo(t);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.equal(systemSection(dir), "## Repository\n\n— Neither a README paragraph nor a manifest description says what this repository is; `keylang explain --missing --llm` asks a model for a brief.");
  assert.deepEqual(snapshot(dir).system, { name: null, brief: null, source: null });
});

test("map --check: an edited README makes the explained map stale and keeps the snapshot id", (t) => {
  const dir = repo(t, { "README.md": README });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const before = snapshot(dir).snapshotId;
  writeFileSync(join(dir, "README.md"), README.replace("Shop is a *tiny* store", "Shop is a small store"));
  const stale = keylang(dir, ["map", "--check"]);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.match(systemSection(dir), /^Shop is a small store for tests\./m);
  // A README is no code: test reports and traces of the snapshot stay current.
  assert.equal(snapshot(dir).snapshotId, before);
  assert.equal(keylang(dir, ["map", "--check"]).status, 0);
});

test("map: a layer's own directory describes the layer: its README, else the doc comment of its index module", (t) => {
  const dir = repo(t, {
    "src/domain/README.md": "# Domain\n\nThe rules of the shop: orders and money. Nothing here does I/O.\n",
    "src/app/index.ts": "// The application layer: use cases the screens call.\n\nexport const ready = true;\n",
  });
  assert.equal(keylang(dir, ["map"]).status, 0);
  const nodes = snapshot(dir).nodes;
  assert.equal(nodes.domain!.doc, "The rules of the shop: orders and money. Nothing here does I/O.");
  assert.equal(nodes.app!.doc, "The application layer: use cases the screens call.");
  assert.match(readme(dir), /^\| \[domain\]\(domain\.md\) \| The rules of the shop: orders and money\. Nothing here does I\/O\. \|/m);
  assert.match(readFileSync(join(dir, "keylang/map-explained/domain.md"), "utf8"), /^- domain\n {2}<a id="domain"><\/a><br>The rules of the shop: orders and money\. Nothing here does I\/O\.$/m);
  // A layer listed by files owns no directory, so a README beside its files does not speak for it.
  const listed = repo(t, { "src/domain/README.md": "# Domain\n\nThe rules of the shop: orders and money. Nothing here does I/O.\n" });
  const config = JSON.parse(readFileSync(join(listed, "keylang.json"), "utf8")) as { layers: Record<string, string | string[]> };
  config.layers.domain = ["src/domain/money.ts", "src/domain/order.ts"];
  writeFileSync(join(listed, "keylang.json"), JSON.stringify(config));
  assert.equal(keylang(listed, ["map"]).status, 0);
  assert.equal(snapshot(listed).nodes.domain!.doc, null);
});

interface Mock {
  url: string;
  prompts: { system: string; prompt: string }[];
  reply: (system: string, prompt: string) => string;
}

/** A local stand-in for the Messages API: no network, answers with `mock.reply`. */
async function mockAnthropic(t: TestContext): Promise<Mock> {
  const mock: Mock = { url: "", prompts: [], reply: () => "" };
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      const body = JSON.parse(data) as { system: string; messages: { content: string }[] };
      const prompt = body.messages[0]?.content ?? "";
      mock.prompts.push({ system: body.system, prompt });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: mock.reply(body.system, prompt) }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return mock;
}

function withModel(dir: string, mock: Mock): Record<string, string | undefined> {
  const file = join(dir, "keylang.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), agent: "anthropic:claude-opus-5" }));
  return { ANTHROPIC_BASE_URL: mock.url, ANTHROPIC_API_KEY: "test-key", ANTHROPIC_AUTH_TOKEN: undefined, HOME: dir };
}

/** What a prompt asks about: a node's ID, or the repository. */
function asked(system: string, prompt: string): string {
  if (system.startsWith("You describe a whole repository")) return "@system";
  return /^Node:\n(?:planned )?\S+ (\S+)/.exec(prompt)?.[1] ?? "?";
}

test("explain --missing --llm: the repository is asked last, through its layers' briefs, and only when its README and manifests say nothing", async (t) => {
  const dir = repo(t, { "src/domain/README.md": "# Domain\n\nThe rules of the shop: orders and money. Nothing here does I/O.\n" });
  const mock = await mockAnthropic(t);
  const env = withModel(dir, mock);
  mock.reply = (system, prompt) => (asked(system, prompt) === "@system" ? "A test shop that turns carts into orders. It keeps them in memory." : `Brief of ${asked(system, prompt)}.`);
  const dry = keylang(dir, ["explain", "--missing", "--dry-run"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /, 1 layer, 1 system\n/);
  const run = await keylangAsync(dir, ["explain", "--missing", "--llm"], env);
  assert.equal(run.status, 0, run.stderr);
  const order = mock.prompts.map((p) => asked(p.system, p.prompt));
  assert.equal(order.at(-1), "@system");
  // A layer whose directory has a README is never asked about.
  assert.ok(!order.includes("domain"), order.join(", "));
  assert.ok(order.includes("app"), order.join(", "));
  const systemPrompt = mock.prompts.at(-1)!;
  assert.match(systemPrompt.system, /at most two short sentences in one paragraph, no line breaks, about 200 characters in all: what the repository is and who it is for/);
  assert.match(systemPrompt.prompt, /^Repository: \(no name in a manifest\)$/m);
  assert.match(systemPrompt.prompt, /^- layer `app`: Brief of app\.$/m);
  assert.match(systemPrompt.prompt, /^- layer `domain`: The rules of the shop: orders and money\. Nothing here does I\/O\.$/m);
  assert.match(systemPrompt.prompt, /^- flow checkout/m);
  assert.match(readFileSync(join(dir, "keylang/explain/brief/@system.md"), "utf8"), /^<!-- keylang:explain agent=anthropic:claude-opus-5 date=\S+ closure=[0-9a-f]{64} lang=en detail=brief -->\nA test shop that turns carts into orders\. It keeps them in memory\.\n$/);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.equal(systemSection(dir), `## Repository\n\nA test shop that turns carts into orders. It keeps them in memory. _(llm · claude-opus-5 · ${today})_`);
  // Nothing left to ask: the repository's brief is fresh.
  assert.doesNotMatch(keylang(dir, ["explain", "--missing"]).stdout, /@system/);
  assert.doesNotMatch(keylang(dir, ["explain", "--stale"]).stdout, /@system/);
  // A rewritten layer brief makes the repository's brief stale; the layer's own stays fresh.
  const appBrief = join(dir, "keylang/explain/brief/app.md");
  writeFileSync(appBrief, readFileSync(appBrief, "utf8").replace("Brief of app.", "The screens of the shop."));
  const stale = keylang(dir, ["explain", "--stale"]);
  assert.match(stale.stdout, new RegExp(`^@system \\(brief\\): stale \\(explained ${today}\\); run \`keylang explain --stale --llm\`$`, "m"));
  assert.doesNotMatch(stale.stdout, /^app /m);

  // A README says it now: the model's brief stays on disk and is not shown, and no batch asks again.
  writeFileSync(join(dir, "README.md"), README);
  assert.equal(keylang(dir, ["map"]).status, 0);
  assert.match(systemSection(dir), /_\(README\.md\)_$/);
  assert.doesNotMatch(keylang(dir, ["explain", "--missing"]).stdout, /@system/);
});

test("explain --stale: the repository's brief goes stale with its layers' briefs, never gone, beside a layer named system", (t) => {
  const dir = repo(t);
  const config = JSON.parse(readFileSync(join(dir, "keylang.json"), "utf8")) as { layers: Record<string, string> };
  config.layers = { system: "src/domain/**", app: "src/app/**" };
  writeFileSync(join(dir, "keylang.json"), JSON.stringify(config));
  assert.equal(keylang(dir, ["map"]).status, 0);
  const header = (closure: string): string => `<!-- keylang:explain agent=anthropic:claude-opus-5 date=2026-10-01 closure=${closure} lang=en detail=brief -->\n`;
  mkdirSync(join(dir, "keylang/explain/brief"), { recursive: true });
  writeFileSync(join(dir, "keylang/explain/brief/system.md"), `${header("x")}The layer named system.\n`);
  writeFileSync(join(dir, "keylang/explain/brief/@system.md"), `${header("0".repeat(64))}A shop for tests.\n`);
  const listed = keylang(dir, ["explain", "--stale"]).stdout;
  assert.match(listed, /^@system \(brief\): stale \(explained 2026-10-01\); run `keylang explain --stale --llm`$/m);
  assert.match(listed, /^system \(brief\): stale \(explained 2026-10-01\); run `keylang explain system --llm --brief`$/m);
  assert.doesNotMatch(listed, /gone/);
  assert.equal(keylang(dir, ["map"]).status, 0);
  // The layer named `system` keeps its own brief; the repository has its own.
  assert.match(readme(dir), /^\| \[system\]\(system\.md\) \| The layer named system\. _\(llm · claude-opus-5 · 2026-10-01 · stale\)_ \|/m);
  assert.match(systemSection(dir), /^A shop for tests\. _\(llm · claude-opus-5 · 2026-10-01 · stale\)_$/m);
});
