// `keylang` command line: the TUI (no command), web, clone, init, map, check, parse, fmt.
//
// A module only one command needs (the terminal TUI, web, LSP, MCP, `new`,
// `hook install`, `completions`, `check --stale`) is imported in that
// command's handler, so `--version` and `check` do not compile it. The
// specifiers stay literal: the map keeps the import edge.

import { chmodSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { safeWrite, writeAtomic } from "./safe-write.ts";
import { harnessChoice, type HarnessChoice } from "./harness.ts";
import { CLONE_EXPLAIN_MODES, cloneCacheRoot, enableExplainedMap, isCloneExplain, parseRepoSource, syncClone, type CloneExplain } from "./clone.ts";
import { filterChanged, hookDecision, hookFails, parseHookEvent, uncheckedTurn } from "./changed.ts";
import { readWeakenings } from "./weakening.ts";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { CONFIG_FILE, STATIC_MODES, loadConfig, toPosix, type StaticMode } from "./config.ts";
import { formatDiagnostic } from "./diag.ts";
import { analyze, findRoot, type Analysis } from "./analyze.ts";
import { isDiagnosticCode } from "./explain-offline.ts";
import { selectedAgent } from "./agent-cli.ts";
import { CHECK_FORMATS, checkReportText, isCheckFormat } from "./check-format.ts";
import type { BriefBatch } from "./explain-llm.ts";
import { positiveIntegerProblem } from "./explain-inventory.ts";
import { isNameMode, NAME_MODES } from "./discover-names.ts";
import { ENTRY_KINDS, isEntryKind } from "./snapshot.ts";
import type { ExplanationDetail } from "./explanations.ts";
import { changedPathSet, deletedModuleIds, gitChangedFiles } from "./git-changes.ts";
import { checkSkipNote, checkSummary, featureSummary, fmtGeneratedNote, gapLine, gitignoreMessage, hintLine, initSources, mapCheckLines, mapConflictLines, mapStepLines, mapSummary, runOperation, type CodeToSpecSource, type ExplainPlanRequest, type GitignoreStage, type OperationEnvelope } from "./operations.ts";

const USAGE = `keylang: architecture description bound to a repository

Usage: keylang                      Open the TUI in this terminal (needs a TTY)
       keylang <command> [options] [paths…]

Commands:
  web [url] [--port N] [--host H]
                            The TUI in a browser tab: serves http://localhost:7070
                            with a one-time token (localhost only by default).
                            With a repository URL or path: clone it first, as clone
                            does, and serve the clone
  clone <url> [--dir D] [--explain MODE] [--dry-run]
                            Shallow-clone a repository (https, ssh, git, file URL,
                            git@host:owner/repo or a local path) into
                            $XDG_CACHE_HOME/keylang/repos/<host>/<path> (else
                            ~/.cache/…; --dir: elsewhere), or update a clone keylang
                            made there to the remote's default branch, then init
                            with --agents=none and build the map. --explain:
                            map-only (default, no model), map-and-ai (also model
                            briefs and keylang/map-explained/), all (also a full
                            explanation of every layer in keylang/explain/).
                            --dry-run: the token estimate of the model's part, no
                            request. A directory keylang did not clone is refused
  init [dir] [--agents=LIST] [--check]
                            Detect languages and layers, write keylang.json, add
                            .keylang/ (the local cache) to .gitignore, build the map,
                            write rules.baseline.md, and install harness files
                            (AGENTS.md, MCP, skill, hooks). --agents is
                            claude,codex,opencode,cursor or none (no harness files
                            outside <dir>/). --check writes nothing and fails when a
                            managed block, MCP command, skill, or baseline is stale,
                            or .gitignore does not list .keylang/
  agents [--agents=LIST] [--check]
                            Install the same harness files on an initialized repo
  baseline [--check]        Write <dir>/rules.baseline.md from the current layer graph
                            (--check: fail when it does not match; says to run
                            \`keylang baseline\`; writes nothing)
  feature <slug> [--since <ref>] [--format json]
                            Whether <dir>/features/<slug>.md is done: it declares
                            something to check and has no spec errors (K001-K005),
                            every planned id is implemented (K202, not K201), every
                            flow step is static ok, no rule fail of this change
                            remains (one on a file changed since <ref> or on an id
                            the feature names; without git, any), and the plan was
                            not weakened since <ref> (without git only info.base
                            says so). Default <ref>: the merge-base of HEAD with the
                            main branch (origin/HEAD, else main, master, origin/main,
                            origin/master), so a fail committed on the branch is
                            still this change's; HEAD when there is none or it is
                            HEAD itself; with a merge-base the plan at HEAD is
                            compared too. The last line names its stage: idea,
                            behavior, structure, ready; hint: lines say what the spec
                            still lacks, or name an inherited rule fail. 0 done,
                            1 gaps, 2 missing file, unreadable --since ref, or bad
                            invocation. Writes only the fact cache .keylang/cache/
  hook stop                 Read a harness Stop event (JSON) from stdin, run
                            check --changed (K108 included: a spec weakened since
                            HEAD blocks), and print a JSON decision; writes
                            only the fact cache .keylang/cache/. Exit 0 once
                            started: a turn it cannot check (stdin not JSON, no
                            git, a broken keylang.json) prints {"systemMessage":
                            "keylang: this turn was not checked: <reason>"}, a
                            warning the harness shows the person without
                            blocking the agent, and the same line on stderr
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
                            carries its members' briefs), then one for the repository
                            itself (@system) when neither its README nor a root
                            manifest says what it is; each is saved as it arrives,
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
  draft flow --from-trace <file.jsonl> [--run <runId>]
                            The same proposal from what one trace run observed: nesting
                            from the spans, order from their starts; a step static does
                            not see is marked <!-- keylang:trace via observed -->
                            (--name, --into, --print as above; no --mode)
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
  proposals                 List .keylang/proposals/: each target with the lines it adds
                            and removes, or why it cannot be accepted; writes nothing
  proposals show <target>   Print the line diff of a proposal against its target
  proposals accept <target> For a person, never an agent: write the proposal's full text
                            to the target with the checks of MERGE in the TUI, then
                            remove the proposal
  proposals reject <target> Remove the proposal; the target stays as it is. 0 done,
                            1 nothing pending for the target or accept refused, 2 bad
                            invocation or I/O
  lsp [--stdio]             Speak LSP over stdio (--stdio is accepted for clients)
  doctor                    What is set up: languages, the agent (its source, and its
                            credentials or its CLI binary and version), the agent CLIs
                            on PATH, voice (engine, local model, microphone); changes nothing
  mcp                       Serve MCP over stdio for agents: search, node, code, flows,
                            check, explain, context, validate_spec, scaffold,
                            feature_status, list_entries, discover_flows, coverage_report,
                            list_integrations, project_tour, apply_diff
                            (proposals only; no spec is written, the fact cache
                            .keylang/cache/ is kept current)
  wire [--check] [--out f]  Generate keylang.gen.ts (or f: a .ts/.mts/.cts path relative to
                            the root, inside it) from \`# wiring\`: a typed wire() that builds
                            each factory once, dependencies first
                            (--check: fail if the file is stale; writes nothing)
  trace-plan <flow>         Print JSON: the flow's functions a trace adapter instruments
                            (Python, Rust), with the snapshot id and file hashes
  trace-plan --entry <id>   The same JSON for the fns an entry point reaches, to trace a
                            scenario before its flow exists (--name n: the runs' flow)
  entries [--kind k] [--json]
                            Where execution starts, from what the code and its manifests
                            write: kind · label · id · file:line (route, cli, main; a
                            framework's rest, graphql, cron, consumer, observer, webhook,
                            controller need its adapter). --kind: one kind. --json: the
                            list as JSON. Exit 0, also with nothing found; writes only
                            the fact cache .keylang/cache/
  coverage [--json]         Where keylang does not see, a view (check does not read it):
                            fns reachable from entry points over resolved calls, orphan
                            fns (no entry point reaches them; test files left out), the
                            modules with most holes by reason, entry points without a
                            hand-written flow (and their discovered flow), and «logic in
                            data»: calls into configuration readers listed in
                            resources/data-logic.json, to check by hand. --json: the
                            report as JSON. Exit 0; writes only the fact cache
  integrations [--json]     What the code talks to, a view (nothing is contacted):
                            calls into HTTP, SOAP, SDK and queue clients listed in
                            resources/integrations.json, by integration → call site
                            (file:line, fn, host of a literal URL) → the entry points
                            and flows that reach it; incoming webhooks (entries of
                            kind webhook, routes whose path names a webhook, callback,
                            notify or ipn, integrations.webhooks globs of keylang.json);
                            queue publishers, consumers and pairs. --json: as JSON.
                            Exit 0; writes only the fact cache
  tour [--out f] [--json]   One page for a newcomer, a view (check does not read it), no
                            model: what the system is (README, manifest, layer READMEs),
                            layers and modules with size and coupling, business
                            processes → flows with descriptions and /diagrams links,
                            entry points by kind and events, integrations, blind spots
                            and logic in data, and the fns to read first. Markdown on
                            stdout; --out f: write it as a generated file (keylang/tour.md;
                            never a place check reads); --json: the same data as JSON.
                            Exit 0; 1 when f is a file someone wrote
  flows discover [--kind k] [--layer l] [--limit n] [--depth d] [--print] [--check]
                            A flow draft for every entry point (draft flow from its fn)
                            as the generated view <dir>/flows-discovered/<layer>.md,
                            which check does not read; a trigger a hand-written flow
                            already has is skipped and listed. --print: stdout only;
                            --check: writes nothing, 1 when the view is stale. Each
                            flow gets a description from its doc comments (no model)
  flows discover --names [--mode algo|llm|hybrid] [--stale] [--layer l] [--dry-run] [--limit n] [--jobs n]
                            Also group the flows into business processes with the
                            model, one request per layer group: name, description,
                            domain, entities, flows, as <dir>/flows-discovered/README.md
                            with provenance; a step's code change makes a process
                            stale (--stale: ask only for those). --dry-run: requests
                            and a token estimate, writes nothing; --limit: requests.
                            No model: hybrid (default) offline only, llm exit 2
  flows adopt <name> [--into <spec.md>]
                            Propose one discovered flow as a spec, with a provenance
                            comment, as .keylang/proposals/<dir>/flows/<name>.md (or the
                            --into target); merge it with m in the TUI
  flow export <name>… [--with-callees N] [--out <file.md>]
                            A portable bundle of business flows (hand-written, else
                            discovered) as one Markdown file: provenance (repo,
                            commit, snapshotId, keylang version), each node with its
                            kind, signature, doc and file:line, tests, events and
                            integrations, and an empty keylang-layout block; parse
                            reads it without a diagnostic. --with-callees: their
                            callees to depth N. Stdout, or --out (a new file or a
                            bundle, never under <dir>/)
  flow import <bundle.md> [--into <spec.md>] [--layer-map old=new,…] [--mode algo|llm|hybrid] [--print]
                            Propose a feature (<dir>/features/<first flow>.md) whose
                            flows step on planned nodes re-homed into this
                            repository's layers, with the original signatures, tests
                            and provenance, and the rows of <dir>/migration.md
                            (# migration <slug>). Layers: --layer-map, else algo (same
                            name, else the first layer), llm|hybrid: the model's map,
                            checked. --print: stdout only
  export c4 [--format plantuml|mermaid] [--level component|container] [--layer <name>] [--out f]
                            Print a C4 diagram of the map, no model: layers as boundaries,
                            their modules as components, packages as external systems
                            (--level container: the repository as one container;
                            --layer: one layer's components and what they touch;
                            --out: write f, relative to the root, only when it is new or
                            a diagram this command wrote; stdout stays empty)
  export bpmn <flow|process:<domain>|discovered:<name>> [--out f.bpmn]
                            BPMN 2.0 XML of the diagram /diagrams draws, with its BPMNDI:
                            lanes per layer, start events by trigger kind, tasks,
                            gateways, timers, packages as collapsed pools; keylang:id
                            and keylang:verdict on every element. --out: as export c4
  export drawio <view> [--out f.drawio]
                            The same diagram as a draw.io file (uncompressed mxGraph);
                            view: <flow>, discovered:<name>, process:<domain>,
                            entry:<id> or layers; cells carry keylang_id/keylang_kind
  import drawio <file> [--into <spec.md>] [--print]
                            A flow's draw.io drawing back as ONE proposal for its spec:
                            a changed ID or label rewrites its line, a new shape becomes
                            a step after the shape its edge leaves, an unknown shape a
                            note comment; an unchanged drawing proposes nothing.
                            --print: the change on stdout, nothing written
  diagram propose <view> --from <model.json> [--print]
                            The editor's drawing of a view (window.keylangEditor
                            .currentModel() of keylang web, as JSON) as proposals, one
                            per spec it changes: flows (steps, when, parallel, trigger
                            kinds, continues, emits, planned), rules from allow/deny
                            lines between lanes and the layers order; new lanes as
                            keylang.json layers, printed only. K108 of the proposed
                            text on stderr. --print: the changes on stdout, nothing
                            written
  check [paths…] [--changed] [--since <ref>] [--accept-weakening]
                            Resolve IDs and check rules (default: ./keylang)
                            Given files, it prints verdicts and the summary for those
                            files only (e.g. check keylang/flows/buy.md)
                            Rebuilds the analysis in memory; does not write the map
                            (only the fact cache .keylang/cache/, for the next run).
                            --changed reports only findings that touch files changed
                            since <ref> (default HEAD) plus untracked files, and K108
                            for the spec weakened since <ref> (keylang.json exclude,
                            assume, outside, layers, frameworks; a removed deny or
                            step, a new allow, rules outside rules.md, a wider
                            baseline). --accept-weakening: for a person, never an
                            agent: K108 is accepted, listed on stderr, exit not 1
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
  --dir <path>              clone, web <url>: where the clone goes
  --explain <mode>          clone, web <url>: map-only, map-and-ai or all
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
2 usage or I/O error. draft flow, draft rules, code-to-spec, spec-to-code: 1
when an input changed on disk while the proposal was prepared (nothing is
written; spec-to-code --apply too). hook stop: 0 once started; 2 only for a
bad invocation.
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
  names: { type: "boolean" },
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
  dir: { type: "string" },
  explain: { type: "string" },
  since: { type: "string" },
  agents: { type: "string" },
  changed: { type: "boolean" },
  "accept-weakening": { type: "boolean" },
  layer: { type: "string" },
  level: { type: "string" },
  kind: { type: "string" },
  depth: { type: "string" },
  "with-callees": { type: "string" },
  "layer-map": { type: "string" },
  entry: { type: "string" },
  "from-trace": { type: "string" },
  from: { type: "string" },
  run: { type: "string" },
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
    const { runTerminal } = await import("./tui/terminal.ts");
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
      return cmdHook(paths, values.check === true);
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
        acceptWeakening: values["accept-weakening"] === true,
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
    case "lsp": {
      const { serveLsp } = await import("./lsp.ts");
      return serveLsp();
    }
    case "doctor":
      return cmdDoctor();
    case "mcp": {
      // The MCP SDK loads only for this command.
      const { serveMcp } = await import("./mcp.ts");
      const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
      return serveMcp(findRoot(process.cwd()), pkg.version);
    }
    case "draft":
      return cmdDraft(paths, { mode: values.mode ?? "hybrid", modeGiven: values.mode !== undefined, name: values.name, into: values.into, print: values.print === true, fromTrace: values["from-trace"], run: values.run });
    case "proposals":
      return cmdProposals(paths);
    case "spec-to-code":
      return cmdSpecToCode(paths[0], { into: values.into, apply: values.apply === true, print: values.print === true, mode: values.mode ?? "algo" });
    case "code-to-spec":
      return cmdCodeToSpec(paths[0], { into: values.into, print: values.print === true, mode: values.mode ?? "hybrid", since: values.since });
    case "wire":
      return cmdWire(values.out ?? "keylang.gen.ts", values.check === true);
    case "trace-plan":
      return cmdTracePlan(paths[0], values.entry, values.name);
    case "entries":
      return cmdEntries(values.kind, values.json === true);
    case "coverage":
      return cmdCoverage(values.json === true);
    case "integrations":
      return cmdIntegrations(values.json === true);
    case "tour":
      return cmdTour(values.out, values.json === true);
    case "flows":
      return cmdFlows(paths, { kind: values.kind, layer: values.layer, limit: values.limit, depth: values.depth, into: values.into, print: values.print === true, check: values.check === true, names: values.names === true, mode: values.mode, dryRun: values["dry-run"] === true, jobs: values.jobs, stale: values.stale === true });
    case "flow":
      return cmdFlow(paths, { withCallees: values["with-callees"], out: values.out, into: values.into, layerMap: values["layer-map"], mode: values.mode, print: values.print === true });
    case "export":
      return cmdExport(paths, { format: values.format, level: values.level, layer: values.layer, out: values.out });
    case "import":
      return cmdImport(paths, { into: values.into, print: values.print === true });
    case "diagram":
      return cmdDiagram(paths, { from: values.from, print: values.print === true });
    case "clone":
      return (await prepareClone(paths[0], { dir: values.dir, explain: values.explain, dryRun: values["dry-run"] === true })).code;
    case "web": {
      if (paths[0] === undefined) return cmdWeb(findRoot(process.cwd()), values.port ?? "7070", values.host ?? "127.0.0.1");
      const clone = await prepareClone(paths[0], { dir: values.dir, explain: values.explain, dryRun: false });
      if (clone.code !== 0 || clone.root === null) return clone.code;
      return cmdWeb(clone.root, values.port ?? "7070", values.host ?? "127.0.0.1");
    }
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

async function cmdWeb(root: string, portText: string, host: string): Promise<number> {
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port > 65535) throw new Error(`web: --port must be a number from 0 to 65535, got \`${portText}\``);
  const { serveWeb } = await import("./tui/web.ts");
  const server = await serveWeb({ root, port, host });
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
    return cmdExplainBatch(findRoot(process.cwd()), opts.missing ? "missing" : "stale", opts);
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
async function cmdExplainBatch(root: string, batch: BriefBatch, opts: Pick<ExplainOptions, "llm" | "dryRun" | "limit" | "jobs">): Promise<number> {
  const limit = opts.limit === undefined ? undefined : positiveInteger("--limit", opts.limit);
  // No --jobs: the operation takes the agent's default (4, or 2 for an agent CLI).
  const jobs = opts.jobs === undefined ? undefined : positiveInteger("--jobs", opts.jobs);
  // The list and the dry run: a printer over the shared read-only plan.
  if (opts.dryRun || !opts.llm) return explainPlanPrinter({ kind: "explain-plan", root, list: "briefs", batch, ...(limit !== undefined ? { limit } : {}), ...(jobs !== undefined ? { jobs } : {}), estimate: opts.dryRun });
  // The batch: a printer over the shared operation; a progress line per node on stderr.
  const result = await runOperation(
    { kind: "explain-batch", root, batch, ...(limit !== undefined ? { limit } : {}), ...(jobs !== undefined ? { jobs } : {}) },
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

/**
 * `clone <source> [--dir D] [--explain MODE] [--dry-run]`, and the first half
 * of `web <source>`: the clone, then the existing printers of init
 * (`--agents=none`: a clone gets no harness files), the brief batch, the
 * layers' full explanations and the map, each over the clone's root.
 * `root` is null when nothing usable was made.
 */
async function prepareClone(sourceText: string | undefined, opts: { dir: string | undefined; explain: string | undefined; dryRun: boolean }): Promise<{ code: number; root: string | null }> {
  const mode: CloneExplain | undefined = opts.explain === undefined ? "map-only" : isCloneExplain(opts.explain) ? opts.explain : undefined;
  if (mode === undefined) throw new Error(`clone: --explain is one of ${CLONE_EXPLAIN_MODES.join(", ")}, got \`${opts.explain}\``);
  if (opts.dryRun && mode === "map-only") throw new Error("clone: --dry-run estimates the model's part; pass --explain map-and-ai or all");
  if (sourceText === undefined) throw new Error("clone: a repository URL or path is required");
  const source = parseRepoSource(sourceText, process.cwd());
  if ("error" in source) throw new Error(source.error);
  const dir = opts.dir !== undefined ? resolve(process.cwd(), opts.dir) : join(cloneCacheRoot(process.env, homedir()), ...source.key);
  const synced = syncClone(source, dir);
  process.stdout.write(`${synced.dir}: ${synced.action} from ${source.displayUrl}\n`);
  const initialized = await cmdInit(dir, { agents: "none", check: false });
  if (initialized !== 0) return { code: initialized, root: null };
  if (mode === "map-only") return { code: 0, root: dir };
  const layers = [...loadConfig(dir).layers.keys()];
  // The estimate leaves keylang.json as init wrote it.
  if (opts.dryRun) {
    const code = await cmdExplainBatch(dir, "missing", { llm: true, dryRun: true, limit: undefined, jobs: undefined });
    if (mode === "all") process.stdout.write(`and ${layers.length} full layer explanation(s): ${layers.join(", ")}\n`);
    return { code, root: dir };
  }
  // The clone's keylang.json is keylang's own, so the model comes from the environment; say so before touching it.
  if (selectedAgent(loadConfig(dir).agent) === null) {
    process.stderr.write(`keylang: clone --explain ${mode}: no model configured; set KEYLANG_AGENT (e.g. cli:claude or anthropic:<model>) or "use" in ~/.config/keylang/agents.json; the map above is built\n`);
    return { code: 2, root: null };
  }
  const problem = enableExplainedMap(dir);
  if (problem !== null) {
    // A clone whose keylang.json keylang may not write is no place for --explain; it is keylang's own
    // (fresh or marked), so it goes the way a clone with an unwritable marker does.
    rmSync(dir, { recursive: true, force: true });
    process.stderr.write(`keylang: clone: ${problem}; the clone of ${source.displayUrl} was removed\n`);
    return { code: 2, root: null };
  }
  let code = await cmdExplainBatch(dir, "missing", { llm: true, dryRun: false, limit: undefined, jobs: undefined });
  if (mode === "all") {
    for (const layer of layers) {
      const result = await runOperation({ kind: "explain-llm", root: dir, id: layer, detail: "full" });
      for (const message of result.messages) process.stderr.write(`keylang: ${layer}: ${message.text}\n`);
      const written = result.payload?.written ?? null;
      if (written !== null) process.stdout.write(`${toPosix(relative(process.cwd(), join(dir, written)))}: written\n`);
      else if (result.status !== "completed") code = 1;
    }
  }
  // The briefs are in; the explained map is rendered from them.
  const mapped = printMap(await runOperation({ kind: "map", root: dir, label: dir }), dir);
  return { code: mapped !== 0 ? mapped : code, root: dir };
}

function positiveInteger(flag: string, text: string): number {
  const problem = positiveIntegerProblem(flag, text);
  if (problem !== null) throw new Error(problem);
  return Number(text);
}

async function cmdDraft(args: string[], opts: { mode: string; modeGiven: boolean; name: string | undefined; into: string | undefined; print: boolean; fromTrace: string | undefined; run: string | undefined }): Promise<number> {
  const [what, trigger] = args;
  if ((opts.fromTrace !== undefined || opts.run !== undefined) && what !== "flow") throw new Error("draft: --from-trace and --run go with `draft flow`");
  if (what === "rules" || what === "map") return cmdDraftLayout(what, opts);
  if (what !== "flow") throw new Error("draft: expected `draft flow <trigger>`, `draft rules` or `draft map`");
  if (opts.run !== undefined && opts.fromTrace === undefined) throw new Error("draft flow: --run goes with --from-trace <file.jsonl>");
  if (opts.fromTrace !== undefined) {
    // The steps are what the run observed: a trigger or a model would draft something else.
    if (trigger) throw new Error("draft flow: give a trigger or --from-trace <file.jsonl>, not both");
    if (opts.modeGiven) throw new Error("draft flow: --from-trace drafts what the run observed; --mode does not apply");
    if (opts.fromTrace === "") throw new Error("draft flow: --from-trace needs a JSONL file");
    const root = findRoot(process.cwd());
    const file = toPosix(relative(root, resolve(process.cwd(), opts.fromTrace)));
    return draftFlowPrinter(root, "", "algo", { ...opts, fromTrace: { file, ...(opts.run !== undefined ? { run: opts.run } : {}) } });
  }
  if (!trigger) throw new Error("draft flow: a trigger id is required");
  if (opts.mode !== "algo" && opts.mode !== "llm" && opts.mode !== "hybrid") throw new Error(`draft: --mode must be algo, llm or hybrid, got \`${opts.mode}\``);
  return draftFlowPrinter(findRoot(process.cwd()), trigger, opts.mode, { ...opts, fromTrace: undefined });
}

/**
 * `draft flow <trigger> --mode algo|llm|hybrid` and `draft flow --from-trace
 * <file> [--run <id>]`: a printer over the shared `draft-flow` operation. The proposal replaces one already waiting, as the
 * CLI always did. On stderr: the fallback of a hybrid without a model, IDs
 * the model left unknown, lines it dropped, a stats file not updated.
 */
async function draftFlowPrinter(root: string, trigger: string, mode: "algo" | "llm" | "hybrid", opts: { name: string | undefined; into: string | undefined; print: boolean; fromTrace: { file: string; run?: string } | undefined }): Promise<number> {
  const result = await runOperation({
    kind: "draft-flow",
    root,
    trigger,
    mode,
    ...(opts.fromTrace !== undefined ? { fromTrace: opts.fromTrace } : {}),
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
 * stays, as it always did. The operation's code is the CLI's: a file or an
 * input changed meanwhile (while the model answered too) is 1 with nothing
 * written, as a refused proposal is; a file no write may change and an I/O
 * error are 2; part way, the error is followed by what was written and what
 * was not.
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
  return applied.exitCode ?? 2;
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
/**
 * `keylang export c4` (c4-zoom/12): the diagram on stdout, or written to
 * `--out` with a note on stderr and nothing on stdout. Exit code 0 or 2.
 */
async function cmdExport(args: readonly string[], options: { format: string | undefined; level: string | undefined; layer: string | undefined; out: string | undefined }): Promise<number> {
  const [what, ...rest] = args;
  if (what === "bpmn" || what === "drawio") {
    if (rest.length !== 1) throw new Error(`export ${what}: ${rest.length === 0 ? "a view is required: a flow name, discovered:<name> or process:<domain>" : `unexpected argument \`${rest[1]}\``}`);
    const { runDiagramExport } = await import("./operations/diagram-export.ts");
    const result = await runDiagramExport({ root: findRoot(process.cwd()), format: what, view: rest[0]!, ...(options.out !== undefined ? { out: toPosix(options.out) } : {}) });
    if (result.error !== null) process.stderr.write(`keylang: ${result.error}\n`);
    else if (result.out !== null) process.stderr.write(`${result.out}: written\n`);
    else if (result.text !== null) process.stdout.write(result.text);
    return result.exitCode;
  }
  if (what !== "c4") throw new Error("export: expected `c4`, `bpmn` or `drawio`; see --help");
  if (rest.length > 0) throw new Error(`export c4: unexpected argument \`${rest[0]}\``);
  const result = await runOperation({
    kind: "export-c4",
    root: findRoot(process.cwd()),
    format: options.format ?? "plantuml",
    level: options.level ?? "component",
    ...(options.layer !== undefined ? { layer: options.layer } : {}),
    ...(options.out !== undefined ? { out: toPosix(options.out) } : {}),
  });
  for (const message of result.messages) process.stderr.write(message.level === "error" ? `keylang: ${message.text}\n` : `${message.text}\n`);
  if (result.exitCode === 0 && result.payload !== null && result.payload.out === null) process.stdout.write(result.payload.text);
  return result.exitCode ?? 2;
}

/**
 * `keylang diagram propose <view> --from <model.json> [--print]`
 * (business-flows/24): the editor's drawing as proposals, the operation
 * `POST /api/diagram-proposal` runs. Stdout: the changes with `--print`;
 * stderr: each proposal, the K108 warnings, keylang.json with new layers
 * (printed only) and what the drawing says that keylang cannot write.
 * 0 proposed, printed or nothing to propose; 1 a proposal waiting, a refused
 * write or specs changed since the drawing (`specHash`); 2 a bad invocation.
 */
async function cmdDiagram(args: readonly string[], options: { from: string | undefined; print: boolean }): Promise<number> {
  const [what, view, ...rest] = args;
  if (what !== "propose") throw new Error("diagram: expected `diagram propose <view> --from <model.json>`; see --help");
  if (view === undefined) throw new Error("diagram propose: a view is required: flow:<name>, layers, entry:<id>, discovered:<name>, process:<domain>");
  if (rest.length > 0) throw new Error(`diagram propose: unexpected argument \`${rest[0]}\``);
  if (options.from === undefined) throw new Error("diagram propose: --from <model.json> is required (window.keylangEditor.currentModel() as JSON)");
  let model: unknown;
  try {
    model = JSON.parse(readFileSync(resolve(process.cwd(), options.from), "utf8"));
  } catch (error) {
    throw new Error(`diagram propose: --from ${options.from}: ${error instanceof Error ? error.message : String(error)}`);
  }
  // A saved request of the page (`{model, specHash}`) or the model alone.
  const wrapped = model !== null && typeof model === "object" && "model" in model ? (model as { model: unknown; specHash?: unknown }) : null;
  const { runDiagramPropose } = await import("./operations/diagram-propose.ts");
  const result = await runDiagramPropose({
    root: findRoot(process.cwd()),
    view: view === "empty" ? "" : view,
    model: wrapped ? wrapped.model : model,
    specHash: wrapped && typeof wrapped.specHash === "string" ? wrapped.specHash : null,
    print: options.print,
  });
  if (result.error !== null) process.stderr.write(`keylang: ${result.error}\n`);
  for (const target of result.targets) {
    if (options.print) process.stdout.write(`${target.target}${target.newFile ? " (new file)" : ""}\n${target.diff}\n`);
    else if (target.proposal !== null) process.stderr.write(`${target.proposal}: proposed for ${target.target} (${target.hunks.length} hunk${target.hunks.length === 1 ? "" : "s"})\n`);
  }
  for (const weakening of result.weakenings) process.stderr.write(`${weakening.file}:${weakening.line}:${weakening.col}: ${weakening.message}\n`);
  if (result.config !== null) process.stderr.write(`${result.config.note}:\n${result.config.diff}\n`);
  for (const note of result.notes) process.stderr.write(`${note}\n`);
  if (result.merge !== null) process.stderr.write(`${result.merge}\n`);
  return result.exitCode;
}

/**
 * `keylang import drawio <file>` (business-flows/28): one proposal for the
 * flow the drawing draws; `--print` puts the change on stdout. Notes and
 * refusals to stderr. 0 proposed or nothing to propose, 1 a proposal already
 * waiting or a refused write, 2 a bad invocation, file or target.
 */
async function cmdImport(args: readonly string[], options: { into: string | undefined; print: boolean }): Promise<number> {
  const [what, file, ...rest] = args;
  if (what !== "drawio") throw new Error("import: expected `drawio`; see --help");
  if (file === undefined) throw new Error("import drawio: a .drawio file is required");
  if (rest.length > 0) throw new Error(`import drawio: unexpected argument \`${rest[0]}\``);
  const { runImportDrawio } = await import("./operations/diagram-export.ts");
  const result = await runImportDrawio({ root: findRoot(process.cwd()), file: resolve(process.cwd(), file), ...(options.into !== undefined ? { into: toPosix(options.into) } : {}), print: options.print });
  if (options.print && result.diff !== null) process.stdout.write(`${result.diff}\n`);
  for (const message of result.messages) process.stderr.write(message.level === "error" ? `keylang: ${message.text}\n` : `${message.text}\n`);
  return result.exitCode;
}

/**
 * `proposals [show|accept|reject <target>]`: a person takes or drops a
 * proposal without the TUI. A printer over `src/proposals.ts`: the list, a
 * diff and what was written to stdout; notes and refusals to stderr. 0 done;
 * 1 nothing pending for the target, or an accept refused (nothing written);
 * 2 a bad invocation, a broken keylang.json or an I/O error.
 */
async function cmdProposals(args: readonly string[]): Promise<number> {
  const { acceptProposal, listProposals, proposalDiff, proposalTarget, PROPOSALS_DIR, rejectProposal } = await import("./proposals.ts");
  const [action, name, ...rest] = args;
  if (action !== undefined && action !== "show" && action !== "accept" && action !== "reject") throw new Error(`proposals: unknown \`${action}\`; expected show, accept or reject <target>`);
  if (action !== undefined && name === undefined) throw new Error(`proposals ${action}: a target is required, as \`keylang proposals\` lists it`);
  if (rest.length > 0) throw new Error(`proposals ${action}: unexpected \`${rest[0]}\`; one target at a time`);
  const root = findRoot(process.cwd());
  const specDir = toPosix(relative(root, resolve(root, loadConfig(root).dir)));
  if (action === undefined) {
    const pending = listProposals(root, specDir);
    for (const item of pending) {
      const what = item.problem !== null ? `cannot be accepted: ${item.problem}` : `+${item.added} -${item.removed}${item.newFile ? " (new file)" : ""}`;
      process.stdout.write(`${item.target}: ${what}\n`);
    }
    process.stderr.write(pending.length === 0 ? `no proposals under ${PROPOSALS_DIR}/\n` : `${pending.length} proposal(s); \`keylang proposals show <target>\` prints one; a person accepts or rejects it\n`);
    return 0;
  }
  const target = proposalTarget(name!);
  if (target === null) throw new Error(`proposals ${action}: \`${name}\` is not a plain relative path`);
  const store = `${PROPOSALS_DIR}/${target}`;
  const none = (): number => {
    process.stderr.write(`keylang: no proposal for ${target} under ${PROPOSALS_DIR}/\n`);
    return 1;
  };
  const refused = (reason: string, written: string): number => {
    process.stderr.write(`keylang: ${target}: cannot be accepted: ${reason}; ${written}\n`);
    return 1;
  };
  if (action === "show") {
    const diff = proposalDiff(root, specDir, target);
    if (diff.state === "none") return none();
    if (diff.state === "refused") return refused(diff.reason, "`keylang proposals reject` drops it");
    process.stdout.write(diff.text);
    return 0;
  }
  if (action === "reject") {
    const result = rejectProposal(root, specDir, target);
    if (result.state === "none") return none();
    if (result.state === "refused") {
      process.stderr.write(`keylang: ${result.reason}; nothing removed\n`);
      return 1;
    }
    process.stdout.write(`${store}: removed; ${target} is unchanged\n`);
    return 0;
  }
  const result = acceptProposal(root, specDir, target);
  if (result.state === "none") return none();
  if (result.state === "refused") return refused(result.reason, "nothing written");
  if (result.state === "unchanged") process.stdout.write(`${target}: the proposal matches the file; nothing written${result.kept === null ? ", the proposal is removed" : ""}\n`);
  else process.stdout.write(`${target}: written from ${store} (+${result.added} -${result.removed})${result.kept === null ? "; the proposal is removed" : ""}\n`);
  if (result.kept !== null) process.stderr.write(`keylang: ${result.kept}\n`);
  return 0;
}

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

/** What is set up. A problem it finds (a key file others can read, a native module without its binary) is a line of the report, not a failure: cli.md, code 0. The CLI is a printer over the shared doctor operation. */
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
async function cmdTracePlan(flow: string | undefined, entry: string | undefined, name: string | undefined): Promise<number> {
  if (entry !== undefined && flow !== undefined) throw new Error("trace-plan: give a flow or --entry <id>, not both");
  if (entry === undefined && name !== undefined) throw new Error("trace-plan: --name goes with --entry");
  if (entry === undefined && !flow) throw new Error("trace-plan: a flow name is required");
  const result = await runOperation({ kind: "trace-plan", root: findRoot(process.cwd()), flow: entry === undefined ? flow! : (name ?? ""), ...(entry !== undefined ? { entry } : {}) });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "trace-plan failed");
  process.stdout.write(result.payload.text);
  return result.exitCode ?? 2;
}

/** `entries [--kind k] [--json]`: the table of the shared operation, or its payload as JSON; exit 0 with an empty list too. */
async function cmdEntries(kind: string | undefined, json: boolean): Promise<number> {
  if (kind !== undefined && !isEntryKind(kind)) throw new Error(`entries: --kind is one of ${ENTRY_KINDS.join(", ")}, got \`${kind}\``);
  const result = await runOperation({ kind: "entries", root: findRoot(process.cwd()), ...(kind !== undefined ? { only: kind } : {}) });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "entries failed");
  process.stdout.write(json ? `${JSON.stringify({ snapshotId: result.payload.snapshotId, kind: result.payload.kind, entries: result.payload.entries }, null, 2)}\n` : result.payload.text);
  return result.exitCode ?? 2;
}

/** `coverage [--json]`: the report of the shared operation, or its payload without the text as JSON; exit 0 with holes and orphans too. */
async function cmdCoverage(json: boolean): Promise<number> {
  const result = await runOperation({ kind: "coverage", root: findRoot(process.cwd()) });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "coverage failed");
  const { text, ...report } = result.payload;
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : text);
  return 0;
}

/** `integrations [--json]`: the inventory of the shared operation, or its payload without the text as JSON; exit 0. */
async function cmdIntegrations(json: boolean): Promise<number> {
  const result = await runOperation({ kind: "integrations", root: findRoot(process.cwd()) });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "integrations failed");
  const { text, ...report } = result.payload;
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : text);
  return 0;
}

