// `keylang` command line: the TUI (no command), web, init, map, check, parse, fmt.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { detectHarnesses, HARNESS_PATHS, parseAgents, planHarness, skillFile, type HarnessPlan, type HarnessSelection } from "./adapters/harness.ts";
import { baselineText } from "./baseline.ts";
import { filterChanged, hookDecision, hookFails, parseHookEvent } from "./changed.ts";
import { parseArgs } from "node:util";
import { CONFIG_FILE, STATIC_MODES, assertFormatOnly, configToJson, guessLayers, guessLayout, loadConfig, toPosix, type Config, type StaticMode } from "./config.ts";
import { sameFinding } from "./assess.ts";
import { formatDiagnostic, isError, type Diagnostic } from "./diag.ts";
import { collectMdFiles } from "./files.ts";
import { parse } from "./parser.ts";
import { formatSource } from "./fmt.ts";
import { kindLabel, sectionNodes, walk, type Document, type Node } from "./ir.ts";
import { analyze, findRoot, within, type Analysis } from "./analyze.ts";
import { explainCode } from "./explain.ts";
import { formatSummary, summarizeNode } from "./explain-node.ts";
import { checkResults, type CheckResult } from "./check-results.ts";
import { briefText, currentBaseline, estimateTokens, explainedIds, explanationRequest, isStale, moveHint, oldExplanations, planBriefs, readExplanation, runBriefs, unknownIds, writeExplanation, type BriefBatch, type BriefLevel, type Explanation } from "./explain-llm.ts";
import { isStoredExplanation, loadBriefs, type ExplanationDetail } from "./explanations.ts";
import { tracePlan } from "./trace-plan.ts";
import { generateWire, WIRE_MARKER } from "./wire-gen.ts";
import { changedFlows, codeToSpec, deletedDiffPaths, diffHunks, draftFlow, draftRules, withFlow, withRules, type ChangedLines, type FlowDraft } from "./draft.ts";
import { placeFile } from "./graph.ts";
import { stronglyConnected } from "./scc.ts";
import { codeProposalProblem, lineDiff, PROPOSALS_DIR, proposalProblem, writeProposal } from "./proposals.ts";
import { safeWrite, safeWriteAll, writeProblem } from "./safe-write.ts";
import { specToCode } from "./spec-to-code.ts";
import { addDrafts, STATS_FILE, updateStats } from "./stats.ts";
import { serveLsp } from "./lsp.ts";
import { runTerminal } from "./tui/terminal.ts";
import { serveWeb } from "./tui/web.ts";
import { featureSummary, gapLine, mapCheckLines, mapConflictLines, mapStepLines, mapSummary, runOperation } from "./operations.ts";
import type { AnalysisSnapshot } from "./snapshot.ts";
import { formatVerdict, type Verdict } from "./verdict.ts";
import { compareText } from "./span.ts";

