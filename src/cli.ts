// `keylang` command line: the TUI (no command), web, init, map, check, parse, fmt.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CONFIG_FILE, configToJson, guessLayers, loadConfig, toPosix } from "./config.ts";
import { sameFinding } from "./assess.ts";
import { formatDiagnostic, isError, type Diagnostic } from "./diag.ts";
import { collectMdFiles, load } from "./files.ts";
import { formatSource } from "./fmt.ts";
import { kindLabel, sectionNodes, walk, type Document, type Node } from "./ir.ts";
import { analyze, findRoot, within } from "./analyze.ts";
import { diffMap, writeMap } from "./map.ts";
import { explainCode } from "./explain.ts";
import { formatSummary, summarizeNode } from "./explain-node.ts";
import { checkResults } from "./check-results.ts";
import { currentBaseline, explainedIds, explanationRequest, isStale, readExplanation, unknownIds, writeExplanation, type Explanation } from "./explain-llm.ts";
import { STATIC_MODES } from "./flows.ts";
import { tracePlan } from "./trace-plan.ts";
import { generateWire, WIRE_MARKER } from "./wire-gen.ts";
import { changedFlows, codeToSpec, diffHunks, draftFlow, draftRules, withFlow, type ChangedLines, type FlowDraft } from "./draft.ts";
import { stronglyConnected } from "./scc.ts";
import { codeProposalProblem, lineDiff, PROPOSALS_DIR, proposalProblem, writeProposal } from "./proposals.ts";
import { specToCode } from "./spec-to-code.ts";
import { addDrafts, updateStats } from "./stats.ts";
import { collectWiring } from "./wiring.ts";
import { serveLsp } from "./lsp.ts";
import { runTerminal } from "./tui/terminal.ts";
import { serveWeb } from "./tui/web.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { formatVerdict, type Verdict } from "./verdict.ts";
import { compareText } from "./span.ts";

const USAGE = `keylang: architecture description bound to a repository

Usage: keylang                      Open the TUI in this terminal (needs a TTY)
       keylang <command> [options] [paths…]

Commands:
  web [--port N] [--host H] The TUI in a browser tab: serves http://localhost:7070
                            with a one-time token (localhost only by default)
  init [dir]                Detect languages and layers, write keylang.json, build the map
  map [dir] [--check]       Generate <dir>/keylang/map/*.md and .keylang/index.json
                            (--check: fail if the committed map is stale)
  explain <code|id>         A diagnostic code: why it happens and how to fix it.
                            An id: what the snapshot and specs say about it (offline),
                            and its saved explanation with model, date and stale?
  explain <id> --llm        Explain the id in plain language with the configured
                            agent; saved in .keylang/explain/ (--full: in detail)
  explain --stale           List saved explanations whose code changed since
  draft flow <trigger>      Propose a flow from the snapshot's calls as
                            .keylang/proposals/<spec>; merge it with m in the TUI
                            (--mode algo|llm|hybrid, default hybrid: the model's steps
                            reconciled with the snapshot; hybrid without a model is algo;
                            --name n; --into <spec.md>; --print: stdout only)
  code-to-spec <path[:line]> Propose flows for the fn at the line (or every exported fn
                            of the file) as .keylang/proposals/<dir>/flows/<name>.md
                            (--print; --into <spec.md>); --since <git-ref> instead of a
                            path: the fns changed since the ref, in <dir>/flows/changes.md
  spec-to-code <id>         A stub for a planned fn with its declared signature in the
                            file its ID names, and a failing e2e test for each missing
                            test file its flows name, as proposals in .keylang/proposals/
                            merged hunk by hunk with m in the TUI; prints the diffs and what
                            check says with it in place (--into <file>; --print: nothing
                            written; --apply writes the files directly)
                            code-to-spec --mode algo|llm|hybrid (default hybrid, as draft);
                            spec-to-code --mode llm: the body and the tests from the model
  draft rules               Propose rules the code keeps now (layers order, no-cycles)
                            as .keylang/proposals/<dir>/rules.md (--print); --mode llm|hybrid:
                            the model's rules, each checked now: agree, conflict or llm-only
  draft map                 Print the layer layout keylang would guess as keylang.json;
                            writes nothing: the layout changes only when you edit it
                            (--mode llm|hybrid: the model's layout, validated, printed)
  lsp [--stdio]             Speak LSP over stdio (--stdio is accepted for clients)
  doctor                    What is set up: languages, the agent's credentials, voice
                            (engine, local model, microphone); changes nothing
  mcp                       Serve MCP over stdio for agents: search, node, code, flows,
                            check, explain, apply_diff (proposals only; nothing is merged)
  wire [--check] [--out f]  Generate keylang.gen.ts (or f) from \`# wiring\`: a typed wire()
                            that builds each factory once, dependencies first
                            (--check: fail if the file is stale; writes nothing)
  trace-plan <flow>         Print JSON: the flow's functions a trace adapter instruments
                            (Python, Rust), with the snapshot id and file hashes
  check [paths…]            Resolve IDs and check rules (default: ./keylang)
                            Rebuilds the analysis in memory; does not write the map
  parse [--json] <paths…>   Parse files (or all *.md under directories) and print the IR
  fmt [--check] <paths…>    Rewrite files in canonical format (--check: report only)

Options:
  -h, --help                Show this help
  -V, --version             Show version
  --strict                  Exit 1 when a required result is unverified
  --format <name>           check output: human (default), json, sarif, github
  --static <mode>           check: which calls prove a flow step statically:
                            behavior (default) also follows a hook's default
                            (\`x ?? f\`, \`g = f\`) and values callers inject for it;
                            shape follows only calls written in the code
  --port <n>                web: port (default 7070; 0 picks a free one)
  --host <addr>             web: address to listen on (default 127.0.0.1)
  --explain-edge <a> <b>    Print snapshot edges between ids a and b (a → b, then b → a),
                            or the unresolved constructs in a that could form one;
                            writes nothing

Exit codes: 0 no blocking findings, 1 violations (or unverified with --strict)
or a stale map with --check, 2 usage or I/O error.
`;

