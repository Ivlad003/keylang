// The tests that must not run beside `npm pack`, one after another in one
// file. While it packs, `npm pack` swaps bin/keylang.js for the published
// entry: bin/ is a source of the repository's map, and a run of the
// published entry hashes dist/extract/ into the fact cache's version. Here:
// the repository's committed map, the npm package, the `@flow` tests that
// write .keylang/trace, the check of the repository's own flows that reads
// those traces, and `hook stop`, which must leave the fact cache as it is.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { GRAMMARS, wasmFile } from "../src/extract/grammars.ts";
import { bin, git, keylang, LAYERS, ORDER, PAY, repoCopy, root, tempDir, treeBytes, writeTree } from "./cli-helpers.ts";

test("generated maps of the repo and the fixture parse", () => {
  const fixture = repoCopy();
  try {
    assert.equal(keylang(fixture, ["map"]).status, 0);
    assert.equal(keylang(root, ["map", "--check"]).status, 0, "committed keylang map is stale");
    for (const cwd of [fixture, root]) {
      for (const name of readdirSync(join(cwd, "keylang/map"))) {
        if (!name.endsWith(".md")) continue;
        const parsed = keylang(cwd, ["parse", join("keylang/map", name)]);
        assert.equal(parsed.status, 0, `${name}: ${parsed.stderr}`);
      }
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("packed tarball runs the CLI from node_modules", async (t) => {
  const pack = spawnSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(pack.status, 0, pack.stderr);
  const packed = JSON.parse(pack.stdout) as { filename: string }[];
  const tarball = join(root, packed[0]!.filename);
  const tmp = mkdtempSync(join(tmpdir(), "keylang-pack-"));
  const localRepo = repoCopy();
  const packedRepo = repoCopy();
  t.after(() => {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(localRepo, { recursive: true, force: true });
    rmSync(packedRepo, { recursive: true, force: true });
    rmSync(tarball, { force: true });
  });

  const listing = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  const names = listing.stdout.split("\n");
  assert.ok(names.some((n) => n.endsWith("/dist/cli.js")));
  // Every grammar the runtime loads ships in dist/wasm, which the package reads instead of @vscode/tree-sitter-wasm.
  for (const grammar of GRAMMARS) assert.ok(names.some((n) => n.endsWith(`/dist/wasm/${wasmFile(grammar)}`)), grammar);
  assert.ok(names.some((n) => n.endsWith("/bin/keylang.js")));
  for (const asset of ["xterm.js", "xterm.css", "addon-fit.js", "xterm.LICENSE"]) assert.ok(names.some((n) => n.endsWith(`/dist/web/${asset}`)), asset);
  assert.ok(names.some((n) => n.endsWith("/dist/tui/analysis-worker.js")));
  assert.ok(names.some((n) => n.endsWith("/dist/tui/operation-worker.js")));
  assert.equal(names.some((n) => n.includes("/src/")), false);
  const published = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; files: string[] };
  assert.ok(published.files.includes("bin"));
  assert.ok(published.files.includes("dist"));
  assert.ok(published.files.includes("dist/wasm"));

  writeFileSync(join(tmp, "package.json"), '{"name":"keylang-pack-test","private":true}\n');
  const install = spawnSync("npm", ["install", "--omit=dev", "--offline", "--ignore-scripts", tarball], {
    cwd: tmp,
    encoding: "utf8",
  });
  assert.equal(install.status, 0, install.stderr);
  // The grammars ship in dist/wasm, and local voice is an optional peer the user adds: a plain install pulls in neither.
  for (const name of ["@vscode/tree-sitter-wasm", "@fugood/whisper.node", "decibri"]) assert.equal(existsSync(join(tmp, "node_modules", name)), false, name);
  const installedBin = join(tmp, "node_modules/keylang/bin/keylang.js");
  const version = spawnSync(process.execPath, [installedBin, "--version"], { cwd: tmp, encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout, `keylang ${published.version}\n`);
  const help = spawnSync(process.execPath, [installedBin, "--help"], { cwd: tmp, encoding: "utf8" });
  assert.equal(help.stdout, keylang(root, ["--help"]).stdout);
  // The library entry the README documents: `import { parse } from "keylang"`.
  const api = spawnSync(process.execPath, ["--input-type=module", "-e", 'const k = await import("keylang"); console.log(typeof k.parse)'], { cwd: tmp, encoding: "utf8" });
  assert.equal(api.stdout, "function\n", api.stderr);
  assert.doesNotMatch(listing.stdout, /dist\/tui\/websocket\.js/, "prepack starts from an empty dist/");
  // Without the optional voice modules (no prebuilt binary for a platform, or `--omit=optional`) the CLI works and says so.
  // A directory of its own: module resolution must not find the first install in a parent's node_modules.
  const bare = mkdtempSync(join(tmpdir(), "keylang-bare-"));
  try {
    writeFileSync(join(bare, "package.json"), '{"name":"keylang-bare-test","private":true}\n');
    const bareInstall = spawnSync("npm", ["install", "--omit=dev", "--omit=optional", "--offline", "--ignore-scripts", tarball], { cwd: bare, encoding: "utf8" });
    assert.equal(bareInstall.status, 0, bareInstall.stderr);
    assert.ok(!existsSync(join(bare, "node_modules/decibri")) && !existsSync(join(bare, "node_modules/@fugood/whisper.node")));
    const doctor = spawnSync(process.execPath, [join(bare, "node_modules/keylang/bin/keylang.js"), "doctor"], { cwd: bare, encoding: "utf8", env: { ...process.env, HOME: bare } });
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /^@fugood\/whisper\.node: not installed \(optional\)$/m);
    assert.match(doctor.stdout, /^microphone \(decibri\): not installed/m);
    assert.match(doctor.stdout, /^local voice: npm i -g @fugood\/whisper\.node decibri \(beside a global keylang\) or npm i -D @fugood\/whisper\.node decibri \(in a project with keylang\)$/m);
    // Installed but not loadable (no prebuilt binary for the platform): unavailable with the reason, still code 0,
    // and whisper.node's console.warn while it looks for a binary does not reach the output.
    mkdirSync(join(bare, "node_modules/decibri"), { recursive: true });
    writeFileSync(join(bare, "node_modules/decibri/package.json"), '{"name":"decibri","version":"0.0.0","main":"index.js"}\n');
    writeFileSync(join(bare, "node_modules/decibri/index.js"), 'throw new Error("Failed to load native binding");\n');
    mkdirSync(join(bare, "node_modules/@fugood/whisper.node"), { recursive: true });
    writeFileSync(join(bare, "node_modules/@fugood/whisper.node/package.json"), '{"name":"@fugood/whisper.node","version":"0.0.0","main":"index.js"}\n');
    writeFileSync(
      join(bare, "node_modules/@fugood/whisper.node/index.js"),
      'exports.initWhisper = async () => { throw new Error("no binary"); };\nexports.loadWhisperModule = async () => { console.warn("Not found package for your platform, fallback to local build"); throw new Error("Failed to load whisper.node: no build/Release/index.node"); };\n',
    );
    const broken = spawnSync(process.execPath, [join(bare, "node_modules/keylang/bin/keylang.js"), "doctor"], { cwd: bare, encoding: "utf8", env: { ...process.env, HOME: bare } });
    assert.equal(broken.status, 0, broken.stderr);
    assert.match(broken.stdout, /^@fugood\/whisper\.node: unavailable: Failed to load whisper\.node: no build\/Release\/index\.node; Not found package for your platform/m);
    assert.match(broken.stdout, /^microphone \(decibri\): unavailable: Failed to load native binding/m);
    assert.match(broken.stdout, /^voice: engine auto → install the optional @fugood\/whisper\.node/m, "an unavailable whisper is not an engine");
    assert.doesNotMatch(`${broken.stdout}${broken.stderr}`, /^Not found package/m);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }

  const localParse = keylang(localRepo, ["parse", "--json", "keylang/rules.md"]);
  const packedParse = spawnSync(process.execPath, [installedBin, "parse", "--json", "keylang/rules.md"], {
    cwd: packedRepo,
    encoding: "utf8",
  });
  assert.equal(packedParse.status, 0, packedParse.stderr);
  assert.equal(packedParse.stdout, localParse.stdout);

  assert.equal(keylang(localRepo, ["map"]).status, 0);
  const packedMap = spawnSync(process.execPath, [installedBin, "map"], { cwd: packedRepo, encoding: "utf8" });
  assert.equal(packedMap.status, 0, packedMap.stderr);
  for (const name of readdirSync(join(localRepo, "keylang/map"))) {
    assert.equal(
      readFileSync(join(packedRepo, "keylang/map", name), "utf8"),
      readFileSync(join(localRepo, "keylang/map", name), "utf8"),
      name,
    );
  }
  // The TUI's operation worker runs from the package's JS entry: the same map check as the packed CLI.
  // A script file, not `--eval`: a worker inherits the parent's exec flags, and `--input-type` refuses a file entry.
  const workerScript = join(tmp, "operation-worker-check.mjs");
  writeFileSync(
    workerScript,
    `const { OperationWorker } = await import(${JSON.stringify(pathToFileURL(join(tmp, "node_modules/keylang/dist/tui/background.js")).href)});\n` +
      `const worker = new OperationWorker();\n` +
      `const result = await worker.run({ kind: "map-check", root: ${JSON.stringify(packedRepo)} });\n` +
      `worker.close();\n` +
      `console.log(JSON.stringify([result.status, result.exitCode]));\n` +
      `if (result.status !== "completed") console.error(JSON.stringify(result.messages));\n`,
  );
  const packedWorker = spawnSync(process.execPath, [workerScript], { cwd: tmp, encoding: "utf8" });
  assert.equal(packedWorker.stdout, `${JSON.stringify(["completed", spawnSync(process.execPath, [installedBin, "map", "--check"], { cwd: packedRepo, encoding: "utf8" }).status])}\n`, packedWorker.stderr);
  const localIndex = JSON.parse(readFileSync(join(localRepo, ".keylang/index.json"), "utf8"));
  const packedIndex = JSON.parse(readFileSync(join(packedRepo, ".keylang/index.json"), "utf8"));
  assert.equal(packedIndex.snapshotId, localIndex.snapshotId);
  assert.equal(packedIndex.schema, localIndex.schema);
  // The package names its grammars from dist/wasm/grammars.json and its runtime from web-tree-sitter's own package.json.
  assert.deepEqual(packedIndex.manifest.grammars, localIndex.manifest.grammars);
  for (const version of Object.values(packedIndex.manifest.grammars as Record<string, string>)) assert.match(version, /^\d+\.\d+\.\d+/);
  // Rust, Python and PHP parse with the package's own grammars too: the same map and snapshot as the checkout.
  for (const fixture of ["rust-shop", "py-shop", "php-shop"]) {
    const local = mkdtempSync(join(tmpdir(), `keylang-${fixture}-`));
    const packedCopy = mkdtempSync(join(tmpdir(), `keylang-${fixture}-packed-`));
    t.after(() => {
      rmSync(local, { recursive: true, force: true });
      rmSync(packedCopy, { recursive: true, force: true });
    });
    cpSync(join(root, "tests/fixtures", fixture), local, { recursive: true });
    cpSync(join(root, "tests/fixtures", fixture), packedCopy, { recursive: true });
    assert.equal(keylang(local, ["init"]).status, 0, fixture);
    const packedInit = spawnSync(process.execPath, [installedBin, "init"], { cwd: packedCopy, encoding: "utf8" });
    assert.equal(packedInit.status, 0, `${fixture}: ${packedInit.stderr}`);
    const maps = readdirSync(join(local, "keylang/map"));
    assert.ok(maps.length > 0, fixture);
    for (const name of maps) assert.equal(readFileSync(join(packedCopy, "keylang/map", name), "utf8"), readFileSync(join(local, "keylang/map", name), "utf8"), `${fixture}: ${name}`);
    const snapshotOf = (dir: string): string => (JSON.parse(readFileSync(join(dir, ".keylang/index.json"), "utf8")) as { snapshotId: string }).snapshotId;
    assert.equal(snapshotOf(packedCopy), snapshotOf(local), fixture);
  }

  // `keylang web` from the package: xterm.js from dist/web, the snapshot from the dist worker.
  const web = spawn(process.execPath, [installedBin, "web", "--port", "0"], { cwd: packedRepo, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => web.kill("SIGINT"));
  let out = "";
  web.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
  const started = Date.now();
  while (!/keylang web: (\S+)/.test(out)) {
    assert.ok(Date.now() - started < 10000, "keylang web did not print its URL");
    await new Promise((done) => setTimeout(done, 20));
  }
  const url = new URL(/keylang web: (\S+)/.exec(out)![1]!);
  const asset = await fetch(new URL("/assets/xterm.js", url));
  assert.equal(asset.status, 200);
  assert.ok((await asset.text()).length > 100000);
  const frames: string[] = [];
  const socket = new WebSocket(`ws://${url.host}/ws`, ["keylang", `keylang.t.${new URLSearchParams(url.hash.slice(1)).get("t")}`]);
  socket.onmessage = (event) => frames.push(String(event.data));
  socket.onopen = () => socket.send(JSON.stringify({ type: "hello", session: "packed-session", cols: 100, rows: 24 }));
  while (!/✗ 0/.test(frames.join(""))) {
    assert.ok(Date.now() - started < 20000, `no analysis over the socket: ${frames.join("").slice(-400)}`);
    await new Promise((done) => setTimeout(done, 20));
  }
  socket.close();
});

// The one real flow of keylang: `keylang check` on a repository. The trace
// adapter instruments the trigger and steps of `keylang/flows/check.md`; the
// trace lands in `.keylang/trace/` (git-ignored, like `.keylang/index.json`).
test("@flow check: check reports a denied import without writing the map", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  appendFileSync(join(dir, "src/domain/order.ts"), 'import { save } from "../infra/db.ts";\nexport function again(o: Order): void { save(o); }\n');
  const trace = join(root, ".keylang/trace/check.jsonl");
  rmSync(trace, { force: true });
  const r = spawnSync(process.execPath, ["--import", join(root, "src/adapters/trace.ts"), bin, "check"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, KEYLANG_TRACE: trace, KEYLANG_TRACE_FLOW: "check", KEYLANG_TRACE_TEST: "tests/cli.test.ts > @flow check", KEYLANG_TRACE_ROOT: root },
  });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /K102 divergence: `domain\.order` depends on `infra\.db`/);
  assert.equal(existsSync(join(dir, ".keylang/index.json")), false);
  const events = readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string; symbolId?: string; complete?: boolean });
  assert.equal(events.at(-1)?.event, "run");
  assert.equal(events.at(-1)?.complete, true);
  for (const id of ["cli.cli.main", "cli.cli.cmdCheck", "map.analyze.analyze", "check.rules.evaluateRules", "features.check-format.checkReportText"]) {
    assert.ok(events.some((event) => event.event === "start" && event.symbolId === id), id);
  }
});

