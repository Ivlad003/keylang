// `keylang` command line: the TUI (no command), web, init, map, check, parse, fmt.

import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { SHELLS, completionScript, helpCommands, isShell } from "./completions.ts";
import { gitHooksDir, preCommitCommand, preCommitState, preCommitText } from "./git-hook.ts";
import { safeWrite, writeAtomic } from "./safe-write.ts";
import { defaultSpecPath, flowNameProblem, newSpecProblem, specTemplate } from "./tui/new-spec.ts";
import { harnessChoice, type HarnessChoice } from "./harness.ts";
import { filterChanged, hookDecision, hookFails, parseHookEvent } from "./changed.ts";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { CONFIG_FILE, STATIC_MODES, loadConfig, toPosix, type StaticMode } from "./config.ts";
import { sameFinding } from "./assess.ts";
import { formatDiagnostic, type Diagnostic } from "./diag.ts";
import { analyze, findRoot, type Analysis } from "./analyze.ts";
import { isDiagnosticCode } from "./explain-offline.ts";
import { CHECK_FORMATS, checkReportText, isCheckFormat } from "./check-format.ts";
import type { BriefBatch } from "./explain-llm.ts";
import { positiveIntegerProblem } from "./explain-inventory.ts";
import type { ExplanationDetail } from "./explanations.ts";
import { changedPathSet, deletedModuleIds, gitChangedFiles } from "./git-changes.ts";
import { lineDiff } from "./proposals.ts";
import { serveLsp } from "./lsp.ts";
import { runTerminal } from "./tui/terminal.ts";
import { serveWeb } from "./tui/web.ts";
import { checkSkipNote, checkSummary, featureSummary, gapLine, initSources, mapCheckLines, mapConflictLines, mapStepLines, mapSummary, runOperation, type CodeToSpecSource, type ExplainPlanRequest, type OperationEnvelope } from "./operations.ts";
import { formatVerdict, type Verdict } from "./verdict.ts";
import { runStaleCheck, staleLine, staleSummary } from "./stale.ts";

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
  feature <slug> [--since <ref>] [--format json]
                            Whether <dir>/features/<slug>.md is done: every planned
                            id is implemented (K202, not K201), every flow step is
                            static ok, no rule fail remains, and the plan was not
                            weakened since <ref> (default HEAD; without git only
                            info.base says so). 0 done, 1 gaps, 2 missing file,
                            unreadable --since ref, or bad invocation
  hook stop                 Read a harness Stop event (JSON) from stdin, run
                            check --changed, and print a JSON decision. Writes nothing
  hook install [--check]    Write the git pre-commit hook that runs check --changed, in
                            git's hooks directory (core.hooksPath is honoured); rerun to
                            update it. A pre-commit hook keylang did not write is left
                            as is (exit 2). --check: fail when the hook is missing or
                            stale; writes nothing
  new flow <name>           Create <dir>/flows/<name>.md with the heading \`# flow <name>\`
  new module <name> --layer <layer>
                            Create <dir>/features/<name>.md declaring
                            \`planned module <layer>.<name>\`; the layer must be in
                            keylang.json. Never overwrites a file (exit 2)
  completions <shell>       Print a completion script for bash, zsh or fish
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
                            --limit N: at most N nodes; --jobs N: requests at once
                            (4; 2 with an agent CLI)
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
  doctor                    What is set up: languages, the agent (its source, and its
                            credentials or its CLI binary and version), the agent CLIs
                            on PATH, voice (engine, local model, microphone); changes nothing
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
                            Given files, it prints verdicts and the summary for those
                            files only (e.g. check keylang/flows/buy.md)
                            Rebuilds the analysis in memory; does not write the map.
                            --changed reports only findings that touch files changed
                            since <ref> (default HEAD) plus untracked files
  check --stale [paths…] [--accept | --strict]
                            Prose whose code changed since it was accepted: node
                            descriptions and flow when/then/invariant, against the
                            fingerprints in <dir>/baseline.json (callees and cycles
                            included; "incomplete" when keylang cannot see all the
                            code). A warning: exit 0; --strict: exit 1 when any
                            statement or obsolete entry is listed. Writes nothing;
                            --accept writes the current fingerprints of the checked
                            specs after review
  parse [--json] <paths…>   Parse files (or all *.md under directories) and print the IR
  fmt [--check] <paths…>    Rewrite files in canonical format (--check: report only);
                            a file it cannot read or write is named and the rest are done (exit 2)

Options:
  -h, --help                Show this help
  -V, --version             Show version
  --strict                  Exit 1 when a required result is unverified
                            (check --stale: when any statement is to review)
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

The model (agent): KEYLANG_AGENT, else "use" in ~/.config/keylang/agents.json, else
keylang.json \`agent\`: "anthropic:<model>", "openrouter:<model>" (API key), or
"cli:<name>[:<model>]", an installed agent CLI asked for text only (claude, codex,
opencode, cursor, or a command in agents.json "clis"). KEYLANG_LLM_TIMEOUT_MS bounds
a request (default 600000).

Exit codes: 0 no blocking findings, 1 violations (or unverified with --strict,
or prose to review with check --stale --strict) or a stale map with --check,
2 usage or I/O error.
`;