/** Runs the CLI and returns the exit code: 0 ok, 1 findings, 2 usage or I/O error. */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    return await run(argv);
  } catch (e) {
    process.stderr.write(`keylang: ${e instanceof Error ? e.message : String(e)}\n`);
    return 2;
  }
}

async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "V" },
      json: { type: "boolean" },
      check: { type: "boolean" },
      out: { type: "string" },
      llm: { type: "boolean" },
      mode: { type: "string" },
      name: { type: "string" },
      into: { type: "string" },
      print: { type: "boolean" },
      apply: { type: "boolean" },
      full: { type: "boolean" },
      stale: { type: "boolean" },
      strict: { type: "boolean" },
      format: { type: "string" },
      static: { type: "string" },
      "explain-edge": { type: "boolean" },
      // Language clients pass `--stdio` to name the transport; stdio is the only one.
      stdio: { type: "boolean" },
      port: { type: "string" },
      host: { type: "string" },
      since: { type: "string" },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (values.version) {
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    process.stdout.write(`keylang ${pkg.version}\n`);
    return 0;
  }
  const [cmd, ...paths] = positionals;
  if (cmd === undefined) {
    // Without a terminal there is nothing to draw on: usage, as before the TUI.
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write(USAGE);
      return 2;
    }
    return runTerminal(findRoot(process.cwd()));
  }
  switch (cmd) {
    case "init":
      return cmdInit(paths[0] ?? ".");
    case "map":
      return cmdMap(paths[0] ?? ".", values.check === true);
    case "check":
      return cmdCheck(paths, { strict: values.strict === true, format: values.format ?? "human", explain: values["explain-edge"] === true, static: values.static ?? "behavior" });
    case "explain":
      return cmdExplain(paths[0], { llm: values.llm === true, full: values.full === true, stale: values.stale === true });
    case "lsp":
      return serveLsp();
    case "doctor":
      return cmdDoctor();
    case "mcp": {
      // The MCP SDK loads only for this command.
      const { serveMcp } = await import("./mcp.ts");
      const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
      return serveMcp(findRoot(process.cwd()), pkg.version);
    }
    case "draft":
      return cmdDraft(paths, { mode: values.mode ?? "hybrid", name: values.name, into: values.into, print: values.print === true });
    case "spec-to-code":
      return cmdSpecToCode(paths[0], { into: values.into, apply: values.apply === true, print: values.print === true, mode: values.mode ?? "algo" });
    case "code-to-spec":
      return cmdCodeToSpec(paths[0], { into: values.into, print: values.print === true, mode: values.mode ?? "hybrid", since: values.since });
    case "wire":
      return cmdWire(values.out ?? "keylang.gen.ts", values.check === true);
    case "trace-plan":
      return cmdTracePlan(paths[0]);
    case "web":
      return cmdWeb(values.port ?? "7070", values.host ?? "127.0.0.1");
    case "parse":
      needPaths(cmd, paths);
      return cmdParse(paths, values.json === true);
    case "fmt":
      needPaths(cmd, paths);
      return cmdFmt(paths, values.check === true);
    default:
      throw new Error(`unknown command \`${cmd}\`; see --help`);
  }
}

async function cmdWeb(portText: string, host: string): Promise<number> {
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port > 65535) throw new Error(`web: --port must be a number from 0 to 65535, got \`${portText}\``);
  const server = await serveWeb({ root: findRoot(process.cwd()), port, host });
  process.stdout.write(`keylang web: ${server.url}\n`);
  process.stderr.write("open the URL in a browser; Ctrl+C stops the server\n");
  await new Promise<void>((resolve) => {
    // Ctrl+C with unsaved buffers in a session asks once more, like `q` in the TUI; SIGTERM always stops.
    let armed = false;
    const onInterrupt = (): void => {
      const unsaved = server.unsaved();
      if (unsaved.length > 0 && !armed) {
        armed = true;
        process.stderr.write(`keylang web: unsaved changes in ${unsaved.join(", ")}; Ctrl+C again stops the server and drops them\n`);
        return;
      }
      stop();
    };
    const stop = (): void => {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", stop);
  });
  await server.close();
  return 0;
}