const USAGE = `keylang: architecture description bound to a repository

Usage: keylang                      Open the TUI in this terminal (needs a TTY)
       keylang <command> [options] [paths…]

Commands:
  web [--port N] [--host H] The TUI in a browser tab: serves http://localhost:7070
                            with a one-time token (localhost only by default)
  init [dir] [--agents=LIST] [--check]
                            Detect languages and layers, write keylang.json, build the map,
                            write rules.baseline.md, and install harness files
                            (AGENTS.md, MCP, skill, hooks). --agents is
                            claude,codex,opencode,cursor or none (no harness files
                            outside keylang/). --check writes nothing and fails when a
                            managed block, MCP command, skill, or baseline is stale
  agents [--agents=LIST] [--check]
                            Install the same harness files on an initialized repo
  baseline [--check]        Write <dir>/rules.baseline.md from the current layer graph
                            (--check: fail when it does not match; says to run
                            \`keylang baseline\`; writes nothing)
  feature <slug> [--format json]
                            Whether <dir>/features/<slug>.md is done: every planned
                            id is implemented (K202, not K201), every flow step is
                            static ok, and no rule fail remains. 0 done, 1 gaps,
                            2 missing file or bad invocation
  hook stop                 Read a harness Stop event (JSON) from stdin, run
                            check --changed, and print a JSON decision. Writes nothing
  map [dir] [--check]       Generate <dir>/keylang/map/*.md and .keylang/index.json;
                            with "explain": {"map": true} in keylang.json also the
                            explained map keylang/map-explained/ (a brief under each
                            node: the doc comment, else a saved model brief)
                            (--check: fail if a committed map is stale)
  explain <code|id>         A diagnostic code: why it happens and how to fix it.
                            An id: what the snapshot and specs say about it (offline),
                            and its saved explanation with model, date and stale?
  explain <id> --llm        Explain the id in plain language with the configured
                            agent; saved in keylang/explain/ (--full: in detail;
                            --brief: one or two sentences for the explained map,
                            in keylang/explain/brief/)
  explain --stale           List saved explanations and briefs whose code changed since
  explain --missing --llm   Write a brief for every node of the explained map with no
                            doc comment and no fresh brief, bottom-up (fn and types,
                            then classes and modules, then layers: a parent's prompt
                            carries its members' briefs); each is saved as it arrives,
                            so a rerun goes on where it stopped. --stale --llm: only
                            the stale briefs. Without --llm: list the nodes.
                            --dry-run: counts and a token estimate, no request;
                            --limit N: at most N nodes; --jobs N: requests at once (4)
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
                            check, explain, context, validate_spec, scaffold,
                            feature_status, apply_diff (proposals only; nothing else is written)
  wire [--check] [--out f]  Generate keylang.gen.ts (or f: a .ts/.mts/.cts path relative to
                            the root, inside it) from \`# wiring\`: a typed wire() that builds
                            each factory once, dependencies first
                            (--check: fail if the file is stale; writes nothing)
  trace-plan <flow>         Print JSON: the flow's functions a trace adapter instruments
                            (Python, Rust), with the snapshot id and file hashes
  check [paths…] [--changed] [--since <ref>]
                            Resolve IDs and check rules (default: ./keylang)
                            Rebuilds the analysis in memory; does not write the map.
                            --changed reports only findings that touch files changed
                            since <ref> (default HEAD) plus untracked files
  parse [--json] <paths…>   Parse files (or all *.md under directories) and print the IR
  fmt [--check] <paths…>    Rewrite files in canonical format (--check: report only);
                            a file it cannot read or write is named and the rest are done (exit 2)

Options:
  -h, --help                Show this help
  -V, --version             Show version
  --strict                  Exit 1 when a required result is unverified
  --format <name>           check output: human (default), json, sarif, github
  --static <mode>           check: which calls prove a flow step statically.
                            Precedence: this flag, then keylang.json check.static,
                            then behavior. behavior also follows a hook's default
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
      brief: { type: "boolean" },
      missing: { type: "boolean" },
      "dry-run": { type: "boolean" },
      limit: { type: "string" },
      jobs: { type: "string" },
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
      agents: { type: "string" },
      changed: { type: "boolean" },
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
      return cmdInit(paths[0] ?? ".", { agents: values.agents, check: values.check === true });
    case "agents":
      return cmdAgents(values.agents, values.check === true);
    case "baseline":
      return cmdBaseline(findRoot(process.cwd()), values.check === true);
    case "feature":
      return cmdFeature(paths[0], values.format ?? "human");
    case "hook":
      return cmdHook(paths[0]);
    case "map":
      return cmdMap(paths[0] ?? ".", values.check === true);
    case "check":
      return cmdCheck(paths, {
        strict: values.strict === true,
        format: values.format ?? "human",
        explain: values["explain-edge"] === true,
        static: values.static,
        changed: values.changed === true,
        since: values.since,
      });
    case "explain":
      return cmdExplain(paths[0], {
        llm: values.llm === true,
        full: values.full === true,
        brief: values.brief === true,
        stale: values.stale === true,
        missing: values.missing === true,
        dryRun: values["dry-run"] === true,
        limit: values.limit,
        jobs: values.jobs,
      });
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

interface ExplainOptions {
  llm: boolean;
  full: boolean;
  brief: boolean;
  stale: boolean;
  missing: boolean;
  dryRun: boolean;
  limit: string | undefined;
  jobs: string | undefined;
}

async function cmdExplain(subject: string | undefined, opts: ExplainOptions): Promise<number> {
  if (opts.full && opts.brief) throw new Error("explain: --full and --brief are two details; pass one");
  if (opts.missing && opts.stale) throw new Error("explain: --missing already includes stale briefs; pass one of --missing and --stale");
  if (opts.missing || (opts.stale && (opts.llm || opts.dryRun || opts.limit !== undefined || opts.jobs !== undefined))) {
    if (subject !== undefined) throw new Error(`explain ${opts.missing ? "--missing" : "--stale"} explains every node it finds; it takes no id`);
    return cmdExplainBatch(opts.missing ? "missing" : "stale", opts);
  }
  if (opts.dryRun || opts.limit !== undefined || opts.jobs !== undefined) throw new Error("explain: --dry-run, --limit and --jobs need --missing or --stale");
  if (opts.stale) {
    const analysis = await analyze({ root: findRoot(process.cwd()), withoutEvidence: true });
    noteOldExplanations(analysis.config);
    for (const kind of ["answers", "briefs"] as const) {
      for (const id of explainedIds(analysis.config, kind)) {
        const e = readExplanation(analysis.config, id, kind === "briefs" ? "brief" : "short");
        if (!e) continue;
        const what = kind === "briefs" ? `${id} (brief)` : id;
        const again = `keylang explain ${id} --llm${kind === "briefs" ? " --brief" : ""}`;
        if (currentBaseline(analysis, id) === null) process.stdout.write(`${what}: gone (explained ${e.date})\n`);
        else if (isStale(analysis, id, e)) process.stdout.write(`${what}: stale (explained ${e.date}); run \`${again}\`\n`);
      }
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
  noteOldExplanations(analysis.config);
  const result = summarizeNode(analysis, subject);
  if ("unknown" in result) throw new Error(`unknown id \`${subject}\`${result.suggestion ? ` (did you mean \`${result.suggestion}\`?)` : ""}`);
  const config = analysis.config;
  const { lang } = config.explain;
  const detail: ExplanationDetail = opts.brief ? "brief" : opts.full ? "full" : config.explain.detail;
  const saved = readExplanation(config, subject, detail);
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
  const setup = llmClient(config.agent);
  if ("missing" in setup) {
    process.stderr.write(`keylang: ${setup.missing}; showing what the snapshot says\n`);
    process.stdout.write(`${formatSummary(result.summary)}\n`);
    if (saved) {
      process.stdout.write("\n");
      show(saved);
    }
    return 0;
  }
  const answer = await setup.client.complete(explanationRequest(analysis, result.summary, { lang, detail, briefs: loadBriefs(config) }));
  const text = detail === "brief" ? briefText(answer) : answer;
  const e: Explanation = { agent: setup.client.agent, date: new Date().toISOString().slice(0, 10), closure: currentBaseline(analysis, subject) ?? "", lang, detail, text };
  writeExplanation(config, subject, e);
  show(e);
  return 0;
}

/**
 * `explain --missing|--stale [--llm] [--dry-run] [--limit N] [--jobs N]`:
 * briefs for the explained map, bottom-up. Without `--llm` it lists the nodes;
 * `--dry-run` counts them and estimates tokens. Exit 1 when some nodes failed.
 */
async function cmdExplainBatch(batch: BriefBatch, opts: ExplainOptions): Promise<number> {
  const limit = opts.limit === undefined ? Infinity : positiveInteger("--limit", opts.limit);
  const jobs = opts.jobs === undefined ? DEFAULT_JOBS : positiveInteger("--jobs", opts.jobs);
  const analysis = await analyze({ root: findRoot(process.cwd()), withoutEvidence: true });
  const config = analysis.config;
  noteOldExplanations(config);
  if (!analysis.snapshot) throw new Error("no snapshot: explain --missing needs a repository with sources");
  const briefs = loadBriefs(config);
  const plan = planBriefs(analysis, batch, briefs).slice(0, limit);
  if (opts.dryRun) {
    const count = (level: BriefLevel): number => plan.filter((p) => p.level === level).length;
    const tokens = estimateTokens(analysis, plan, briefs);
    process.stdout.write(`would explain ${plan.length} node(s): ${count("fn/type")} fn/type, ${count("class/module")} class/module, ${count("layer")} layer\n`);
    process.stdout.write(`estimated tokens: ~${tokens.input} in, ~${tokens.output} out\n`);
    return 0;
  }
  if (!opts.llm) {
    for (const p of plan) process.stdout.write(`${p.id} (${p.level})\n`);
    return 0;
  }
  if (plan.length === 0) {
    process.stdout.write("nothing to explain\n");
    return 0;
  }
  const { llmClient } = await import("./llm.ts");
  const setup = llmClient(config.agent);
  if ("missing" in setup) throw new Error(setup.missing);
  const result = await runBriefs(analysis, setup.client, plan, {
    jobs,
    briefs,
    progress: (done, total, id, failed) => process.stderr.write(`[${done}/${total}] ${id}${failed === null ? "" : `: failed: ${failed}`}\n`),
  });
  process.stdout.write(`explained ${result.done.length} of ${plan.length} node(s)\n`);
  for (const f of result.failed) process.stdout.write(`failed: ${f.id}: ${f.reason}\n`);
  return result.failed.length > 0 ? 1 : 0;
}

/** Requests a batch keeps in flight: enough to be quick, few enough for a provider's rate limit. */
const DEFAULT_JOBS = 4;

function positiveInteger(flag: string, text: string): number {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive whole number, got \`${text}\``);
  return n;
}