/** `tour [--out f] [--json]`: the page on stdout, its data as JSON, or the page written to `f` (named on stderr). */
async function cmdTour(out: string | undefined, json: boolean): Promise<number> {
  const result = await runOperation({ kind: "tour", root: findRoot(process.cwd()), ...(out !== undefined ? { out } : {}) });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "tour failed");
  const { text, out: _written, ...tour } = result.payload;
  if (out !== undefined) for (const m of result.messages) process.stderr.write(`keylang: ${m.text}\n`);
  if (json) process.stdout.write(`${JSON.stringify(tour, null, 2)}\n`);
  else if (out === undefined) process.stdout.write(text);
  return result.exitCode ?? 2;
}

/**
 * `flows discover|adopt`: the shared operations. Discover prints the view
 * (`--print`) or what it wrote, the skipped triggers and the summary on
 * stderr; adopt names the proposal on stderr.
 */
async function cmdFlows(
  args: readonly string[],
  opts: { kind: string | undefined; layer: string | undefined; limit: string | undefined; depth: string | undefined; into: string | undefined; print: boolean; check: boolean; names: boolean; mode: string | undefined; dryRun: boolean; jobs: string | undefined; stale: boolean },
): Promise<number> {
  const [action, name, ...rest] = args;
  if (action !== "discover" && action !== "adopt") throw new Error(`flows: expected discover or adopt${action === undefined ? "" : `, got \`${action}\``}`);
  const depth = opts.depth === undefined ? undefined : wholeNumber("--depth", opts.depth, 0);
  const root = findRoot(process.cwd());
  const report = (messages: readonly { level: string; text: string }[]): void => {
    for (const m of messages) process.stderr.write(`keylang: ${m.text}\n`);
  };
  if (action === "adopt") {
    if (name === undefined) throw new Error("flows adopt: a discovered flow's name is required");
    if (rest.length > 0) throw new Error(`flows adopt: unexpected \`${rest[0]}\`; one flow at a time`);
    const result = await runOperation({ kind: "flows-adopt", root, name, ...(opts.into !== undefined ? { into: opts.into } : {}), ...(depth !== undefined ? { depth } : {}) });
    report(result.messages);
    return result.exitCode ?? 2;
  }
  if (name !== undefined) throw new Error(`flows discover: unexpected \`${name}\``);
  if (opts.print && opts.check) throw new Error("flows discover: --print and --check do not go together");
  if (opts.kind !== undefined && !isEntryKind(opts.kind)) throw new Error(`flows discover: --kind is one of ${ENTRY_KINDS.join(", ")}, got \`${opts.kind}\``);
  if (opts.names) return cmdFlowsNames(root, opts, depth);
  if (opts.mode !== undefined || opts.dryRun || opts.jobs !== undefined || opts.stale) throw new Error("flows discover: --mode, --dry-run, --jobs and --stale need --names");
  const limit = opts.limit === undefined ? undefined : wholeNumber("--limit", opts.limit, 1);
  const result = await runOperation({
    kind: "flows-discover",
    root,
    output: opts.print ? "print" : opts.check ? "check" : "write",
    ...(opts.kind !== undefined ? { only: opts.kind } : {}),
    ...(opts.layer !== undefined ? { layer: opts.layer } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(depth !== undefined ? { depth } : {}),
  });
  if (opts.print && result.payload !== null) process.stdout.write(result.payload.files.map((file) => file.text).join("\n"));
  report(result.messages);
  return result.exitCode ?? 2;
}