async function cmdExplain(subject: string | undefined, opts: { llm: boolean; full: boolean; stale: boolean }): Promise<number> {
  if (opts.stale) {
    const analysis = await analyze({ root: findRoot(process.cwd()), withoutEvidence: true });
    for (const id of explainedIds(analysis.config.root)) {
      const e = readExplanation(analysis.config.root, id);
      if (!e) continue;
      if (currentBaseline(analysis, id) === null) process.stdout.write(`${id}: gone (explained ${e.date})\n`);
      else if (isStale(analysis, id, e)) process.stdout.write(`${id}: stale (explained ${e.date}); run \`keylang explain ${id} --llm\`\n`);
    }
    return 0;
  }
  if (!subject) throw new Error("explain: a code or an id is required");
  if (/^k\d+$/i.test(subject)) {
    const text = explainCode(subject);
    if (!text) throw new Error(`unknown code \`${subject}\``);
    process.stdout.write(`${text}\n`);
    return 0;
  }
  const analysis = await analyze({ root: findRoot(process.cwd()), withoutEvidence: true });
  const result = summarizeNode(analysis, subject);
  if ("unknown" in result) throw new Error(`unknown id \`${subject}\`${result.suggestion ? ` (did you mean \`${result.suggestion}\`?)` : ""}`);
  const root = analysis.config.root;
  const { lang } = analysis.config.explain;
  const detail = opts.full ? "full" : analysis.config.explain.detail;
  const saved = readExplanation(root, subject);
  const show = (e: Explanation): void => {
    const unknown = unknownIds(analysis, e.text);
    process.stdout.write(`${e.text}\n\n${e.agent} · ${e.date} · ${isStale(analysis, subject, e) ? "stale" : "fresh"}\n`);
    if (unknown.length > 0) process.stdout.write(`unknown ids: ${unknown.join(", ")}\n`);
  };
  if (!opts.llm) {
    process.stdout.write(`${formatSummary(result.summary)}\n`);
    if (saved) {
      process.stdout.write("\n");
      show(saved);
    }
    return 0;
  }
  // A fresh explanation of the same kind is read, not asked for again: offline and free.
  if (saved && !isStale(analysis, subject, saved) && saved.lang === lang && saved.detail === detail) {
    show(saved);
    return 0;
  }
  // The SDK loads only when a model is asked: other commands start without it.
  const { llmClient } = await import("./llm.ts");
  const setup = llmClient(analysis.config.agent);
  if ("missing" in setup) {
    process.stderr.write(`keylang: ${setup.missing}; showing what the snapshot says\n`);
    process.stdout.write(`${formatSummary(result.summary)}\n`);
    if (saved) {
      process.stdout.write("\n");
      show(saved);
    }
    return 0;
  }
  const text = await setup.client.complete(explanationRequest(analysis, result.summary, { lang, detail }));
  const e: Explanation = { agent: setup.client.agent, date: new Date().toISOString().slice(0, 10), closure: currentBaseline(analysis, subject) ?? "", lang, detail, text };
  writeExplanation(root, subject, e);
  show(e);
  return 0;
}

async function cmdDraft(args: string[], opts: { mode: string; name: string | undefined; into: string | undefined; print: boolean }): Promise<number> {
  const [what, trigger] = args;
  if (what === "rules" || what === "map") return cmdDraftLayout(what, opts);
  if (what !== "flow") throw new Error("draft: expected `draft flow <trigger>`, `draft rules` or `draft map`");
  if (!trigger) throw new Error("draft flow: a trigger id is required");
  if (opts.mode !== "algo" && opts.mode !== "llm" && opts.mode !== "hybrid") throw new Error(`draft: --mode must be algo, llm or hybrid, got \`${opts.mode}\``);
  const analysis = await analyze({ root: findRoot(process.cwd()), withoutEvidence: true });
  if (!analysis.snapshot) throw new Error("draft: no supported source files; run `keylang init`");
  if (analysis.snapshot.nodes[trigger]?.kind !== "fn") {
    const hint = analysis.index.suggest(trigger);
    throw new Error(`draft flow: \`${trigger}\` is not a fn of the snapshot${hint ? ` (did you mean \`${hint}\`?)` : ""}`);
  }
  let draft: { name: string; text: string; steps?: string[] } = draftFlow(analysis.snapshot, trigger, opts.name !== undefined ? { name: opts.name } : {});
  let summary = `${draft.steps!.length} step(s)`;
  if (opts.mode !== "algo") {
    const { llmClient } = await import("./llm.ts");
    const setup = llmClient(analysis.config.agent);
    if ("missing" in setup) {
      if (opts.mode === "llm") throw new Error(`draft --mode llm: ${setup.missing}`);
      process.stderr.write(`keylang: ${setup.missing}; drafting from the snapshot only (--mode algo)\n`);
    } else {
      const { draftFlowWithModel } = await import("./draft-llm.ts");
      const model = await draftFlowWithModel(analysis, trigger, setup.client, opts.mode, opts.name);
      draft = model;
      summary = Object.entries(model.counts).filter(([, n]) => n > 0).map(([status, n]) => `${n} ${status}`).join(", ");
      if (model.unknown.length > 0) process.stderr.write(`keylang: still unknown after ${model.rounds} round(s): ${model.unknown.join(", ")} (K001 after the merge unless declared planned)\n`);
      updateStats(analysis.config.root, (stats) => addDrafts(stats, model.counts, "proposed"));
    }
  }
  if (opts.print) {
    process.stdout.write(draft.text);
    return 0;
  }
  const root = analysis.config.root;
  const specDir = toPosix(relative(root, resolve(root, analysis.config.dir)));
  const target = toPosix(opts.into ?? `${specDir}/flows/${draft.name}.md`);
  const problem = proposalProblem(root, specDir, target, (p) => analysis.docs.some((doc) => doc.path === p && doc.generated !== null));
  if (problem) throw new Error(`draft: ${target}: ${problem}`);
  const abs = join(root, target);
  const proposal = withFlow(existsSync(abs) ? readFileSync(abs, "utf8") : null, draft);
  const file = writeProposal(root, target, proposal);
  process.stdout.write(`${toPosix(relative(process.cwd(), file))}: proposed flow \`${draft.name}\` for ${target} (${summary}); merge it with \`m\` in \`keylang\`\n`);
  return 0;
}

async function cmdSpecToCode(id: string | undefined, opts: { into: string | undefined; apply: boolean; print: boolean; mode: string }): Promise<number> {
  if (opts.apply && opts.print) throw new Error("spec-to-code: --apply writes the files, --print writes nothing; give one");
  if (!id) throw new Error("spec-to-code: a planned id is required");
  if (opts.mode !== "algo" && opts.mode !== "llm") throw new Error(`spec-to-code: --mode must be algo or llm, got \`${opts.mode}\``);
  const analysis = await analyze({ root: findRoot(process.cwd()), withoutEvidence: true });
  if (!analysis.snapshot) throw new Error("spec-to-code: no supported source files; run `keylang init`");
  let model;
  if (opts.mode === "llm") {
    const { llmClient } = await import("./llm.ts");
    const setup = llmClient(analysis.config.agent);
    if ("missing" in setup) throw new Error(`spec-to-code --mode llm: ${setup.missing}`);
    model = setup.client;
  }
  const c = await specToCode(analysis, id, opts.into === undefined ? undefined : toPosix(opts.into), model);
  process.stdout.write(`${c.file}${c.before === null ? " (new file)" : ""}\n${lineDiff(c.before ?? "", c.after)}\n\nwith the candidate in place:\n`);
  for (const v of c.verdicts) process.stdout.write(`${formatVerdict(v)}\n`);
  for (const d of c.diagnostics) process.stdout.write(`${formatDiagnostic(d)}\n`);
  for (const t of c.tests) process.stdout.write(`\n${t.file} (new file)\n${lineDiff("", t.after)}\n`);
  for (const note of c.testNotes) process.stderr.write(`keylang: ${note}\n`);
  const files = [c, ...c.tests];
  if (opts.print) {
    process.stderr.write(`keylang: nothing written; without --print the files become proposals, --apply writes them\n`);
    return 0;
  }
  if (!opts.apply) {
    const root = analysis.config.root;
    for (const f of files) {
      const problem = codeProposalProblem(root, f.file);
      if (problem) throw new Error(`spec-to-code: ${f.file}: ${problem}`);
    }
    for (const f of files) writeProposal(root, f.file, f.after);
    process.stderr.write(`keylang: proposed ${files.map((f) => `${PROPOSALS_DIR}/${f.file}`).join(", ")}; merge them hunk by hunk with \`m\` in \`keylang\` (--apply writes the files directly)\n`);
    return 0;
  }
  for (const f of files) {
    const abs = join(analysis.config.root, f.file);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.after);
  }
  const next = opts.mode === "llm" ? "review the body and the tests, then run them" : "write the body and its tests";
  process.stderr.write(`keylang: ${files.map((f) => f.file).join(", ")} written; run \`keylang map\`, then ${next}\n`);
  return 0;
}