/** One note per command while the store of keylang 0.1 still holds files. */
function noteOldExplanations(config: Config): void {
  const count = oldExplanations(config.root);
  if (count > 0) process.stderr.write(`keylang: note: ${moveHint(config, count)}\n`);
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
  let counts: Record<string, number> | null = null;
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
      for (const line of model.dropped) process.stderr.write(`keylang: dropped from the model's draft: ${line}\n`);
      counts = model.counts;
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
  if (counts) countProposed(root, counts);
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
  // A finding the diagnostics already name is printed once, as in `check`.
  for (const v of c.verdicts) if (!sameFinding(v, c.diagnostics)) process.stdout.write(`${formatVerdict(v)}\n`);
  for (const d of c.diagnostics) process.stdout.write(`${formatDiagnostic(d)}\n`);
  for (const t of c.tests) process.stdout.write(`\n${t.file} (new file)\n${lineDiff("", t.after)}\n`);
  for (const note of c.testNotes) process.stderr.write(`keylang: ${note}\n`);
  const files = [c, ...c.tests];
  if (opts.print) {
    process.stderr.write(`keylang: nothing written; without --print the files become proposals, --apply writes them\n`);
    return 0;
  }
  const root = analysis.config.root;
  // The rules of a code proposal hold for --apply too: inside the repository through links, never `keylang.gen.ts`.
  for (const f of files) {
    const problem = codeProposalProblem(root, f.file);
    if (problem) throw new Error(`spec-to-code: ${f.file}: ${problem}`);
  }
  if (!opts.apply) {
    for (const f of files) writeProposal(root, f.file, f.after);
    process.stderr.write(`keylang: proposed ${files.map((f) => `${PROPOSALS_DIR}/${f.file}`).join(", ")}; merge them hunk by hunk with \`m\` in \`keylang\` (--apply writes the files directly)\n`);
    return 0;
  }
  // Each file must still be what the candidate was built from: an edit made meanwhile (during a model call) is never overwritten.
  safeWriteAll(root, files.map((f) => ({ path: f.file, text: f.after, options: { expect: f.before } })));
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
  let counts: Record<string, number> | null = null;
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
      counts = {};
      for (const d of algo) {
        const model = await draftFlowWithModel(analysis, d.steps[0]!, setup.client, mode, d.name);
        if (model.unknown.length > 0) process.stderr.write(`keylang: still unknown after ${model.rounds} round(s): ${model.unknown.join(", ")}\n`);
        for (const line of model.dropped) process.stderr.write(`keylang: dropped from the model's draft: ${line}\n`);
        for (const [status, n] of Object.entries(model.counts)) counts[status] = (counts[status] ?? 0) + n;
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
  if (counts) countProposed(root, counts);
  process.stdout.write(`${toPosix(relative(process.cwd(), proposal))}: proposed ${drafts.map((d) => `\`${d.name}\``).join(", ")} for ${target}; merge it with \`m\` in \`keylang\`\n`);
  return 0;
}