/** The flags of every command; `completions` completes this same table. */
const OPTIONS = {
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
  accept: { type: "boolean" },
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
  layer: { type: "string" },
} as const satisfies ParseArgsOptionsConfig;

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
    options: OPTIONS,
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
      return cmdAgents(findRoot(process.cwd()), harnessChoice(values.agents), values.check === true);
    case "baseline":
      return cmdBaseline(findRoot(process.cwd()), values.check === true);
    case "feature":
      return cmdFeature(paths[0], values.format ?? "human", values.since);
    case "hook":
      return cmdHook(paths[0], values.check === true);
    case "new":
      return cmdNew(paths, values.layer);
    case "completions":
      return cmdCompletions(paths[0]);
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
        stale: values.stale === true,
        accept: values.accept === true,
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
  if (opts.stale) return explainPlanPrinter({ kind: "explain-plan", root: findRoot(process.cwd()), list: "stale-saved" });
  if (!subject) throw new Error("explain: a code or an id is required");
  // A code, and an ID without the model: a printer over the shared offline operation.
  if (!opts.llm || isDiagnosticCode(subject)) {
    const detail: ExplanationDetail | undefined = opts.brief ? "brief" : opts.full ? "full" : undefined;
    const result = await runOperation({ kind: "explain", root: findRoot(process.cwd()), subject, ...(detail !== undefined ? { detail } : {}) });
    for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
    if (result.payload === null) throw new Error(result.messages.find((message) => message.level === "error")?.text ?? "explain failed");
    process.stdout.write(result.payload.text);
    return 0;
  }
  // An ID with the model: a printer over the shared operation (a fresh saved answer is read, not asked for again).
  const detail: ExplanationDetail | undefined = opts.brief ? "brief" : opts.full ? "full" : undefined;
  const result = await runOperation({ kind: "explain-llm", root: findRoot(process.cwd()), id: subject, ...(detail !== undefined ? { detail } : {}) });
  for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  if (result.status !== "completed" || result.payload === null) {
    const errors = result.messages.filter((message) => message.level === "error");
    if (result.exitCode !== 1 || errors.length === 0) throw new Error(errors[0]?.text ?? "explain failed");
    // Refused: the saved answer stays; every reason is named.
    for (const message of result.messages) if (message.level !== "warning") process.stderr.write(`keylang: ${message.text}\n`);
    return 1;
  }
  process.stdout.write(result.payload.text);
  return 0;
}

/**
 * `explain --missing|--stale [--llm] [--dry-run] [--limit N] [--jobs N]`:
 * briefs for the explained map, bottom-up. Without `--llm` it lists the nodes;
 * `--dry-run` counts them and estimates tokens. Exit 1 when some nodes failed.
 */
async function cmdExplainBatch(batch: BriefBatch, opts: ExplainOptions): Promise<number> {
  const limit = opts.limit === undefined ? undefined : positiveInteger("--limit", opts.limit);
  // No --jobs: the operation takes the agent's default (4, or 2 for an agent CLI).
  const jobs = opts.jobs === undefined ? undefined : positiveInteger("--jobs", opts.jobs);
  // The list and the dry run: a printer over the shared read-only plan.
  if (opts.dryRun || !opts.llm) return explainPlanPrinter({ kind: "explain-plan", root: findRoot(process.cwd()), list: "briefs", batch, ...(limit !== undefined ? { limit } : {}), ...(jobs !== undefined ? { jobs } : {}), estimate: opts.dryRun });
  // The batch: a printer over the shared operation; a progress line per node on stderr.
  const result = await runOperation(
    { kind: "explain-batch", root: findRoot(process.cwd()), batch, ...(limit !== undefined ? { limit } : {}), ...(jobs !== undefined ? { jobs } : {}) },
    { onProgress: ({ step }) => step && process.stderr.write(`[${step.done}/${step.total}] ${step.id}${step.failed === null ? "" : `: failed: ${step.failed}`}\n`) },
  );
  for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  if (result.payload === null) throw new Error(result.messages.find((message) => message.level === "error")?.text ?? "explain failed");
  process.stdout.write(result.payload.text);
  // Stopped because an input changed: the reasons; the briefs written before stay.
  if (result.payload.stopped !== null) for (const reason of result.payload.refused) process.stderr.write(`keylang: ${reason}\n`);
  return result.exitCode === 0 ? 0 : 1;
}