async function cmdCodeToSpec(at: string | undefined, opts: { into: string | undefined; print: boolean; mode: string; since: string | undefined }): Promise<number> {
  if (at !== undefined && opts.since !== undefined) throw new Error("code-to-spec: give a path or --since, not both");
  if (at === undefined && opts.since === undefined) throw new Error("code-to-spec: a path, optionally with :line, or --since <git-ref> is required");
  const root = findRoot(process.cwd());
  const analysis = await analyze({ root, withoutEvidence: true });
  if (!analysis.snapshot) throw new Error("code-to-spec: no supported source files; run `keylang init`");
  let name: string;
  let algo: FlowDraft[];
  if (opts.since !== undefined) {
    const named = new Set<string>();
    for (const doc of analysis.docs) {
      if (doc.generated !== null) continue;
      for (const section of doc.sections) {
        if (section.kind !== "flow") continue;
        for (const top of sectionNodes(section)) walk(top, (node) => node.refs.forEach((ref) => named.add(ref.target)));
      }
    }
    const changes = changedFlows(analysis.snapshot, gitChanges(root, opts.since), named);
    if (changes.named.length > 0) process.stderr.write(`keylang: changed and already in flows (review those): ${changes.named.join(", ")}\n`);
    if (changes.drafts.length === 0) {
      process.stderr.write(`keylang: no fn outside the flows changed since ${opts.since}; nothing proposed\n`);
      return 0;
    }
    name = "changes";
    algo = changes.drafts;
  } else {
    const m = /^(.*?)(?::(\d+))?$/.exec(at!)!;
    const file = toPosix(relative(root, resolve(process.cwd(), m[1]!)));
    ({ name, drafts: algo } = codeToSpec(analysis.snapshot, file, m[2] === undefined ? null : Number(m[2])));
  }
  let drafts: { name: string; text: string }[] = algo;
  if (opts.mode !== "algo") {
    if (opts.mode !== "llm" && opts.mode !== "hybrid") throw new Error(`code-to-spec: --mode must be algo, llm or hybrid, got \`${opts.mode}\``);
    const { llmClient } = await import("./llm.ts");
    const setup = llmClient(analysis.config.agent);
    if ("missing" in setup) {
      if (opts.mode === "llm") throw new Error(`code-to-spec --mode llm: ${setup.missing}`);
      process.stderr.write(`keylang: ${setup.missing}; drafting from the snapshot only (--mode algo)\n`);
    } else {
      const { draftFlowWithModel } = await import("./draft-llm.ts");
      const mode = opts.mode;
      drafts = [];
      for (const d of algo) {
        const model = await draftFlowWithModel(analysis, d.steps[0]!, setup.client, mode);
        if (model.unknown.length > 0) process.stderr.write(`keylang: still unknown after ${model.rounds} round(s): ${model.unknown.join(", ")}\n`);
        updateStats(analysis.config.root, (stats) => addDrafts(stats, model.counts, "proposed"));
        drafts.push(model);
      }
    }
  }
  if (opts.print) {
    process.stdout.write(drafts.map((d) => d.text).join("\n"));
    return 0;
  }
  const specDir = toPosix(relative(root, resolve(root, analysis.config.dir)));
  const target = toPosix(opts.into ?? `${specDir}/flows/${name}.md`);
  const problem = proposalProblem(root, specDir, target, (p) => analysis.docs.some((doc) => doc.path === p && doc.generated !== null));
  if (problem) throw new Error(`code-to-spec: ${target}: ${problem}`);
  const abs = join(root, target);
  let text = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  for (const draft of drafts) text = withFlow(text, draft);
  const proposal = writeProposal(root, target, text!);
  process.stdout.write(`${toPosix(relative(process.cwd(), proposal))}: proposed ${drafts.map((d) => `\`${d.name}\``).join(", ")} for ${target}; merge it with \`m\` in \`keylang\`\n`);
  return 0;
}