/**
 * `flows discover --names [--mode algo|llm|hybrid] [--stale] [--layer l]
 * [--dry-run] [--limit N] [--jobs N]`: the view, then business processes from
 * the model, one request per layer group. `--dry-run` prints the plan and
 * writes nothing; `--limit` bounds the requests.
 */
async function cmdFlowsNames(root: string, opts: { kind: string | undefined; layer: string | undefined; limit: string | undefined; print: boolean; check: boolean; mode: string | undefined; dryRun: boolean; jobs: string | undefined; stale: boolean }, depth: number | undefined): Promise<number> {
  if (opts.print || opts.check) throw new Error("flows discover: --names writes the view; it takes no --print or --check (--dry-run writes nothing)");
  if (opts.kind !== undefined) throw new Error("flows discover: --names groups the flows of whole layers; it takes no --kind");
  const mode = opts.mode ?? "hybrid";
  if (!isNameMode(mode)) throw new Error(`flows discover: --mode is one of ${NAME_MODES.join(", ")}, got \`${mode}\``);
  const limit = opts.limit === undefined ? undefined : positiveInteger("--limit", opts.limit);
  const jobs = opts.jobs === undefined ? undefined : positiveInteger("--jobs", opts.jobs);
  const result = await runOperation(
    {
      kind: "flows-discover",
      root,
      output: "write",
      ...(opts.layer !== undefined ? { layer: opts.layer } : {}),
      ...(depth !== undefined ? { depth } : {}),
      names: { mode, dryRun: opts.dryRun, stale: opts.stale, ...(limit !== undefined ? { limit } : {}), ...(jobs !== undefined ? { jobs } : {}) },
    },
    { onProgress: ({ text }) => process.stderr.write(`keylang: ${text}\n`) },
  );
  if (opts.dryRun && result.payload?.names) process.stdout.write(result.payload.names.text);
  for (const m of result.messages) process.stderr.write(`keylang: ${m.text}\n`);
  return result.exitCode ?? 2;
}