/** `explain --stale`, and a brief plan without `--llm`: the note on stderr, the stdout of the shared operation; a failure is the CLI's error. */
async function explainPlanPrinter(request: ExplainPlanRequest): Promise<number> {
  const result = await runOperation(request);
  for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  if (result.payload === null) throw new Error(result.messages.find((message) => message.level === "error")?.text ?? "explain failed");
  process.stdout.write(result.payload.text);
  return 0;
}

function positiveInteger(flag: string, text: string): number {
  const problem = positiveIntegerProblem(flag, text);
  if (problem !== null) throw new Error(problem);
  return Number(text);
}

async function cmdDraft(args: string[], opts: { mode: string; name: string | undefined; into: string | undefined; print: boolean }): Promise<number> {
  const [what, trigger] = args;
  if (what === "rules" || what === "map") return cmdDraftLayout(what, opts);
  if (what !== "flow") throw new Error("draft: expected `draft flow <trigger>`, `draft rules` or `draft map`");
  if (!trigger) throw new Error("draft flow: a trigger id is required");
  if (opts.mode !== "algo" && opts.mode !== "llm" && opts.mode !== "hybrid") throw new Error(`draft: --mode must be algo, llm or hybrid, got \`${opts.mode}\``);
  return draftFlowPrinter(findRoot(process.cwd()), trigger, opts.mode, opts);
}

/**
 * `draft flow <trigger> --mode algo|llm|hybrid`: a printer over the shared
 * `draft-flow` operation. The proposal replaces one already waiting, as the
 * CLI always did. On stderr: the fallback of a hybrid without a model, IDs
 * the model left unknown, lines it dropped, a stats file not updated.
 */