async function cmdDraftLayout(what: "rules" | "map", opts: { mode: string; into: string | undefined; print: boolean }): Promise<number> {
  if (opts.mode !== "algo" && opts.mode !== "llm" && opts.mode !== "hybrid") throw new Error(`draft ${what}: --mode must be algo, llm or hybrid, got \`${opts.mode}\``);
  const root = findRoot(process.cwd());
  const model = async (): Promise<import("./llm.ts").LlmClient | null> => {
    if (opts.mode === "algo") return null;
    const { llmClient } = await import("./llm.ts");
    const setup = llmClient(loadConfig(root).agent);
    if ("missing" in setup) {
      if (opts.mode === "llm") throw new Error(`draft ${what} --mode llm: ${setup.missing}`);
      process.stderr.write(`keylang: ${setup.missing}; drafting from the snapshot only (--mode algo)\n`);
      return null;
    }
    return setup.client;
  };
  if (what === "map") {
    const client = await model();
    if (client) {
      const analysis = await analyze({ root, withoutEvidence: true });
      const { draftLayoutWithModel } = await import("./draft-llm.ts");
      const layers = await draftLayoutWithModel(analysis, client, analysis.snapshot?.manifest.files.map((f) => f.path) ?? []);
      process.stdout.write(configToJson({ ...analysis.config, layers: new Map(Object.entries(layers)), guessed: false }));
      process.stderr.write(`keylang: proposed by ${client.agent}; printed only; ${CONFIG_FILE} is unchanged\n`);
      return 0;
    }
    const config = loadConfig(root);
    const guessed = configToJson({ ...config, layers: guessLayers(root, config.exclude), guessed: true });
    const current = existsSync(join(root, CONFIG_FILE)) ? readFileSync(join(root, CONFIG_FILE), "utf8") : null;
    process.stdout.write(guessed);
    process.stderr.write(current === null ? `keylang: no ${CONFIG_FILE}; \`keylang init\` writes this layout\n` : `keylang: printed only; ${CONFIG_FILE} is unchanged\n`);
    return 0;
  }
  const analysis = await analyze({ root, withoutEvidence: true });
  if (!analysis.snapshot) throw new Error("draft: no supported source files; run `keylang init`");
  const adj = new Map<string, Set<string>>();
  for (const [id, node] of Object.entries(analysis.snapshot.nodes)) if (node.kind === "module") adj.set(id, new Set((node.deps ?? []).filter((d) => analysis.snapshot!.nodes[d]?.layer !== "external")));
  const algo = draftRules(analysis.snapshot, stronglyConnected(adj).length > 0);
  let text = algo;
  const client = await model();
  const specDirEarly = toPosix(relative(root, resolve(root, analysis.config.dir)));
  if (client) {
    const { draftRulesWithModel } = await import("./draft-llm.ts");
    const drafted = await draftRulesWithModel(analysis, client, opts.mode as "llm" | "hybrid", algo, toPosix(opts.into ?? `${specDirEarly}/rules.md`));
    text = drafted.text;
    for (const conflict of drafted.conflicts) process.stderr.write(`keylang: conflict: ${conflict}\n`);
    updateStats(root, (stats) => addDrafts(stats, drafted.counts, "proposed"));
  }
  if (opts.print) {
    process.stdout.write(text);
    return 0;
  }
  const specDir = toPosix(relative(root, resolve(root, analysis.config.dir)));
  const target = toPosix(opts.into ?? `${specDir}/rules.md`);
  const problem = proposalProblem(root, specDir, target, (p) => analysis.docs.some((doc) => doc.path === p && doc.generated !== null));
  if (problem) throw new Error(`draft: ${target}: ${problem}`);
  const abs = join(root, target);
  const existing = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  // An existing rules file keeps its text; the draft's rules follow it.
  const proposal = existing === null ? text : `${existing.replace(/\n*$/, "")}\n${text.split("\n").slice(2).join("\n")}`;
  const file = writeProposal(root, target, proposal);
  process.stdout.write(`${toPosix(relative(process.cwd(), file))}: proposed rules for ${target}; merge it with \`m\` in \`keylang\`\n`);
  return 0;
}

async function cmdWire(out: string, checkOnly: boolean): Promise<number> {
  const root = findRoot(process.cwd());
  const analyzed = await analyze({ root, withoutEvidence: true });
  if (!analyzed.snapshot) throw new Error("wire: no supported source files; run `keylang init`");
  const wiringCodes = new Set(["K001", "K002", "K005", "K102", "K301", "K302"]);
  const blocking = analyzed.diagnostics.filter((d) => isError(d) && wiringCodes.has(d.code) && analyzed.docs.some((doc) => doc.path === d.file && doc.sections.some((s) => s.kind === "wiring")));
  for (const d of blocking) process.stdout.write(`${formatDiagnostic(d)}\n`);
  if (blocking.length > 0) {
    process.stderr.write(`wire: ${blocking.length} error(s) in wiring; nothing written\n`);
    return 1;
  }
  const { wires } = collectWiring(analyzed.docs);
  if (wires.length === 0) throw new Error(`wire: no \`# wiring\` section under ${analyzed.config.dir}/`);
  const outPosix = toPosix(out);
  const text = generateWire({ root, out: outPosix, wires, snapshot: analyzed.snapshot });
  const file = join(root, out);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current !== null && !current.startsWith(WIRE_MARKER)) {
    process.stdout.write(`${outPosix}: manual file without keylang:generated marker\n`);
    return 1;
  }
  if (checkOnly) {
    if (current === text) return 0;
    process.stdout.write(`${outPosix}: stale, run \`keylang wire\`\n`);
    return 1;
  }
  if (current !== text) {
    writeFileSync(file, text);
    process.stdout.write(`${outPosix}: written\n`);
  }
  return 0;
}