// The TUI flow of `keylang/flows/tui.md`: one F5 in a session wired as
// `keylang` wires it, so the snapshot comes from `SnapshotWorker`.
test("@flow tui: F5 reanalyses with the snapshot from the worker", (t) => {
  const dir = repoCopy();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const trace = join(root, ".keylang/trace/tui.jsonl");
  rmSync(trace, { force: true });
  const r = spawnSync(process.execPath, ["--import", join(root, "src/adapters/trace.ts"), join(root, "tests/fixtures/tui-session/session.ts"), dir], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, KEYLANG_TRACE: trace, KEYLANG_TRACE_FLOW: "tui", KEYLANG_TRACE_TEST: "tests/cli.test.ts > @flow tui", KEYLANG_TRACE_ROOT: root },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^[0-9a-f]{64}\n$/, "the session got a snapshot");
  const events = readFileSync(trace, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { event: string; symbolId?: string; complete?: boolean });
  assert.equal(events.at(-1)?.event, "run");
  assert.equal(events.at(-1)?.complete, true);
  for (const id of ["tui.app.App.input", "tui.input.InputDecoder.feed", "tui.app.App.handle", "tui.app.App.reanalyze", "map.analyze.analyze", "tui.background.SnapshotWorker.generate"]) {
    assert.ok(events.some((event) => event.event === "start" && event.symbolId === id), id);
  }
});