/**
 * `flow export <name>… [--with-callees N] [--out f]` and `flow import
 * <bundle.md> [--into] [--layer-map] [--mode] [--print]`: the shared
 * operations. Export prints the bundle (or names the file written on
 * stderr); import prints the proposed texts with `--print`, else names the
 * proposals; notes on stderr.
 */
async function cmdFlow(args: readonly string[], opts: { withCallees: string | undefined; out: string | undefined; into: string | undefined; layerMap: string | undefined; mode: string | undefined; print: boolean }): Promise<number> {
  const [action, ...rest] = args;
  if (action !== "export" && action !== "import") throw new Error(`flow: expected export or import${action === undefined ? "" : `, got \`${action}\``}`);
  const root = findRoot(process.cwd());
  const report = (messages: readonly { level: string; text: string }[]): void => {
    for (const m of messages) process.stderr.write(`keylang: ${m.text}\n`);
  };
  if (action === "export") {
    if (rest.length === 0) throw new Error("flow export: at least one flow name is required");
    if (opts.into !== undefined || opts.layerMap !== undefined || opts.mode !== undefined || opts.print) throw new Error("flow export: --into, --layer-map, --mode and --print belong to flow import");
    const withCallees = opts.withCallees === undefined ? undefined : wholeNumber("--with-callees", opts.withCallees, 0);
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    const result = await runOperation({ kind: "flow-export", root, names: rest, version: pkg.version, ...(withCallees !== undefined ? { withCallees } : {}), ...(opts.out !== undefined ? { out: resolve(process.cwd(), opts.out) } : {}) });
    if (result.payload !== null && opts.out === undefined) process.stdout.write(result.payload.text);
    report(result.messages);
    return result.exitCode ?? 2;
  }
  const [bundle, extra] = rest;
  if (bundle === undefined) throw new Error("flow import: a bundle file is required");
  if (extra !== undefined) throw new Error(`flow import: unexpected \`${extra}\`; one bundle at a time`);
  if (opts.withCallees !== undefined || opts.out !== undefined) throw new Error("flow import: --with-callees and --out belong to flow export");
  const mode = opts.mode ?? "algo";
  if (mode !== "algo" && mode !== "llm" && mode !== "hybrid") throw new Error(`flow import: --mode must be algo, llm or hybrid, got \`${mode}\``);
  const result = await runOperation({
    kind: "flow-import",
    root,
    bundle: resolve(process.cwd(), bundle),
    mode,
    output: opts.print ? "preview" : "proposal",
    ...(opts.into !== undefined ? { into: toPosix(opts.into) } : {}),
    ...(opts.layerMap !== undefined ? { layerMap: opts.layerMap } : {}),
  });
  if (opts.print && result.payload !== null) process.stdout.write(`${result.payload.feature}\n<!-- ${result.payload.migrationTarget} -->\n\n${result.payload.migration}`);
  report(result.messages);
  return result.exitCode ?? 2;
}