/** The drafted lines count as proposed once the proposal exists; a count that cannot be written never fails the command. */
function countProposed(root: string, counts: Record<string, number>): void {
  try {
    updateStats(root, (stats) => addDrafts(stats, counts, "proposed"));
  } catch (e) {
    process.stderr.write(`keylang: ${STATS_FILE} not updated: ${e instanceof Error ? e.message : String(e)}\n`);
  }
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
  let counts: Record<string, number> | null = null;
  const client = await model();
  const specDirEarly = toPosix(relative(root, resolve(root, analysis.config.dir)));
  if (client) {
    const { draftRulesWithModel } = await import("./draft-llm.ts");
    const drafted = await draftRulesWithModel(analysis, client, opts.mode as "llm" | "hybrid", algo, toPosix(opts.into ?? `${specDirEarly}/rules.md`));
    text = drafted.text;
    for (const conflict of drafted.conflicts) process.stderr.write(`keylang: conflict: ${conflict}\n`);
    counts = drafted.counts;
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
  // An existing file keeps its text; the draft's rules join its `# rules` section.
  const proposal = withRules(existsSync(abs) ? readFileSync(abs, "utf8") : null, text);
  const file = writeProposal(root, target, proposal);
  if (counts) countProposed(root, counts);
  process.stdout.write(`${toPosix(relative(process.cwd(), file))}: proposed rules for ${target}; merge it with \`m\` in \`keylang\`\n`);
  return 0;
}

async function cmdWire(out: string, checkOnly: boolean): Promise<number> {
  const root = findRoot(process.cwd());
  const outPosix = toPosix(out);
  // The path policy of every write, checked before anything is read: plain, relative to the root, inside it through links.
  if (!/\.(ts|mts|cts)$/.test(outPosix)) throw new Error(`wire: --out must name a TypeScript file (.ts, .mts or .cts), got \`${out}\``);
  const problem = writeProblem(root, outPosix, { generated: true });
  if (problem) throw new Error(`wire: --out ${outPosix}: ${problem}`);
  const analyzed = await analyze({ root, withoutEvidence: true });
  if (!analyzed.snapshot) throw new Error("wire: no supported source files; run `keylang init`");
  const blocking = wiringErrors(analyzed);
  for (const d of blocking) process.stdout.write(`${formatDiagnostic(d)}\n`);
  if (blocking.length > 0) {
    process.stderr.write(`wire: ${blocking.length} error(s) in wiring; nothing written\n`);
    return 1;
  }
  const wires = analyzed.spec.wires;
  if (wires.length === 0) throw new Error(`wire: no \`# wiring\` section under ${analyzed.config.dir}/`);
  const text = generateWire({ root, out: outPosix, wires, snapshot: analyzed.snapshot });
  const file = join(root, outPosix);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current !== null && !current.startsWith(WIRE_MARKER)) {
    process.stdout.write(`${outPosix}: manual file without keylang:generated marker\n`);
    return 1;
  }
  // A checkout that turned LF into CRLF holds the same file.
  const same = current !== null && current.replace(/\r\n/g, "\n") === text;
  if (checkOnly) {
    if (same) return 0;
    process.stdout.write(`${outPosix}: stale, run \`keylang wire\`\n`);
    return 1;
  }
  if (!same) {
    safeWrite(root, outPosix, text, { generated: true, expect: current });
    process.stdout.write(`${outPosix}: written\n`);
  }
  return 0;
}