test("the in-repo check flow reports ID, static, tests, and trace separately", () => {
  const checked = keylang(root, ["check", "--format", "json"]);
  const rows = (JSON.parse(checked.stdout) as { results: { criterion: string; area: string; verdict: string; evidence: string }[] }).results;
  const steps = ["cli.cli.run", "cli.cli.cmdCheck", "map.analyze.analyze", "map.map.generateMap", "lang.parser.parse", "check.assess.assess", "check.resolve.check", "check.rules.evaluateRules", "check.flows.evaluateFlows", "features.check-format.checkReportText"];
  for (const id of steps) {
    for (const criterion of ["ID", "static", "trace"]) assert.ok(rows.some((row) => row.criterion === criterion && row.area === id), `${criterion} ${id}`);
    assert.equal(rows.find((row) => row.criterion === "ID" && row.area === id)?.verdict, "ok", id);
    assert.equal(rows.find((row) => row.criterion === "static" && row.area === id)?.verdict, "ok", id);
  }
  // The trace of the @flow test above belongs to this snapshot.
  for (const id of steps) assert.equal(rows.find((row) => row.criterion === "trace" && row.area === id)?.verdict, "ok", id);
  // The TUI flow: `this.decoder.feed`, the `analyzer` hook's default, and the injected `generate` are static paths.
  for (const id of ["tui.input.InputDecoder.feed", "tui.app.App.handle", "tui.app.App.reanalyze", "tui.background.SnapshotWorker.generate"]) {
    assert.equal(rows.find((row) => row.criterion === "static" && row.area === id)?.verdict, "ok", id);
  }
  assert.ok(rows.some((row) => row.criterion === "tests" && row.area.startsWith("invariant a denied import")));
  const again = keylang(root, ["check", "--format", "json"]);
  assert.equal(again.stdout, checked.stdout);
});