async function cmdDoctor(): Promise<number> {
  const root = findRoot(process.cwd());
  const config = loadConfig(root);
  const { llmClient } = await import("./llm.ts");
  const { localAvailable, microphoneAvailable } = await import("./voice-local.ts");
  const { localModel, modelsDir, voiceEngine } = await import("./voice.ts");
  const agent = config.agent === null ? null : llmClient(config.agent);
  const whisper = await localAvailable();
  const engine = voiceEngine(config.voice, whisper);
  const model = localModel();
  const lines = [
    `languages: ${config.languages.join(", ") || "none found"}${existsSync(join(root, CONFIG_FILE)) ? "" : ` (guessed; no ${CONFIG_FILE})`}`,
    `agent: ${config.agent === null ? "not configured (keylang.json \`agent\`)" : agent !== null && "missing" in agent ? `${config.agent}: ${agent.missing}` : `${config.agent}: credentials found`}`,
    `voice: engine ${config.voice.engine} → ${"missing" in engine ? engine.missing : engine.kind === "openrouter" ? `openrouter (${engine.model})` : `local (${engine.modelFile})`}`,
    `voice model: ${model ?? `none in ${modelsDir()}`}`,
    `@fugood/whisper.node: ${whisper ? "installed" : "not installed (optional)"}`,
    `microphone (decibri): ${(await microphoneAvailable()) ? "installed" : "not installed (optional; keylang web uses the browser's microphone)"}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

async function cmdTracePlan(flow: string | undefined): Promise<number> {
  if (!flow) throw new Error("trace-plan: a flow name is required");
  const { plan } = await tracePlan(loadConfig(findRoot(process.cwd())), flow);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  return 0;
}

function needPaths(cmd: string, paths: string[]): void {
  if (paths.length === 0) throw new Error(`${cmd}: at least one path is required`);
}

async function cmdInit(dir: string): Promise<number> {
  const root = resolve(process.cwd(), dir);
  const file = join(root, CONFIG_FILE);
  const config = loadConfig(root);
  if (config.languages.length === 0) {
    // Nothing to describe is a usage error (like `map`), not a finding.
    process.stderr.write(`keylang: no supported source files found under ${dir} (TypeScript, JavaScript, Python, Rust)\n`);
    return 2;
  }
  if (existsSync(file)) {
    process.stdout.write(`${relative(process.cwd(), file) || CONFIG_FILE}: already exists, kept\n`);
  } else {
    writeFileSync(file, configToJson(config));
    process.stdout.write(`${relative(process.cwd(), file) || CONFIG_FILE}: written (${config.languages.join(", ")}; layers: ${[...config.layers.keys()].join(", ")})\n`);
  }
  return cmdMap(dir, false);
}

async function cmdMap(dir: string, checkOnly: boolean): Promise<number> {
  const root = resolve(process.cwd(), dir);
  // `map --check` only reads; `map` also leaves the fact cache for the next run.
  const analyzed = await analyze({ root, specs: [], withoutEvidence: true, persistFacts: !checkOnly });
  const config = analyzed.config;
  const r = analyzed.map;
  if (r === null) throw new Error(`no supported source files under ${dir}; run \`keylang init\``);
  const s = r.graph.stats;
  for (const w of r.graph.warnings) process.stderr.write(`warning: ${w}\n`);
  const reportConflict = (p: string): void => {
    process.stdout.write(`${toPosix(relative(process.cwd(), p))}: manual file without keylang:generated marker\n`);
  };
  if (checkOnly) {
    const diff = diffMap(config, r);
    for (const p of diff.conflicts) reportConflict(p);
    // A manual file blocks `map` itself, so "run keylang map" would not refresh the rest.
    if (diff.conflicts.length === 0) {
      for (const p of diff.stale) process.stdout.write(`${toPosix(relative(process.cwd(), p))}: stale, run \`keylang map\`\n`);
    }
    return diff.conflicts.length === 0 && diff.stale.length === 0 ? 0 : 1;
  }
  const { written, removed, conflicts } = writeMap(config, r);
  if (conflicts.length > 0) {
    for (const p of conflicts) reportConflict(p);
    return 1;
  }
  for (const p of written) process.stdout.write(`${toPosix(relative(process.cwd(), p))}: written\n`);
  for (const p of removed) process.stdout.write(`${toPosix(relative(process.cwd(), p))}: removed\n`);
  process.stderr.write(
    `${s.files} file(s), ${s.modules} module(s), ${s.fns} fn, ${s.types} type(s), ${s.deps} dep(s); calls ${s.callsResolved} resolved, ${s.callsExternal} external, ${s.callsDynamic} dynamic, ${s.callsUnresolved} unresolved` +
      (s.importsUnresolved ? `; ${s.importsUnresolved} unresolved import(s)` : "") +
      (s.unassignedFiles ? `; ${s.unassignedFiles} file(s) outside any layer` : "") +
      (r.skipped ? `; ${r.skipped} file(s) outside guessed layers skipped` : "") +
      (config.guessed ? " (layers guessed; run `keylang init` to write keylang.json)" : "") +
      "\n",
  );
  return 0;
}