/** Error diagnostics on the lines of a `# wiring` section, whatever their code: any of them can change what is generated. */
function wiringErrors(analysis: Analysis): Diagnostic[] {
  const ranges = new Map<string, [number, number][]>();
  for (const doc of analysis.docs) {
    const heads = doc.sections.map((section) => section.heading?.span.start.line ?? 1);
    doc.sections.forEach((section, i) => {
      if (section.kind !== "wiring") return;
      ranges.set(doc.path, [...(ranges.get(doc.path) ?? []), [heads[i]!, i + 1 < heads.length ? heads[i + 1]! - 1 : Number.POSITIVE_INFINITY]]);
    });
  }
  return analysis.diagnostics.filter((d) => isError(d) && (ranges.get(d.file) ?? []).some(([from, to]) => d.span.start.line >= from && d.span.start.line <= to));
}

/** What is set up. A problem it finds (a key file others can read, a native module without its binary) is a line of the report, not a failure: tools.md, code 0. The CLI is a printer over the shared doctor operation. */
async function cmdDoctor(): Promise<number> {
  const result = await runOperation({ kind: "doctor", root: findRoot(process.cwd()) });
  if (result.status === "failed") {
    for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  if (result.status === "cancelled" || result.payload === null) return result.exitCode ?? 0;
  for (const message of result.messages) {
    if (message.level === "info") process.stdout.write(`${message.text}\n`);
    else process.stderr.write(`${message.text}\n`);
  }
  return result.exitCode ?? 0;
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

async function cmdInit(dir: string, opts: { agents: string | undefined; check: boolean }): Promise<number> {
  const root = resolve(process.cwd(), dir);
  const file = join(root, CONFIG_FILE);
  const config = loadConfig(root);
  if (config.languages.length === 0) {
    // Nothing to describe is a usage error (like `map`), not a finding.
    process.stderr.write(`keylang: no supported source files found under ${dir} (TypeScript, JavaScript, Python, Rust)\n`);
    return 2;
  }
  // A broken harness file fails before any write, including keylang.json.
  const plan = harnessPlan(root, opts.agents);
  if (opts.check) {
    const agents = applyHarness(root, plan, true);
    const baseline = await cmdBaseline(root, true);
    return agents === 0 && baseline === 0 ? 0 : 1;
  }
  if (existsSync(file)) {
    process.stdout.write(`${relative(process.cwd(), file) || CONFIG_FILE}: already exists, kept\n`);
  } else {
    // The same guess `loadConfig` made, with a note for every directory whose layer name had to change.
    const layout = guessLayout(root, config.exclude);
    for (const note of layout.notes) process.stderr.write(`keylang: note: ${note}\n`);
    writeFileSync(file, configToJson({ ...config, layers: layout.layers }));
    process.stdout.write(`${relative(process.cwd(), file) || CONFIG_FILE}: written (${config.languages.join(", ")}; layers: ${[...layout.layers.keys()].join(", ")})\n`);
  }
  const mapCode = await cmdMap(dir, false);
  const baseline = await cmdBaseline(root, false);
  const agents = applyHarness(root, plan, false);
  if (mapCode !== 0) return mapCode;
  if (baseline !== 0) return baseline;
  return agents;
}

function cmdAgents(agents: string | undefined, checkOnly: boolean): number {
  return applyHarness(findRoot(process.cwd()), harnessPlan(findRoot(process.cwd()), agents), checkOnly);
}

async function cmdBaseline(root: string, checkOnly: boolean): Promise<number> {
  const analyzed = await analyze({ root, specs: [], withoutEvidence: true });
  if (!analyzed.snapshot) throw new Error("baseline: no supported source files; run `keylang init`");
  const text = baselineText(analyzed.snapshot);
  const rel = `${analyzed.config.dir}/rules.baseline.md`;
  const current = existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null;
  const same = current !== null && current.replace(/\r\n/g, "\n") === text;
  if (checkOnly) {
    if (same) return 0;
    process.stdout.write(`${rel}: stale, run \`keylang baseline\`\n`);
    return 1;
  }
  if (!same) {
    safeWrite(root, rel, text, { generated: true });
    process.stdout.write(`${rel}: written\n`);
  }
  return 0;
}

/** Whether a feature is done, on the saved files. The CLI is a printer over the shared feature operation. */
async function cmdFeature(slug: string | undefined, format: string): Promise<number> {
  if (!slug) throw new Error("feature: a slug is required");
  if (format !== "human" && format !== "json") throw new Error(`feature: unknown --format \`${format}\`; expected human, json`);
  const result = await runOperation({ kind: "feature", root: findRoot(process.cwd()), slug });
  if (result.payload === null) {
    for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  const { report } = result.payload;
  if (format === "json") process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else for (const gap of report.gaps) process.stdout.write(`${gapLine(gap)}\n`);
  process.stderr.write(`${featureSummary(report)}\n`);
  return result.exitCode ?? 2;
}

async function cmdHook(name: string | undefined): Promise<number> {
  if (name !== "stop") throw new Error("hook: expected `stop`");
  const event = parseHookEvent(await readStdin());
  if (event.stop_hook_active === true) {
    process.stdout.write(hookDecision(event, []));
    return 0;
  }
  const root = findRoot(process.cwd());
  const analyzed = await analyze({ root });
  const gitChanged = gitChangedFiles(root, "HEAD");
  const changed = changedPathSet(root, gitChanged.paths, process.cwd());
  const filtered = filterChanged(
    { docs: analyzed.docs, spec: analyzed.spec, diagnostics: analyzed.diagnostics, verdicts: analyzed.verdicts, nodes: analyzed.snapshot?.nodes ?? {} },
    changed,
    deletedModuleIds(analyzed.config, gitChanged.deleted),
  );
  process.stdout.write(hookDecision(event, hookFails(filtered)));
  return 0;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function packageVersion(): string {
  return (createRequire(import.meta.url)("../package.json") as { version: string }).version;
}

function harnessPlan(root: string, flag: string | undefined): HarnessPlan {
  const selection: HarnessSelection = flag !== undefined ? parseAgents(flag) : { harnesses: detectHarnesses({ exists: (path) => harnessPresent(root, path), list: (path) => listDir(root, path) }), instructions: true };
  const files = new Map<string, string | null>(HARNESS_PATHS.map((path) => [path, existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null]));
  const skill = selection.instructions && selection.harnesses.length > 0 ? readFileSync(skillFile(), "utf8") : "";
  const plan = planHarness({ selection, version: packageVersion(), skill, files });
  if (plan.error) throw new Error(`${plan.error.file}: ${plan.error.message}`);
  return plan;
}

/** `.claude` and the other harness directories are directories; opencode is a file. */
function harnessPresent(root: string, path: string): boolean {
  try {
    const stat = statSync(join(root, path));
    return path.endsWith(".json") || path.endsWith(".jsonc") ? stat.isFile() : stat.isDirectory();
  } catch {
    return false;
  }
}

function listDir(root: string, path: string): string[] | null {
  try {
    const stat = statSync(join(root, path));
    if (!stat.isDirectory()) return null;
    return readdirSync(join(root, path));
  } catch {
    return null;
  }
}

function applyHarness(root: string, plan: HarnessPlan, checkOnly: boolean): number {
  const stale: string[] = [];
  const writes: { path: string; text: string | null }[] = [];
  for (const file of plan.files) {
    const abs = join(root, file.path);
    const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    if (current === null && file.text === null) continue;
    if (current !== null && file.text !== null && current.replace(/\r\n/g, "\n") === file.text.replace(/\r\n/g, "\n")) continue;
    if (checkOnly) stale.push(file.path);
    else writes.push(file);
  }
  if (checkOnly) {
    for (const path of stale) process.stdout.write(`${path}: stale, run \`keylang agents\`\n`);
    return stale.length === 0 ? 0 : 1;
  }
  for (const file of writes) {
    if (file.text === null) {
      rmSync(join(root, file.path), { force: true });
      process.stdout.write(`${file.path}: removed\n`);
      continue;
    }
    safeWrite(root, file.path, file.text);
    process.stdout.write(`${file.path}: written\n`);
  }
  return 0;
}

/** Git paths are relative to `root`; check prints spec paths relative to `cwd`. Both forms match. */
function changedPathSet(root: string, files: ReadonlySet<string>, cwd: string): Set<string> {
  const changed = new Set<string>();
  for (const file of files) {
    changed.add(file);
    changed.add(toPosix(relative(cwd, join(root, file))));
  }
  return changed;
}

/** Files changed since `ref` in the working tree, plus files git does not track yet. `deleted` are paths removed versus `ref`. Paths are relative to `root`. */
function gitChangedFiles(root: string, ref: string): { paths: Set<string>; deleted: string[] } {
  const run = (args: string[], input?: string) => spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd: root, input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const git = (args: string[], input?: string): string => {
    const out = run(args, input);
    if (out.error) throw new Error(`check --changed: git is not available (${out.error.message})`);
    if (out.status !== 0) throw new Error(`check --changed: git ${args[0]}: ${out.stderr.trim().split("\n")[0]}`);
    return out.stdout;
  };
  // Before the first commit there is no HEAD and every file is new: compare with the empty tree.
  const unborn = ref === "HEAD" && run(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).status !== 0;
  const base = unborn ? git(["hash-object", "-t", "tree", "--stdin"], "").trim() : ref;
  const diff = git(["diff", "--relative", "--no-renames", "--unified=0", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", base, "--"]);
  const deleted = deletedDiffPaths(diff);
  const paths = new Set<string>([...diffHunks(diff).keys(), ...deleted]);
  for (const file of git(["ls-files", "-z", "--others", "--exclude-standard"]).split("\0")) if (file !== "") paths.add(file);
  return { paths, deleted };
}

/** Module id a deleted source file had, so a flow step that named it is still "changed". */
function deletedModuleIds(config: Config, files: readonly string[]): string[] {
  const ids: string[] = [];
  for (const file of files) {
    const placed = placeFile(config, file);
    if (placed === null) continue;
    const id = [placed.layer, ...placed.segments].filter((part) => part !== "").join(".");
    if (id !== "") ids.push(id);
  }
  return ids;
}

async function cmdMap(dir: string, checkOnly: boolean): Promise<number> {
  const root = resolve(process.cwd(), dir);
  // `map --check` is a printer over the shared read-only operation.
  if (checkOnly) {
    const result = await runOperation({ kind: "map-check", root, label: dir });
    if (result.payload === null) {
      for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
      return result.exitCode ?? 2;
    }
    for (const w of result.payload.warnings) process.stderr.write(`warning: ${w}\n`);
    for (const line of mapCheckLines(result.payload, (file) => toPosix(relative(process.cwd(), join(root, file))))) process.stdout.write(`${line}\n`);
    return result.exitCode ?? 2;
  }
  // `map` is a printer over the shared operation, which also leaves the fact cache for the next run.
  const result = await runOperation({ kind: "map", root, label: dir });
  const shown = (file: string): string => toPosix(relative(process.cwd(), join(root, file)));
  const payload = result.payload;
  if (payload === null) {
    for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  for (const w of payload.warnings) process.stderr.write(`warning: ${w}\n`);
  for (const line of mapConflictLines(payload.conflicts, shown)) process.stdout.write(`${line}\n`);
  for (const line of payload.refused) process.stdout.write(`${line}\n`);
  if (payload.conflicts.length > 0) return result.exitCode ?? 2;
  if (payload.refused.length > 0) {
    process.stderr.write("keylang: nothing was written; run `keylang map` again\n");
    return result.exitCode ?? 2;
  }
  for (const line of mapStepLines(payload.steps, shown)) process.stdout.write(`${line}\n`);
  // A failure part way: the steps that landed are listed above; the failed one and the rest are named here.
  for (const step of payload.steps) {
    if (step.state === "failed") process.stderr.write(`keylang: ${shown(step.path)}: ${step.error ?? "failed"}\n`);
    else if (step.state === "not-attempted") process.stderr.write(`keylang: ${shown(step.path)}: not written\n`);
  }
  if (result.status !== "completed") return result.exitCode ?? 2;
  process.stderr.write(`${mapSummary(payload)}\n`);
  return 0;
}

/** Markdown files under `paths` that are keylang: a saved explanation is the model's text, named in a note and left out. */
function keylangFiles(paths: readonly string[]): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const file of collectMdFiles(paths)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      out.push({ file, text: "" });
      continue;
    }
    if (isStoredExplanation(text)) process.stderr.write(`keylang: note: ${file}: a saved explanation, not keylang Markdown; skipped\n`);
    else out.push({ file, text });
  }
  return out;
}

/** `fmt` and `parse` do not validate the rest of `keylang.json`, only which edition it asks for. */
function assertConfigFormat(): void {
  const file = join(findRoot(process.cwd()), CONFIG_FILE);
  if (!existsSync(file)) return;
  assertFormatOnly(file, readFileSync(file, "utf8"));
}

function cmdParse(paths: string[], json: boolean): number {
  assertConfigFormat();
  const docs = keylangFiles(paths).map(({ file, text }) => parse(file, text));
  if (json) process.stdout.write(`${JSON.stringify(docs, null, 2)}\n`);
  else for (const d of docs) printTree(d);
  const diags = docs.flatMap((d) => d.diagnostics);
  for (const d of diags) process.stderr.write(`${formatDiagnostic(d)}\n`);
  return diags.some(isError) ? 1 : 0;
}

const FORMATS = ["human", "json", "sarif", "github"] as const;

async function cmdCheck(paths: string[], opts: { strict: boolean; format: string; explain: boolean; static: string | undefined; changed: boolean; since: string | undefined }): Promise<number> {
  if (!FORMATS.includes(opts.format as (typeof FORMATS)[number])) {
    throw new Error(`unknown --format \`${opts.format}\`; expected ${FORMATS.join(", ")}`);
  }
  let staticMode: StaticMode | undefined;
  if (opts.static !== undefined) {
    staticMode = STATIC_MODES.find((mode) => mode === opts.static);
    if (!staticMode) throw new Error(`unknown --static \`${opts.static}\`; expected ${STATIC_MODES.join(", ")}`);
  }
  if (opts.since !== undefined && !opts.changed) throw new Error("check: --since requires --changed");
  if (opts.changed && opts.explain) throw new Error("check: --changed cannot be combined with --explain-edge");
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
    ...(staticMode ? { static: staticMode } : {}),
    ...(inRepo ? {} : { withoutCode: true }),
  });
  for (const path of analyzed.notSpecs) process.stderr.write(`keylang: note: ${path}: the explained map and saved explanations are not specs; skipped\n`);
  const gitChanged = opts.changed ? gitChangedFiles(root, opts.since ?? "HEAD") : null;
  const changed = gitChanged === null ? null : changedPathSet(root, gitChanged.paths, cwd);
  const deleted = gitChanged === null ? [] : deletedModuleIds(config, gitChanged.deleted);
  const filtered = changed === null ? null : filterChanged({ docs: analyzed.docs, spec: analyzed.spec, diagnostics: analyzed.diagnostics, verdicts: analyzed.verdicts, nodes: analyzed.snapshot?.nodes ?? {} }, changed, deleted);
  const diags = filtered?.diagnostics ?? analyzed.diagnostics;
  const snapshot = analyzed.snapshot;
  const channel = filtered?.verdicts ?? analyzed.verdicts;
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
      process.stdout.write(`::${level} file=${githubProperty(result.file)},line=${result.line},col=${result.col},title=${githubProperty(ruleOf(result))}::${githubData(result.evidence)}\n`);
    }
    return;
  }
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({ snapshotId, results, coverage: snapshot?.coverage ?? [] }, null, 2)}\n`);
    return;
  }
  const reported = results.filter((result) => result.verdict !== "ok");
  const ruleIds = [...new Set(reported.map(ruleOf))].sort();
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "keylang", informationUri: "https://www.npmjs.com/package/keylang", rules: ruleIds.map((id) => ({ id, shortDescription: { text: ruleText(id) } })) } },
        // keylang counts columns in code points; SARIF's default is UTF-16 code units (§3.14.17).
        columnKind: "unicodeCodePoints",
        results: reported.map((result) => ({
          ruleId: ruleOf(result),
          ruleIndex: ruleIds.indexOf(ruleOf(result)),
          level: result.verdict === "fail" ? "error" : result.verdict === "warning" ? "warning" : "note",
          message: { text: result.evidence },
          locations: [{ physicalLocation: { artifactLocation: { uri: result.file }, region: { startLine: result.line, startColumn: result.col } } }],
          properties: {
            verdict: result.verdict,
            criterion: result.criterion,
            area: result.area,
            snapshotId: result.snapshotId,
            specHash: result.specHash,
            provenance: result.provenance,
            ...(result.reason !== undefined ? { reason: result.reason } : {}),
          },
        })),
        properties: { snapshotId },
      },
    ],
  };
  process.stdout.write(`${JSON.stringify(sarif, null, 2)}\n`);
}

/** The SARIF rule and GitHub title: every unverified result is `unverified`, a finding its K-code or evidence kind. */
function ruleOf(result: CheckResult): string {
  return result.verdict === "unverified" ? "unverified" : (result.code ?? result.verdict);
}

/** A flow verdict's evidence kind names its rule when it fails. */
const EVIDENCE_RULES: Record<string, string> = {
  ID: "flow: the id is not in the snapshot",
  static: "flow: no call path can reach the step from its parent",
  tests: "flow: the test of the claim failed",
  trace: "flow: the trace of a test contradicts the step",
};

function ruleText(id: string): string {
  if (id === "unverified") return "evidence for this criterion is incomplete";
  return EVIDENCE_RULES[id] ?? explainCode(id)?.split("\n")[0] ?? id;
}

// GitHub workflow commands: https://docs.github.com/actions/reference/workflow-commands-for-github-actions
function githubData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function githubProperty(text: string): string {
  return githubData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * Each file is formatted on its own, so one that cannot be read or written
 * does not stop the rest: every such failure is reported, and the code is 2;
 * otherwise 1 for diagnostics or, with `--check`, an unformatted file.
 */
function cmdFmt(paths: string[], checkOnly: boolean): number {
  assertConfigFormat();
  let findings = false;
  let failed = false;
  const fail = (file: string, action: string, error: unknown): void => {
    failed = true;
    process.stderr.write(`${file}: cannot ${action}: ${error instanceof Error ? error.message : String(error)}\n`);
  };
  for (const file of collectMdFiles(paths)) {
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch (error) {
      fail(file, "read", error);
      continue;
    }
    // The model's text is kept as it was written: formatting it would change a saved answer.
    if (isStoredExplanation(src)) continue;
    const r = formatSource(file, src);
    if (!r.ok) {
      findings = true;
      for (const d of r.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
    } else if (r.text !== src) {
      if (checkOnly) {
        findings = true;
        process.stdout.write(`${file}: not formatted\n`);
        continue;
      }
      try {
        writeFileSync(file, r.text);
        process.stdout.write(`${file}: formatted\n`);
      } catch (error) {
        fail(file, "write", error);
      }
    }
  }
  return failed ? 2 : findings ? 1 : 0;
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
    // Paths as they are, not C-quoted octal escapes, whatever the user's `core.quotePath`.
    const out = spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (out.error) throw new Error(`code-to-spec --since: git is not available (${out.error.message})`);
    if (out.status !== 0) throw new Error(`code-to-spec --since: git ${args[0]}: ${out.stderr.trim().split("\n")[0]}`);
    return out.stdout;
  };
  // `--relative`: paths from `root` and only files under it, whatever the repository's top level.
  // `--no-renames`: a moved file is all new lines (its fns have new IDs); fixed prefixes, whatever `diff.mnemonicPrefix` says.
  const diff = git(["diff", "--relative", "--no-renames", "--unified=0", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", ref, "--"]);
  const changed: Map<string, readonly (readonly [number, number])[] | "all"> = diffHunks(diff);
  for (const file of git(["ls-files", "-z", "--others", "--exclude-standard"]).split("\0")) if (file !== "") changed.set(file, "all");
  return changed;
}