/** A whole number flag at least `min`; anything else is a usage error. */
function wholeNumber(flag: string, text: string, min: number): number {
  const n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(n) || n < min) throw new Error(`${flag} must be a whole number of at least ${min}, got \`${text}\``);
  return n;
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
    if (payload.gitignore) printGitignore(payload.gitignore);
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
  if (payload.gitignore) printGitignore(payload.gitignore);
  if (payload.map) printMap(payload.map, root);
  if (payload.baseline) printBaseline(payload.baseline);
  if (payload.agents) printAgents(payload.agents);
  // Auto found no harness: only the AGENTS.md block was written, and a person would not learn what else there is.
  const agents = payload.agents?.payload;
  if (payload.agents?.status === "completed" && agents?.choice === "auto" && agents.harnesses.length === 0) {
    process.stderr.write(
      "keylang: no harness detected (.claude/, .codex/, .cursor/, opencode.json), so only the AGENTS.md block was written; for MCP, the skill, deny rules and the Stop hook run `keylang agents --agents=claude,codex,cursor,opencode` with the ones you use\n",
    );
  }
  return result.exitCode ?? 2;
}

/** The `.gitignore` line of init: an I/O error to stderr; added, not listed, or a refusal's reason to stdout, as the file lines of the other stages. */
function printGitignore(stage: GitignoreStage): void {
  const line = gitignoreMessage(stage);
  if (line === null) return;
  if (stage.error !== null) process.stderr.write(`keylang: ${line.text}\n`);
  else process.stdout.write(`${line.text}\n`);
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
  else for (const line of [...report.gaps.map(gapLine), ...report.hints.map(hintLine)]) process.stdout.write(`${line}\n`);
  process.stderr.write(`${featureSummary(report)}\n`);
  return result.exitCode ?? 2;
}