async function draftFlowPrinter(root: string, trigger: string, mode: "algo" | "llm" | "hybrid", opts: { name: string | undefined; into: string | undefined; print: boolean }): Promise<number> {
  const result = await runOperation({
    kind: "draft-flow",
    root,
    trigger,
    mode,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    ...(opts.into !== undefined ? { into: opts.into } : {}),
    output: opts.print ? "preview" : "proposal",
    pending: "replace",
  });
  const payload = result.payload;
  for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  if (result.status !== "completed" || payload === null) {
    for (const message of result.messages) if (message.level === "error") process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  if (payload.output === "preview") {
    process.stdout.write(payload.candidate.flow);
    return 0;
  }
  process.stdout.write(`${toPosix(relative(process.cwd(), join(root, payload.proposal!)))}: proposed flow \`${payload.candidate.name}\` for ${payload.candidate.target} (${payload.summary}); merge it with \`m\` in \`keylang\`\n`);
  return 0;
}

async function cmdSpecToCode(id: string | undefined, opts: { into: string | undefined; apply: boolean; print: boolean; mode: string }): Promise<number> {
  if (opts.apply && opts.print) throw new Error("spec-to-code: --apply writes the files, --print writes nothing; give one");
  if (!id) throw new Error("spec-to-code: a planned id is required");
  if (opts.mode !== "algo" && opts.mode !== "llm") throw new Error(`spec-to-code: --mode must be algo or llm, got \`${opts.mode}\``);
  const root = findRoot(process.cwd());
  const into = opts.into === undefined ? undefined : toPosix(opts.into);
  if (opts.apply) return specToCodeApplyPrinter(root, id, into, opts.mode);
  return specToCodePrinter(root, id, into, opts.print, opts.mode);
}

/**
 * `spec-to-code <id> [--into] [--mode algo|llm] --apply`: the candidate is
 * built as a preview (stdout and the test notes as `--print`), then the
 * shared `apply-code` operation writes its files; a proposal waiting for one
 * stays, as it always did. Any file not written ends with 2, as `--apply`
 * always did — a file changed meanwhile too; part way, the error is followed
 * by what was written and what was not.
 */
async function specToCodeApplyPrinter(root: string, id: string, into: string | undefined, mode: "algo" | "llm"): Promise<number> {
  const built = await runOperation({ kind: "spec-to-code", root, id, ...(into !== undefined ? { into } : {}), output: "preview", ...(mode === "llm" ? { mode } : {}) });
  const payload = built.payload;
  if (payload !== null) process.stdout.write(payload.candidate.print);
  for (const message of built.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  if (built.status !== "completed" || payload === null) {
    for (const message of built.messages) if (message.level === "error") process.stderr.write(`keylang: ${message.text}\n`);
    return built.exitCode ?? 2;
  }
  const applied = await runOperation({ kind: "apply-code", root, candidate: payload.candidate, mode, pending: "keep" });
  if (applied.status === "completed" && applied.payload !== null) {
    const next = mode === "llm" ? "review the body and the tests, then run them" : "write the body and its tests";
    process.stderr.write(`keylang: ${applied.written.join(", ")} written; run \`keylang map\`, then ${next}\n`);
    return 0;
  }
  for (const message of applied.messages) if (message.level === "error") process.stderr.write(`keylang: ${message.text}\n`);
  if (applied.payload?.error != null) {
    for (const file of applied.payload.files) if (file.state !== "failed") process.stderr.write(`keylang: ${file.file}: ${file.state === "completed" ? "written" : "not written"}\n`);
  }
  return 2;
}

/**
 * `spec-to-code <id> [--into] [--mode algo|llm] [--print]`: a printer
 * over the shared `spec-to-code` operation. stdout is the candidate's
 * files and findings, stderr the test notes and then what was (not)
 * written. The proposals replace ones already waiting, as the CLI always did.
 */
async function specToCodePrinter(root: string, id: string, into: string | undefined, print: boolean, mode: "algo" | "llm"): Promise<number> {
  const result = await runOperation({ kind: "spec-to-code", root, id, ...(into !== undefined ? { into } : {}), output: print ? "preview" : "proposal", pending: "replace", ...(mode === "llm" ? { mode } : {}) });
  const payload = result.payload;
  if (payload !== null) process.stdout.write(payload.candidate.print);
  for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  if (result.status !== "completed" || payload === null) {
    for (const message of result.messages) if (message.level === "error") process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  if (print) process.stderr.write("keylang: nothing written; without --print the files become proposals, --apply writes them\n");
  else process.stderr.write(`keylang: proposed ${payload.proposals.join(", ")}; merge them hunk by hunk with \`m\` in \`keylang\` (--apply writes the files directly)\n`);
  return 0;
}

async function cmdCodeToSpec(at: string | undefined, opts: { into: string | undefined; print: boolean; mode: string; since: string | undefined }): Promise<number> {
  if (at !== undefined && opts.since !== undefined) throw new Error("code-to-spec: give a path or --since, not both");
  if (at === undefined && opts.since === undefined) throw new Error("code-to-spec: a path, optionally with :line, or --since <git-ref> is required");
  const root = findRoot(process.cwd());
  const analysis = await analyze({ root, withoutEvidence: true });
  if (!analysis.snapshot) throw new Error("code-to-spec: no supported source files; run `keylang init`");
  let source: CodeToSpecSource;
  if (at !== undefined) {
    const m = /^(.*?)(?::(\d+))?$/.exec(at)!;
    source = { file: toPosix(relative(root, resolve(process.cwd(), m[1]!))), ...(m[2] !== undefined ? { line: Number(m[2]) } : {}) };
  } else {
    source = { since: opts.since! };
  }
  return codeToSpecPrinter(root, source, analysis, opts);
}

/**
 * `code-to-spec <path[:line]> | --since <ref> [--mode] [--into] [--print]`:
 * a printer over the shared `code-to-spec` operation, on the analysis
 * already made. The path is relative to the working directory, `--into` to
 * the root. The proposal replaces one already waiting, as the CLI always
 * did. On stderr, as each comes: the changed fns already in flows, the
 * fallback of a hybrid without a model, the model's notes, a stats file not
 * updated. An unknown mode is refused once the source named its fns, as
 * before: the source is drafted as an algo preview first, and a change with
 * nothing to draft is still the success it always was.
 */
async function codeToSpecPrinter(root: string, source: CodeToSpecSource, analysis: Analysis, opts: { into: string | undefined; print: boolean; mode: string }): Promise<number> {
  const mode = opts.mode === "algo" || opts.mode === "llm" || opts.mode === "hybrid" ? opts.mode : null;
  const result = await runOperation(
    {
      kind: "code-to-spec",
      root,
      ...source,
      ...(opts.into !== undefined ? { into: toPosix(opts.into) } : {}),
      output: opts.print || mode === null ? "preview" : "proposal",
      mode: mode ?? "algo",
      pending: "replace",
    },
    { analyze: async () => analysis },
  );
  for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  const payload = result.payload;
  if (result.status !== "completed" || payload === null) {
    for (const message of result.messages) if (message.level === "error") process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  if (payload.candidate === null) {
    for (const message of result.messages) if (message.level === "info") process.stderr.write(`keylang: ${message.text}\n`);
    return 0;
  }
  if (mode === null) throw new Error(`code-to-spec: --mode must be algo, llm or hybrid, got \`${opts.mode}\``);
  if (payload.output === "preview") {
    process.stdout.write(payload.candidate.print);
    return 0;
  }
  const names = payload.candidate.flows.map((flow) => `\`${flow.name}\``).join(", ");
  process.stdout.write(`${toPosix(relative(process.cwd(), join(root, payload.proposal!)))}: proposed ${names} for ${payload.candidate.target}; merge it with \`m\` in \`keylang\`\n`);
  return 0;
}

async function cmdDraftLayout(what: "rules" | "map", opts: { mode: string; into: string | undefined; print: boolean }): Promise<number> {
  if (opts.mode !== "algo" && opts.mode !== "llm" && opts.mode !== "hybrid") throw new Error(`draft ${what}: --mode must be algo, llm or hybrid, got \`${opts.mode}\``);
  const root = findRoot(process.cwd());
  return what === "map" ? draftMapPrinter(root, opts.mode) : draftRulesPrinter(root, opts.mode, opts);
}

/**
 * `draft map [--mode algo|llm|hybrid]`: a printer over the shared
 * `draft-layout` operation. Stdout: the config with the drafted layers; on
 * stderr the fallback of a hybrid without a model, then that nothing was
 * written. keylang.json never changes.
 */
async function draftMapPrinter(root: string, mode: "algo" | "llm" | "hybrid"): Promise<number> {
  const result = await runOperation({ kind: "draft-layout", root, mode });
  for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  if (result.status !== "completed" || result.payload === null) {
    for (const message of result.messages) if (message.level === "error") process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  process.stdout.write(result.payload.preview);
  for (const message of result.messages) if (message.level === "info") process.stderr.write(`keylang: ${message.text}\n`);
  return 0;
}

/**
 * `draft rules [--mode algo|llm|hybrid] [--into] [--print]`: a printer over
 * the shared `draft-rules` operation. The proposal replaces one already
 * waiting, as the CLI always did. On stderr: the fallback of a hybrid
 * without a model, each conflict with its evidence, a stats file not updated.
 */
async function draftRulesPrinter(root: string, mode: "algo" | "llm" | "hybrid", opts: { into: string | undefined; print: boolean }): Promise<number> {
  const result = await runOperation({
    kind: "draft-rules",
    root,
    mode,
    ...(opts.into !== undefined ? { into: toPosix(opts.into) } : {}),
    output: opts.print ? "preview" : "proposal",
    pending: "replace",
  });
  const payload = result.payload;
  for (const message of result.messages) if (message.level === "warning") process.stderr.write(`keylang: ${message.text}\n`);
  if (result.status !== "completed" || payload === null) {
    for (const message of result.messages) if (message.level === "error") process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  if (payload.output === "preview") {
    process.stdout.write(payload.candidate.rules);
    return 0;
  }
  process.stdout.write(`${toPosix(relative(process.cwd(), join(root, payload.proposal!)))}: proposed rules for ${payload.candidate.target}; merge it with \`m\` in \`keylang\`\n`);
  return 0;
}

/** `keylang wire [--check]`: the CLI is a printer over the shared wire operation. */
async function cmdWire(out: string, checkOnly: boolean): Promise<number> {
  const result = await runOperation({ kind: "wire", root: findRoot(process.cwd()), out: toPosix(out), check: checkOnly });
  const payload = result.payload;
  // A usage, config or I/O failure is one `keylang:` line on stderr, as a thrown error always was.
  if (payload === null || result.exitCode === 2) {
    for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  // Diagnostics and file lines go to stdout; the summary of a blocked or refused run to stderr.
  for (const message of result.messages) (message.level === "info" && payload.refused.length === 0 ? process.stdout : process.stderr).write(`${message.text}\n`);
  return result.exitCode ?? 2;
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

/** A printer over the shared trace-plan operation: the plan's JSON to stdout and nothing else. */
async function cmdTracePlan(flow: string | undefined): Promise<number> {
  if (!flow) throw new Error("trace-plan: a flow name is required");
  const result = await runOperation({ kind: "trace-plan", root: findRoot(process.cwd()), flow });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "trace-plan failed");
  process.stdout.write(result.payload.text);
  return result.exitCode ?? 2;
}

function needPaths(cmd: string, paths: string[]): void {
  if (paths.length === 0) throw new Error(`${cmd}: at least one path is required`);
}

/** `init [dir] [--agents=LIST] [--check]`: a printer over the shared init operation, stage by stage in the order the stages ran. */
async function cmdInit(dir: string, opts: { agents: string | undefined; check: boolean }): Promise<number> {
  const root = resolve(process.cwd(), dir);
  let choice: HarnessChoice;
  try {
    choice = harnessChoice(opts.agents);
  } catch (error) {
    // No supported source (or a broken keylang.json) has always been named before an unknown harness.
    const sources = initSources(root, dir);
    if ("error" in sources) {
      process.stderr.write(`keylang: ${sources.error}\n`);
      return 2;
    }
    throw error;
  }
  const result = await runOperation({ kind: "init", root, harnesses: choice, check: opts.check, label: dir });
  const payload = result.payload;
  if (payload === null) {
    for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  if (payload.check) {
    if (payload.agents) printAgents(payload.agents);
    if (payload.baseline) printBaseline(payload.baseline);
    return result.exitCode ?? 2;
  }
  if (payload.preflight?.status === "failed") return printAgents(payload.preflight);
  const config = relative(process.cwd(), join(root, payload.config.file)) || CONFIG_FILE;
  if (payload.config.existed) process.stdout.write(`${config}: already exists, kept\n`);
  else {
    for (const note of payload.config.notes) process.stderr.write(`keylang: note: ${note}\n`);
    if (payload.config.error !== null) {
      process.stderr.write(`keylang: ${config}: ${payload.config.error}\n`);
      return result.exitCode ?? 2;
    }
    if (payload.config.written) process.stdout.write(`${config}: written (${payload.languages.join(", ")}; layers: ${payload.config.layers.join(", ")})\n`);
  }
  if (payload.map) printMap(payload.map, root);
  if (payload.baseline) printBaseline(payload.baseline);
  if (payload.agents) printAgents(payload.agents);
  return result.exitCode ?? 2;
}

/** `agents [--agents=LIST] [--check]`: a printer over the shared agents operation. */
async function cmdAgents(root: string, harnesses: HarnessChoice, checkOnly: boolean): Promise<number> {
  return printAgents(await runOperation({ kind: "agents", root, harnesses, check: checkOnly }));
}

/** File lines to stdout (`stale`, `written`, `removed`, a refusal's reasons); failures to stderr. */
function printAgents(result: OperationEnvelope<"agents">): number {
  const payload = result.payload;
  if (payload === null || payload.error !== null) {
    for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  if (payload.refused.length > 0) {
    for (const line of payload.refused) process.stdout.write(`${line}\n`);
    process.stderr.write("keylang: nothing was written; run `keylang agents` again\n");
    return result.exitCode ?? 2;
  }
  for (const message of result.messages) {
    if (message.level === "info") process.stdout.write(`${message.text}\n`);
    else process.stderr.write(`keylang: ${message.text}\n`);
  }
  return result.exitCode ?? 2;
}

/** `baseline [--check]`: a printer over the shared baseline operation. Lines for the file go to stdout; failures to stderr. */
async function cmdBaseline(root: string, checkOnly: boolean): Promise<number> {
  return printBaseline(await runOperation({ kind: "baseline", root, check: checkOnly }));
}

function printBaseline(result: OperationEnvelope<"baseline">): number {
  const payload = result.payload;
  if (payload === null || payload.error !== null) {
    for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  for (const message of result.messages) {
    if (message.level === "error") process.stdout.write(`${message.text}\n`);
    else if (payload.refused.length > 0) process.stderr.write(`keylang: ${message.text}\n`);
    else process.stdout.write(`${message.text}\n`);
  }
  return result.exitCode ?? 2;
}

/** Whether a feature is done, on the saved files. The CLI is a printer over the shared feature operation. */
async function cmdFeature(slug: string | undefined, format: string, since: string | undefined): Promise<number> {
  if (!slug) throw new Error("feature: a slug is required");
  if (format !== "human" && format !== "json") throw new Error(`feature: unknown --format \`${format}\`; expected human, json`);
  const result = await runOperation({ kind: "feature", root: findRoot(process.cwd()), slug, ...(since !== undefined ? { since } : {}) });
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

async function cmdHook(name: string | undefined, checkOnly: boolean): Promise<number> {
  if (name === "install") return cmdHookInstall(checkOnly);
  if (name !== "stop") throw new Error("hook: expected `stop` or `install`");
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

/**
 * `hook install [--check]`: keylang's pre-commit hook in git's hooks
 * directory. A hook without keylang's marker is someone else's: install
 * refuses with 2 and names the line to add; --check counts it as not installed.
 */
function cmdHookInstall(checkOnly: boolean): number {
  const version = packageVersion();
  const file = join(gitHooksDir(process.cwd()), "pre-commit");
  const shown = toPosix(relative(process.cwd(), file));
  const entry = existsSync(file) ? statSync(file) : null;
  if (entry !== null && !entry.isFile()) throw new Error(`hook install: ${shown}: not a file`);
  const current = entry === null ? null : readFileSync(file, "utf8");
  const state = preCommitState(current, entry !== null && (entry.mode & 0o111) !== 0, version);
  const foreign = `${shown}: a pre-commit hook keylang did not write; add \`${preCommitCommand(version)}\` to it`;
  if (checkOnly) {
    if (state === "current") {
      process.stdout.write(`${shown}: up to date\n`);
      return 0;
    }
    if (state === "foreign") process.stderr.write(`keylang: ${foreign}\n`);
    else process.stderr.write(`keylang: ${shown}: ${state === "missing" ? "no pre-commit hook" : "stale pre-commit hook"}; run \`keylang hook install\`\n`);
    return 1;
  }
  if (state === "foreign") throw new Error(`hook install: ${foreign}`);
  if (state !== "current") {
    writeAtomic(file, preCommitText(version), { exact: true });
    chmodSync(file, 0o755);
  }
  process.stdout.write(`${shown}: ${state === "current" ? "up to date" : "written"}; runs \`${preCommitCommand(version)}\`\n`);
  return 0;
}

/** `new flow <name>`, `new module <name> --layer <layer>`: a skeleton spec, never over an existing file. */
function cmdNew(args: readonly string[], layer: string | undefined): number {
  const [what, name, ...rest] = args;
  if (what !== "flow" && what !== "module") throw new Error("new: expected `new flow <name>` or `new module <name> --layer <layer>`");
  if (name === undefined) throw new Error(`new ${what}: a name is required`);
  if (rest.length > 0) throw new Error(`new ${what}: unexpected \`${rest.join(" ")}\``);
  const problem = flowNameProblem(name);
  if (problem !== null) throw new Error(`new ${what}: ${problem.replace("a flow name", `a ${what} name`)}`);
  const root = findRoot(process.cwd());
  const config = loadConfig(root);
  let path: string;
  let text: string;
  if (what === "flow") {
    if (layer !== undefined) throw new Error("new flow: --layer is for `new module`");
    path = `${defaultSpecPath("flow", config.dir)}${name}.md`;
    text = specTemplate("flow", name);
  } else {
    const layers = [...config.layers.keys()].join(", ");
    if (layer === undefined) throw new Error(`new module: --layer <layer> is required; layers in ${CONFIG_FILE}: ${layers}`);
    if (!config.layers.has(layer)) {
      // Without the file the guessed layers are not the user's to name; with it but without layers the list would be empty.
      if (!existsSync(join(root, CONFIG_FILE))) throw new Error(`new module: no ${CONFIG_FILE} here; add "layers" to ${CONFIG_FILE} (or run \`keylang init\` once there is code)`);
      if (config.guessed) throw new Error(`new module: no layers in ${CONFIG_FILE}`);
      throw new Error(`new module: unknown layer \`${layer}\`; layers in ${CONFIG_FILE}: ${layers}`);
    }
    path = `${defaultSpecPath("feature", config.dir)}${name}.md`;
    text = plannedModuleTemplate(layer, name);
  }
  const shown = toPosix(relative(process.cwd(), join(root, path)));
  if (existsSync(join(root, path))) throw new Error(`new ${what}: ${shown} exists; new never overwrites a file`);
  const refused = newSpecProblem(root, config.dir, path);
  if (refused !== null) throw new Error(`new ${what}: ${shown}: ${refused}`);
  safeWrite(root, path, text, { expect: null });
  process.stdout.write(`${shown}: created\n`);
  return 0;
}

/**
 * A module that has no code yet is an intention: `planned module` at the top
 * of a flow section (format §5), in a feature file named after it. The prose
 * says why a module request gets a flow heading; it is not part of the grammar.
 */
function plannedModuleTemplate(layer: string, name: string): string {
  const note =
    `A feature file: the planned declarations below are what to build; \`keylang feature ${name}\` says what is still missing. ` +
    "Add `- trigger` and `- step` lines to describe the flow.";
  return `# flow ${name}\n\n${note}\n\n- planned module ${layer}.${name}\n`;
}

/** `completions <shell>`: commands from the help text, flags from the parser's table. */
function cmdCompletions(shell: string | undefined): number {
  if (shell === undefined || !isShell(shell)) throw new Error(`completions: expected a shell: ${SHELLS.join(", ")}${shell === undefined ? "" : `; got \`${shell}\``}`);
  const flags = Object.entries(OPTIONS).map(([long, option]) => ("short" in option ? { long, short: option.short } : { long }));
  process.stdout.write(completionScript(shell, { commands: helpCommands(USAGE), flags }));
  return 0;
}

function packageVersion(): string {
  return (createRequire(import.meta.url)("../package.json") as { version: string }).version;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
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
  return printMap(await runOperation({ kind: "map", root, label: dir }), root);
}

/** The lines of a map write: paths relative to the working directory; failures and the summary to stderr. */
function printMap(result: OperationEnvelope<"map">, root: string): number {
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

/**
 * A printer over the shared parse operation: the tree or the JSON to stdout
 * and nothing else; the notes on skipped explanations and the diagnostics to
 * stderr.
 */
async function cmdParse(paths: string[], json: boolean): Promise<number> {
  const cwd = process.cwd();
  const result = await runOperation({ kind: "parse", root: findRoot(cwd), base: cwd, paths, format: json ? "json" : "tree" });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "parse failed");
  const { payload } = result;
  for (const file of payload.skipped) process.stderr.write(`keylang: note: ${file}: a saved explanation, not keylang Markdown; skipped\n`);
  process.stdout.write(payload.text);
  for (const d of payload.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
  return result.exitCode ?? 2;
}

async function cmdCheck(paths: string[], opts: { strict: boolean; format: string; explain: boolean; static: string | undefined; changed: boolean; since: string | undefined; stale: boolean; accept: boolean }): Promise<number> {
  if (opts.accept && !opts.stale) throw new Error("check: --accept requires --stale");
  if (opts.stale) {
    const other = opts.explain ? "--explain-edge" : opts.changed ? "--changed" : opts.static !== undefined ? "--static" : opts.format !== "human" ? "--format" : null;
    if (other !== null) throw new Error(`check: --stale cannot be combined with ${other}`);
    if (opts.accept && opts.strict) throw new Error("check: --accept writes the baseline and --strict gates on it; pass one of them");
    return cmdCheckStale(paths, opts.accept, opts.strict);
  }
  const format = opts.format;
  if (!isCheckFormat(format)) throw new Error(`unknown --format \`${format}\`; expected ${CHECK_FORMATS.join(", ")}`);
  let staticMode: StaticMode | undefined;
  if (opts.static !== undefined) {
    staticMode = STATIC_MODES.find((mode) => mode === opts.static);
    if (!staticMode) throw new Error(`unknown --static \`${opts.static}\`; expected ${STATIC_MODES.join(", ")}`);
  }
  if (opts.since !== undefined && !opts.changed) throw new Error("check: --since requires --changed");
  if (opts.changed && opts.explain) throw new Error("check: --changed cannot be combined with --explain-edge");
  const cwd = process.cwd();
  if (opts.explain) {
    const [from, to, extra] = paths;
    const root = findRoot(cwd);
    if (!from || !to || extra !== undefined) {
      // A broken keylang.json is reported first, as it always was.
      loadConfig(root);
      throw new Error("check --explain-edge needs exactly two ids: <from> <to>");
    }
    const explained = await runOperation({ kind: "explain-edge", root, from, to });
    if (explained.payload === null) throw new Error(explained.messages[0]?.text ?? "check --explain-edge failed");
    for (const line of explained.payload.lines) process.stdout.write(`${line}\n`);
    return explained.exitCode ?? 2;
  }
  const root = findRoot(cwd);
  const result = await runOperation({
    kind: "check",
    root,
    paths,
    base: cwd,
    strict: opts.strict,
    ...(staticMode ? { static: staticMode } : {}),
    ...(opts.changed ? { changed: true } : {}),
    ...(opts.since !== undefined ? { since: opts.since } : {}),
  });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "check failed");
  const { payload } = result;
  for (const path of payload.notSpecs) process.stderr.write(`keylang: ${checkSkipNote(path)}\n`);
  // The format only shows the report: the verdicts and the code do not depend on it.
  process.stdout.write(checkReportText(format, payload));
  process.stderr.write(`${checkSummary(payload.counts)}\n`);
  return result.exitCode ?? 2;
}

/**
 * `check --stale`: one line per statement to review on stdout (stale, new, or
 * unchanged but incomplete) and per obsolete baseline entry, the counts on
 * stderr. Stale is a warning: the code is 0 unless the invocation or I/O
 * fails; with `strict`, any such line is 1, so CI can gate on review.
 */
async function cmdCheckStale(paths: string[], accept: boolean, strict: boolean): Promise<number> {
  const cwd = process.cwd();
  const { report, path, accepted } = await runStaleCheck({ root: findRoot(cwd), base: cwd, paths, accept });
  const toReview = report.findings.filter((f) => f.state !== "fresh" || f.incomplete.length > 0);
  for (const f of toReview) process.stdout.write(`${staleLine(f)}\n`);
  for (const o of report.obsolete) process.stdout.write(`${path}: obsolete \`${o.key}\` of ${o.file}: no such statement any more\n`);
  process.stderr.write(`${staleSummary(report)}\n`);
  if (accepted !== null) process.stderr.write(`keylang: accepted ${accepted} fingerprint${accepted === 1 ? "" : "s"} in ${path}\n`);
  else if (report.findings.some((f) => f.state !== "fresh") || report.obsolete.length > 0) process.stderr.write("keylang: after review, run `keylang check --stale --accept`\n");
  return strict && (toReview.length > 0 || report.obsolete.length > 0) ? 1 : 0;
}

/**
 * Each file is formatted on its own, so one that cannot be read or written
 * does not stop the rest: every such failure is reported, and the code is 2;
 * otherwise 1 for diagnostics or, with `--check`, an unformatted file. The
 * CLI is a printer over the shared fmt operation: stdout for what changed,
 * stderr for diagnostics and failures; a saved explanation passes silently.
 */
async function cmdFmt(paths: string[], checkOnly: boolean): Promise<number> {
  const cwd = process.cwd();
  const result = await runOperation({ kind: "fmt", root: findRoot(cwd), base: cwd, paths, check: checkOnly });
  if (result.payload === null) {
    for (const message of result.messages) process.stderr.write(`keylang: ${message.text}\n`);
    return result.exitCode ?? 2;
  }
  for (const message of result.messages) {
    if (message.level === "info") process.stdout.write(`${message.text}\n`);
    else if (message.level === "error") process.stderr.write(`${message.text}\n`);
  }
  return result.exitCode ?? 2;
}