function cmdParse(paths: string[], json: boolean): number {
  const docs = load(collectMdFiles(paths));
  if (json) process.stdout.write(`${JSON.stringify(docs, null, 2)}\n`);
  else for (const d of docs) printTree(d);
  const diags = docs.flatMap((d) => d.diagnostics);
  for (const d of diags) process.stderr.write(`${formatDiagnostic(d)}\n`);
  return diags.some(isError) ? 1 : 0;
}

const FORMATS = ["human", "json", "sarif", "github"] as const;

async function cmdCheck(paths: string[], opts: { strict: boolean; format: string; explain: boolean; static: string }): Promise<number> {
  if (!FORMATS.includes(opts.format as (typeof FORMATS)[number])) {
    throw new Error(`unknown --format \`${opts.format}\`; expected ${FORMATS.join(", ")}`);
  }
  const staticMode = STATIC_MODES.find((mode) => mode === opts.static);
  if (!staticMode) throw new Error(`unknown --static \`${opts.static}\`; expected ${STATIC_MODES.join(", ")}`);
  const cwd = process.cwd();
  if (opts.explain) {
    const analyzed = await analyze({ root: findRoot(cwd), specs: [] });
    return explainEdge(paths, analyzed.snapshot);
  }
  const root = findRoot(cwd);
  const config = loadConfig(root);
  if (paths.length === 0 && !existsSync(join(root, config.dir))) throw new Error(`no \`${config.dir}/\` directory here; run \`keylang init\` or pass paths`);
  const specs = paths.length > 0 ? paths.map((p) => resolve(cwd, p)) : [join(root, config.dir)];
  for (const spec of specs) if (!existsSync(spec)) throw new Error(`${relative(cwd, spec) || spec}: not found`);
  // Specs outside the repository's spec directory (examples, a slide) have no code to check against.
  const inRepo = specs.every((spec) => within(spec, join(root, config.dir)));
  const analyzed = await analyze({
    root,
    specs,
    display: (abs) => toPosix(relative(cwd, abs)),
    static: staticMode,
    ...(inRepo ? {} : { withoutCode: true }),
  });
  const diags = analyzed.diagnostics;
  const snapshot = analyzed.snapshot;
  const channel = analyzed.verdicts;
  const unverified = channel.filter((verdict) => verdict.verdict === "unverified");
  const oks = channel.filter((verdict) => verdict.verdict === "ok").length;
  const fails = diags.filter(isError).length + channel.filter((verdict) => verdict.verdict === "fail" && !sameFinding(verdict, diags)).length;
  const channels = new Set(["ID", "static", "tests", "trace"]);
  const rendered = [
    ...diags.map(formatDiagnostic),
    ...channel.filter((verdict) => !sameFinding(verdict, diags) && (verdict.verdict !== "ok" || channels.has(verdict.criterion))).map(formatVerdict),
  ];
  writeCheck(opts.format, rendered, channel, snapshot, diags);
  process.stderr.write(`${fails} fail, ${unverified.length} unverified, ${oks} ok\n`);
  if (fails > 0) return 1;
  if (opts.strict && unverified.length > 0) return 1;
  return 0;
}

function explainEdge(ids: string[], snapshot: AnalysisSnapshot | null): number {
  const [from, to, extra] = ids;
  if (!from || !to || extra !== undefined) throw new Error("check --explain-edge needs exactly two ids: <from> <to>");
  if (!snapshot) throw new Error("no snapshot; run inside a repository with sources");
  // An id names a node or an ancestor of nodes (a layer or a directory), never an unknown tail.
  const known = (id: string): boolean => snapshot.nodes[id] !== undefined || Object.keys(snapshot.nodes).some((key) => key.startsWith(`${id}.`));
  for (const id of [from, to]) if (!known(id)) throw new Error(`unknown id \`${id}\``);
  const under = (id: string, scope: string): boolean => id === scope || id.startsWith(`${scope}.`);
  const between = (a: string, b: string) => (edge: AnalysisSnapshot["edges"][number]): boolean =>
    under(edge.source, a) && ((edge.target !== null && under(edge.target, b)) || (edge.candidates ?? []).some((id) => under(id, b)));
  // Edges in both directions: `a → b` first, then `b → a`.
  const forward = between(from, to);
  const hits = snapshot.edges
    .filter((edge) => forward(edge) || between(to, from)(edge))
    .sort((a, b) => Number(!forward(a)) - Number(!forward(b)) || compareText(a.kind, b.kind) || compareText(a.file ?? "", b.file ?? "") || a.line - b.line || a.col - b.col || compareText(a.source, b.source));
  for (const edge of hits) {
    const via = edge.candidates?.length ? ` [${edge.candidates.join(", ")}]` : "";
    const hook = edge.via === "default" ? ` (default of the hook \`${edge.hook ?? ""}\`)` : edge.via === "injected" ? ` (injected as \`${edge.hook ?? ""}\` at ${edge.site ?? "?"})` : "";
    const fragment = edge.text ? ` \`${edge.text.replace(/\s+/g, " ")}\`` : "";
    process.stdout.write(`${edge.kind} ${edge.resolution} ${edge.provenance} ${edge.file}:${edge.line}:${edge.col}-${edge.endLine}:${edge.endCol}${fragment} ${edge.source} → ${edge.target ?? "?"}${via}${hook}${edge.reason ? ` (${edge.reason})` : ""}\n`);
  }
  if (hits.length > 0) return 0;
  const holes = snapshot.coverage
    .filter((item) => item.source !== null && under(item.source, from))
    .sort((a, b) => compareText(a.file, b.file) || a.line - b.line || a.col - b.col || compareText(a.reason, b.reason));
  if (holes.length === 0) {
    process.stdout.write("no edge, coverage complete\n");
    return 0;
  }
  process.stdout.write(`no confirmed edge; ${holes.length} unresolved construct(s) in \`${from}\` could form one\n`);
  for (const hole of holes) process.stdout.write(`unresolved ${hole.file}:${hole.line}:${hole.col} ${hole.reason}\n`);
  return 0;
}