/** `hook stop` and `hook install [--check]`. A missing or unknown subcommand and an extra argument are a bad invocation (2). */
async function cmdHook(args: readonly string[], checkOnly: boolean): Promise<number> {
  const [name, ...rest] = args;
  if (name !== "stop" && name !== "install") throw new Error(`hook: expected \`stop\` or \`install\`${name === undefined ? "" : `, got \`${name}\``}`);
  if (rest.length > 0) throw new Error(`hook ${name}: unexpected argument \`${rest[0]}\``);
  if (name === "install") return cmdHookInstall(checkOnly);
  return cmdHookStop();
}

/**
 * `hook stop`: once the invocation is valid, exactly one JSON object on
 * stdout and code 0. A harness reads code 2 of a Stop hook as a blocking
 * error the agent cannot act on, so a failure — stdin that is not a JSON
 * event, git missing or refused, a broken keylang.json, an analysis error —
 * is a `systemMessage` the harness shows the person, and the same line on stderr.
 */
async function cmdHookStop(): Promise<number> {
  let decision: string;
  try {
    decision = await stopDecision(await readStdin(), process.cwd());
  } catch (error) {
    const unchecked = uncheckedTurn(error instanceof Error ? error.message : String(error));
    process.stderr.write(`${unchecked.line}\n`);
    decision = unchecked.decision;
  }
  process.stdout.write(decision);
  return 0;
}