test("check --changed filters to the touched files; hook stop blocks once and writes nothing", (t) => {
  const dir = tempDir(t, "keylang-changed-");
  writeTree(dir, {
    "keylang.json": `${JSON.stringify(LAYERS)}\n`,
    "src/app/pay.ts": PAY,
    "src/domain/order.ts": ORDER,
    "keylang/flows/old.md": "# flow old\n\n- planned fn domain.order.later (n: number) → number\n- trigger domain.order.price\n  - step domain.order.later\n",
  });
  assert.equal(keylang(dir, ["baseline"]).status, 0);
  git(dir, ["init"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  const plain = keylang(dir, ["check", "--changed"]);
  assert.equal(plain.status, 0, plain.stdout);
  assert.doesNotMatch(plain.stdout, /domain\.order\.later/);
  writeFileSync(join(dir, "src/app/pay.ts"), 'import { price } from "../domain/order.ts";\nexport function charge(): number {\n  return price();\n}\n');
  const changed = keylang(dir, ["check", "--changed"]);
  assert.equal(changed.status, 1, changed.stdout);
  assert.match(changed.stdout, /K102/);
  assert.doesNotMatch(changed.stdout, /domain\.order\.later/);
  writeFileSync(join(dir, "keylang/flows/old.md"), "# flow old\n\n- trigger domain.order.missing\n");
  const spec = keylang(dir, ["check", "--changed"]);
  assert.match(spec.stdout, /K001 dangling reference `domain\.order\.missing`/);
  const bare = tempDir(t, "keylang-nogit-");
  writeTree(bare, { "keylang.json": `${JSON.stringify(LAYERS)}\n`, "src/app/pay.ts": PAY, "keylang/rules.md": "# rules\n\n- deny app domain\n" });
  assert.notEqual(keylang(bare, ["check"]).status, 2);
  const noGit = keylang(bare, ["check", "--changed"]);
  assert.equal(noGit.status, 2);
  assert.match(noGit.stderr, /git/);

  const event = JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false });
  const hook = (input: string): { status: number | null; stdout: string } => {
    const r = spawnSync(process.execPath, [bin, "hook", "stop"], { cwd: dir, input, encoding: "utf8" });
    return { status: r.status, stdout: r.stdout };
  };
  const dirty = treeBytes(dir);
  const blocked = hook(event);
  const again = hook(event);
  assert.equal(blocked.status, 0, blocked.stdout);
  assert.equal(again.stdout, blocked.stdout);
  const decision = JSON.parse(blocked.stdout) as { decision: string; reason: string };
  assert.equal(decision.decision, "block");
  assert.match(decision.reason, /src\/app\/pay\.ts:\d+/);
  const skipped = hook(JSON.stringify({ stop_hook_active: true }));
  assert.equal(skipped.status, 0);
  assert.equal(JSON.parse(skipped.stdout).decision, undefined);
  assert.deepEqual(treeBytes(dir), dirty);
  writeFileSync(join(dir, "src/app/pay.ts"), PAY);
  writeFileSync(join(dir, "keylang/flows/old.md"), "# flow old\n\n- planned fn domain.order.later (n: number) → number\n- trigger domain.order.price\n  - step domain.order.later\n");
  const clean = hook(event);
  assert.equal(clean.status, 0, clean.stdout);
  JSON.parse(clean.stdout);
  assert.notEqual(JSON.parse(clean.stdout).decision, "block");
});