function writeCheck(format: string, lines: string[], verdicts: Verdict[], snapshot: AnalysisSnapshot | null, diags: Diagnostic[]): void {
  if (format === "human") {
    for (const line of lines) process.stdout.write(`${line}\n`);
    return;
  }
  const snapshotId = snapshot?.snapshotId ?? null;
  const results = checkResults(verdicts, snapshotId, diags);
  if (format === "github") {
    for (const result of results) {
      if (result.verdict === "ok") continue;
      const level = result.verdict === "fail" ? "error" : result.verdict === "warning" ? "warning" : "notice";
      const title = result.code ?? result.verdict;
      process.stdout.write(`::${level} file=${githubProperty(result.file)},line=${result.line},col=${result.col},title=${githubProperty(title)}::${githubData(result.evidence)}\n`);
    }
    return;
  }
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ snapshotId, results, coverage: snapshot?.coverage ?? [] }, null, 2)}\n`);
    return;
  }
  const reported = results.filter((result) => result.verdict !== "ok");
  const ruleIds = [...new Set(reported.map((result) => result.code ?? result.verdict))].sort();
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "keylang", informationUri: "https://www.npmjs.com/package/keylang", rules: ruleIds.map((id) => ({ id, shortDescription: { text: ruleText(id) } })) } },
        results: reported.map((result) => ({
          ruleId: result.code ?? result.verdict,
          ruleIndex: ruleIds.indexOf(result.code ?? result.verdict),
          level: result.verdict === "fail" ? "error" : result.verdict === "warning" ? "warning" : "note",
          message: { text: result.evidence },
          locations: [{ physicalLocation: { artifactLocation: { uri: result.file }, region: { startLine: result.line, startColumn: result.col } } }],
          properties: { verdict: result.verdict, criterion: result.criterion, area: result.area, snapshotId: result.snapshotId, ...(result.specHash ? { specHash: result.specHash } : {}) },
        })),
        properties: { snapshotId },
      },
    ],
  };
  process.stdout.write(`${JSON.stringify(sarif, null, 2)}\n`);
}

function ruleText(id: string): string {
  if (id === "unverified") return "evidence for this criterion is incomplete";
  return explainCode(id)?.split("\n")[0] ?? id;
}

// GitHub workflow commands: https://docs.github.com/actions/reference/workflow-commands-for-github-actions
function githubData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function githubProperty(text: string): string {
  return githubData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function cmdFmt(paths: string[], checkOnly: boolean): number {
  let ok = true;
  for (const file of collectMdFiles(paths)) {
    const src = readFileSync(file, "utf8");
    const r = formatSource(file, src);
    if (!r.ok) {
      ok = false;
      for (const d of r.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
    } else if (r.text !== src) {
      if (checkOnly) {
        ok = false;
        process.stdout.write(`${file}: not formatted\n`);
      } else {
        writeFileSync(file, r.text);
        process.stdout.write(`${file}: formatted\n`);
      }
    }
  }
  return ok ? 0 : 1;
}

function printTree(doc: Document): void {
  process.stdout.write(`${doc.path}${doc.generated !== null ? " (generated)" : ""}\n`);
  for (const s of doc.sections) {
    process.stdout.write(`  [${s.kind}] ${s.heading?.value ?? "(no heading)"}\n`);
    for (const item of s.items) if (item.type === "node") printNode(item, 2);
  }
}

function printNode(n: Node, depth: number): void {
  let line = `${"  ".repeat(depth)}${kindLabel(n.kind)}`;
  const id = n.id ?? n.name?.value;
  if (id !== undefined) line += ` ${id}`;
  if (n.link) line += ` <${n.link.target}>`;
  if (n.text) line += ` ${JSON.stringify(n.text.value)}`;
  if (n.label) line += ` ${JSON.stringify(n.label.value)}`;
  if (n.refs.length > 0) line += ` -> ${n.refs.map((r) => r.target).join(", ")}`;
  process.stdout.write(`${line}  @${n.span.start.line}:${n.span.start.col}\n`);
  for (const c of n.children) printNode(c, depth + 1);
}

/** The lines changed since `ref` in the working tree, and the files git does not track yet, relative to `root`. */
function gitChanges(root: string, ref: string): ChangedLines {
  const git = (args: string[]): string => {
    const out = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (out.error) throw new Error(`code-to-spec --since: git is not available (${out.error.message})`);
    if (out.status !== 0) throw new Error(`code-to-spec --since: git ${args[0]}: ${out.stderr.trim().split("\n")[0]}`);
    return out.stdout;
  };
  // `--relative`: paths from `root` and only files under it, whatever the repository's top level.
  const changed: Map<string, readonly (readonly [number, number])[] | "all"> = diffHunks(git(["diff", "--relative", "--unified=0", "--no-color", "--no-ext-diff", ref, "--"]));
  for (const file of git(["ls-files", "--others", "--exclude-standard"]).split("\n")) if (file !== "") changed.set(file, "all");
  return changed;
}