/** The Stop decision for the event on stdin: the fails of `check --changed` in `cwd`'s repository. Throws when the turn cannot be checked. */
async function stopDecision(input: string, cwd: string): Promise<string> {
  const event = parseHookEvent(input);
  if (event.stop_hook_active === true) return hookDecision(event, []);
  const root = findRoot(cwd);
  // The next turn's hook parses only what changed: the fact cache is saved best-effort.
  const analyzed = await analyze({ root, saveFacts: true });
  const gitChanged = gitChangedFiles(root, "HEAD", "hook stop");
  const changed = changedPathSet(root, gitChanged.paths, cwd);
  const filtered = filterChanged(
    { docs: analyzed.docs, spec: analyzed.spec, diagnostics: analyzed.diagnostics, verdicts: analyzed.verdicts, nodes: analyzed.snapshot?.nodes ?? {}, edges: analyzed.snapshot?.edges ?? [] },
    changed,
    deletedModuleIds(analyzed.config, gitChanged.deleted),
  );
  // A spec weakened in this turn blocks like a rule fail: the rule an agent switched off is still the person's.
  const weakened = readWeakenings(analyzed.config, "HEAD", "hook stop").weakenings.map((item) => ({ file: item.file, line: item.line, text: `K108 ${item.message}` }));
  return hookDecision(event, [...weakened, ...hookFails(filtered)]);
}

/**
 * `hook install [--check]`: keylang's pre-commit hook in git's hooks
 * directory. A hook without keylang's marker is someone else's: install
 * refuses with 2 and names the line to add; --check counts it as not installed.
 */
async function cmdHookInstall(checkOnly: boolean): Promise<number> {
  const { gitHooksDir, gitTopLevel, preCommitCommand, preCommitState, preCommitText } = await import("./git-hook.ts");
  const version = packageVersion();
  const cwd = process.cwd();
  const top = gitTopLevel(cwd);
  const file = join(gitHooksDir(cwd), "pre-commit");
  const shown = toPosix(relative(cwd, file));
  // The hook is bound to the keylang root around `cwd`: git runs it from the top level, which may hold no `keylang.json`.
  const root = findRoot(cwd);
  const subdir = existsSync(join(root, CONFIG_FILE)) ? toPosix(relative(top, root)) : "";
  if (subdir.startsWith("..") || isAbsolute(subdir)) throw new Error(`hook install: the keylang root ${root} is outside the git work tree ${top}`);
  const where = subdir === "" ? "" : ` in ${subdir}`;
  const entry = existsSync(file) ? statSync(file) : null;
  if (entry !== null && !entry.isFile()) throw new Error(`hook install: ${shown}: not a file`);
  const current = entry === null ? null : readFileSync(file, "utf8");
  const state = preCommitState(current, entry !== null && (entry.mode & 0o111) !== 0, version, subdir);
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
    writeAtomic(file, preCommitText(version, subdir), { exact: true });
    chmodSync(file, 0o755);
  }
  process.stdout.write(`${shown}: ${state === "current" ? "up to date" : "written"}; runs \`${preCommitCommand(version)}\`${where}\n`);
  return 0;
}

/** `new flow <name>`, `new module <name> --layer <layer>`: a skeleton spec, never over an existing file. */
async function cmdNew(args: readonly string[], layer: string | undefined): Promise<number> {
  const { defaultSpecPath, flowNameProblem, newSpecProblem, specTemplate } = await import("./tui/new-spec.ts");
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
async function cmdCompletions(shell: string | undefined): Promise<number> {
  const { SHELLS, completionScript, helpCommands, isShell } = await import("./completions.ts");
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
  // A failure before the plan was checked (the map directory could not be read): only the messages name it.
  if (result.status === "failed" && payload.refused.length === 0 && payload.steps.length === 0) {
    for (const message of result.messages) if (message.level === "error") process.stderr.write(`keylang: ${message.text}\n`);
  }
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
 * and nothing else; the notes on skipped explanations, each file it could not
 * read (code 2) and the diagnostics to stderr.
 */
async function cmdParse(paths: string[], json: boolean): Promise<number> {
  const cwd = process.cwd();
  const result = await runOperation({ kind: "parse", root: findRoot(cwd), base: cwd, paths, format: json ? "json" : "tree" });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "parse failed");
  const { payload } = result;
  for (const file of payload.skipped) process.stderr.write(`keylang: note: ${file}: a saved explanation, not keylang Markdown; skipped\n`);
  for (const file of payload.unreadable) {
    const why = result.messages.find((message) => message.level === "error" && message.text.startsWith(`${file}: cannot read: `));
    process.stderr.write(`keylang: ${why?.text ?? `${file}: cannot read`}\n`);
  }
  process.stdout.write(payload.text);
  for (const d of payload.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
  return result.exitCode ?? 2;
}

async function cmdCheck(paths: string[], opts: { strict: boolean; format: string; explain: boolean; static: string | undefined; changed: boolean; since: string | undefined; stale: boolean; accept: boolean; acceptWeakening?: boolean }): Promise<number> {
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
  if (opts.acceptWeakening === true && !opts.changed) throw new Error("check: --accept-weakening requires --changed");
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
    ...(opts.acceptWeakening === true ? { acceptWeakening: true } : {}),
  });
  if (result.payload === null) throw new Error(result.messages[0]?.text ?? "check failed");
  const { payload } = result;
  for (const path of payload.notSpecs) process.stderr.write(`keylang: ${checkSkipNote(path)}\n`);
  if (payload.changed?.weakening.note) process.stderr.write(`keylang: note: ${payload.changed.weakening.note}\n`);
  for (const line of payload.changed?.weakening.accepted ?? []) process.stderr.write(`keylang: accepted (--accept-weakening): ${line}\n`);
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
  const { runStaleCheck, staleLine, staleSummary } = await import("./stale.ts");
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
 * stderr for diagnostics and failures and a note per generated file it
 * leaves; a saved explanation passes silently.
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
  for (const file of result.payload.files) if (file.state === "generated") process.stderr.write(`keylang: note: ${fmtGeneratedNote(file)}\n`);
  return result.exitCode ?? 2;
}

