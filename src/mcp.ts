// `keylang mcp`: the analysis for external agents over MCP (stdio), design
// §7.3. The graph by default, code on request: `search`, `node`, `code`,
// `flows`, `check` (the same results as `check --format json`), `explain`
// (a saved explanation or the offline summary) and `apply_diff`, which only
// writes a proposal a person merges. Every call answers for the current
// inputs (`currentAnalysis`), so an answer never describes code that changed
// since; the local fact cache follows the snapshot, best-effort, as for
// `check`. No spec is written. stdout carries the protocol only.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import { contextForIds } from "./agent-context.ts";
import { analyze, specPathProblem, within, type Analysis } from "./analyze.ts";
import { checkResults } from "./check-results.ts";
import { keepsFactCache, saveFactCache } from "./fact-cache.ts";
import { idsIn } from "./feature-status.ts";
import { runOperation } from "./operations.ts";
import { specToCode } from "./spec-to-code.ts";
import { CONFIG_FILE, evidenceFiles, loadConfig, specPath, toPosix } from "./config.ts";
import { isStale, readExplanation } from "./explain-llm.ts";
import { summarizeNode } from "./explain-node.ts";
import { explanationOf, loadBriefs, type NodeExplanation } from "./explanations.ts";
import { errorText } from "./diag.ts";
import { collectMdFiles, existingText } from "./files.ts";
import { sectionNodes, walk } from "./ir.ts";
import { generateMap } from "./map.ts";
import { searchNodes } from "./node-search.ts";
import { lineDiff, PROPOSALS_DIR, proposalProblem, writeProposal } from "./proposals.ts";
import { ENTRY_KINDS } from "./snapshot.ts";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const json = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failure = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/**
 * The analysis of the current inputs, cheaper than a new `analyze()` per
 * call. The snapshot is rebuilt every time: its id hashes all the graph
 * depends on (sources, configuration, the files import resolution read).
 * The rest of the analysis (specs, the rendered map, evidence, verdicts) is
 * reused while the snapshot id, keylang.json, the specs and the evidence
 * files are those of the last call. Each part of the key is read before the
 * analysis reads it, so a change in between only costs a rebuild next time.
 * The fact cache is saved best-effort whenever the facts differ from it, so
 * the next process (a Stop hook, `check`) parses only what changed.
 */
export function currentAnalysis(root: string): () => Promise<Analysis> {
  let last: { key: string; analysis: Analysis } | null = null;
  return async () => {
    const configFile = join(root, CONFIG_FILE);
    const raw = existingText(configFile);
    const config = loadConfig(root);
    const map = config.languages.length > 0 ? await generateMap(config, keepsFactCache(root) ? { persist: "changed" } : {}) : null;
    if (map?.factCache) saveFactCache(root, map.factCache);
    const specDir = join(root, config.dir);
    const specs = existsSync(specDir) ? collectMdFiles([specDir]) : [];
    const evidence = [...(evidenceFiles(config, "tests") ?? []), ...(evidenceFiles(config, "trace") ?? [])].map((file) => join(root, file));
    const digest = (file: string): string => `${file}\u0000${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
    const key = JSON.stringify([raw, map?.index.snapshotId ?? null, specs.map(digest), evidence.map(digest)]);
    if (last?.key === key) return last.analysis;
    const analysis = await analyze({ root, ...(map ? { generate: () => Promise.resolve(map) } : {}) });
    last = { key, analysis };
    return analysis;
  };
}

/** A node's explanation for an agent: its text, where it comes from, and for a model's brief the model, the date and whether the code changed since. */
function explanationJson(e: NodeExplanation | null): { text: string; origin: "doc" | "llm"; stale: boolean; agent?: string; date?: string } | null {
  if (e === null) return null;
  return { text: e.text, origin: e.origin, stale: e.stale, ...(e.agent !== undefined ? { agent: e.agent } : {}), ...(e.date !== undefined ? { date: e.date } : {}) };
}

export function mcpServer(root: string, version: string): McpServer {
  const server = new McpServer({ name: "keylang", version });
  const fresh = currentAnalysis(root);

  server.registerTool(
    "search",
    {
      description:
        "Find IDs of the architecture map (layers, modules, classes, fns, types, planned) whose ID contains the query, then those whose explanation contains it (the doc comment in the code, or a saved model brief), case-insensitive. Each hit has its explanation with origin (`doc` or `llm`) and whether it is stale. Start here to get IDs for the other tools.",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ query, limit }) => {
      const analysis = await fresh();
      const hits = searchNodes(analysis, loadBriefs(analysis.config), { query, limit: limit ?? 20, fuzzy: false });
      return json(hits.map((hit) => ({ id: hit.id, kind: hit.kind, signature: hit.signature, file: hit.file, line: hit.line, explanation: explanationJson(hit.explanation) })));
    },
  );

  server.registerTool(
    "node",
    {
      description: "Everything keylang knows about one ID: kind, signature, place, calls and callers, dependencies, flows and rules naming it, unresolved constructs inside, its edges with positions, and the check verdicts about it.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const analysis = await fresh();
      const result = summarizeNode(analysis, id);
      if ("unknown" in result) return failure(`unknown id \`${id}\`${result.suggestion ? ` (did you mean \`${result.suggestion}\`?)` : ""}`);
      const edges = (analysis.snapshot?.edges ?? [])
        .filter((e) => e.source === id || e.target === id)
        .map((e) => ({ kind: e.kind, source: e.source, target: e.target, resolution: e.resolution, file: e.file, line: e.line, text: e.text }));
      const evidence = analysis.verdicts.filter((v) => v.area === id).map((v) => ({ criterion: v.criterion, verdict: v.verdict, message: v.message, file: v.file, line: v.line }));
      const explanation = analysis.snapshot ? explanationOf(analysis.snapshot, loadBriefs(analysis.config), id) : null;
      return json({ ...result.summary, explanation: explanationJson(explanation), edges, evidence, snapshotId: analysis.snapshot?.snapshotId ?? null });
    },
  );

  server.registerTool(
    "code",
    {
      description: "The source of one fn, type or module by ID, with its file and line range. Read the graph first; ask for code when the graph is not enough.",
      inputSchema: { id: z.string().min(1), context: z.number().int().min(0).max(50).optional() },
    },
    async ({ id, context }) => {
      const analysis = await fresh();
      const node = analysis.snapshot?.nodes[id];
      if (!node?.file || node.line === null) return failure(`\`${id}\` has no code in the snapshot`);
      const abs = join(root, node.file);
      if (!existsSync(abs)) return failure(`${node.file} is not on disk`);
      const lines = readFileSync(abs, "utf8").split("\n");
      const from = Math.max(1, node.line - (context ?? 0));
      const to = Math.min(lines.length, (node.endLine ?? node.line) + (context ?? 0));
      return json({ id, file: node.file, from, to, code: lines.slice(from - 1, to).join("\n") });
    },
  );

  server.registerTool(
    "flows",
    {
      description: "The flows of the specs: each step with its line and its check verdicts (ID, static, tests, trace). Without a name, every flow.",
      inputSchema: { name: z.string().optional() },
    },
    async ({ name }) => {
      const analysis = await fresh();
      const flows: { name: string; file: string; steps: { kind: string; id: string; line: number; verdicts: { criterion: string; verdict: string; message: string }[] }[] }[] = [];
      for (const doc of analysis.docs) {
        for (const section of doc.sections) {
          if (section.kind !== "flow" || !section.name || (name !== undefined && section.name.value !== name)) continue;
          const steps: (typeof flows)[number]["steps"] = [];
          for (const top of sectionNodes(section)) {
            walk(top, (node) => {
              if (node.kind !== "trigger" && node.kind !== "step") return;
              for (const ref of node.refs) {
                const line = node.span.start.line;
                const verdicts = analysis.verdicts.filter((v) => v.file === doc.path && v.line === line && v.area === ref.target).map((v) => ({ criterion: v.criterion, verdict: v.verdict, message: v.message }));
                steps.push({ kind: node.kind, id: ref.target, line, verdicts });
              }
            });
          }
          flows.push({ name: section.name.value, file: doc.path, steps });
        }
      }
      if (name !== undefined && flows.length === 0) return failure(`no flow \`${name}\``);
      return json(flows);
    },
  );

  server.registerTool(
    "check",
    {
      description: "Run keylang check on the current code: the same results as `keylang check --format json` (verdict, criterion, evidence, position) and the coverage holes.",
      inputSchema: {},
    },
    async () => {
      const analysis = await fresh();
      const snapshotId = analysis.snapshot?.snapshotId ?? null;
      return json({ snapshotId, results: checkResults(analysis.verdicts, snapshotId, analysis.diagnostics), coverage: analysis.snapshot?.coverage ?? [] });
    },
  );

  server.registerTool(
    "explain",
    {
      description: "A saved plain-language explanation of an ID (with model, date and whether the code changed since), or the offline summary when there is none. Never calls a model.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const analysis = await fresh();
      const result = summarizeNode(analysis, id);
      if ("unknown" in result) return failure(`unknown id \`${id}\`${result.suggestion ? ` (did you mean \`${result.suggestion}\`?)` : ""}`);
      const saved = readExplanation(analysis.config, id);
      return json({ summary: result.summary, explanation: saved ? { text: saved.text, agent: saved.agent, date: saved.date, stale: isStale(analysis, id, saved) } : null });
    },
  );

  server.registerTool(
    "apply_diff",
    {
      description:
        "Propose the full new text of one hand-written spec (a Markdown file under the spec directory; not the generated map, the explained map, saved explanations or the baseline). Nothing is written to the spec: the text becomes a proposal a person merges hunk by hunk in the keylang TUI (key m) or accepts whole with `keylang proposals accept <path>`; never run that command yourself. Returns the proposal path, status `pending`, and the line diff.",
      inputSchema: { path: z.string().min(1), text: z.string() },
    },
    async ({ path, text }) => {
      const analysis = await fresh();
      const target = toPosix(path);
      const specDir = toPosix(relative(root, resolve(root, analysis.config.dir)));
      const problem = proposalProblem(root, specDir, target, (p) => analysis.docs.some((doc) => doc.path === p && doc.generated !== null));
      if (problem) return failure(`${target}: ${problem}`);
      const abs = join(root, target);
      const before = existingText(abs) ?? "";
      writeProposal(root, target, text);
      return json({ status: "pending", proposal: `${PROPOSALS_DIR}/${target}`, diff: lineDiff(before, text) });
    },
  );

  server.registerTool(
    "context",
    {
      description:
        "The context bundle the keylang TUI shows for one id, or for every id named in keylang/features/<slug>.md: the node and its neighbors, the flows and rules that name it, code fragments, e2e tests, and a token estimate. A planned id is marked planned and incomplete.",
      inputSchema: { id: z.string().min(1).optional(), feature: z.string().min(1).optional() },
    },
    async ({ id, feature }) => {
      if ((id === undefined) === (feature === undefined)) return failure("pass exactly one of id or feature");
      const analysis = await fresh();
      if (feature !== undefined) {
        const path = specPath(analysis.config.dir, `features/${feature}.md`);
        const doc = analysis.docs.find((item) => item.path === path);
        if (!doc) return failure(`no feature \`${feature}\``);
        return json(contextForIds(analysis, idsIn(doc)));
      }
      const result = summarizeNode(analysis, id!);
      if ("unknown" in result) return failure(`unknown id \`${id}\`${result.suggestion ? ` (did you mean \`${result.suggestion}\`?)` : ""}`);
      return json(contextForIds(analysis, [id!]));
    },
  );

  server.registerTool(
    "validate_spec",
    {
      description:
        "Parse text as the spec at path, replacing that file in the current snapshot, and return the diagnostics and check verdicts for that file only. Nothing is written.",
      inputSchema: { path: z.string().min(1), text: z.string() },
    },
    async ({ path, text }) => {
      const abs = resolve(root, path);
      const rel = toPosix(relative(root, abs));
      // Inside the root by path segments: `..specs/x.md` is a directory named `..specs`, not a way out.
      if (!within(abs, root) || rel === "") return failure(`${path}: outside the repository`);
      // A file check never reads would come back clean: say so instead.
      const notRead = specPathProblem(loadConfig(root), abs);
      if (notRead !== null) return failure(`${rel}: ${notRead}`);
      const analysis = await analyze({ root, overlay: new Map([[abs, text]]) });
      const diagnostics = analysis.diagnostics
        .filter((diag) => diag.file === rel)
        .map((diag) => ({ code: diag.code, file: diag.file, line: diag.span.start.line, col: diag.span.start.col, message: diag.message, ...(diag.code === "K005" && diag.reason !== undefined ? { reason: diag.reason } : {}) }));
      const verdicts = analysis.verdicts
        .filter((verdict) => verdict.file === rel)
        .map((verdict) => ({ criterion: verdict.criterion, verdict: verdict.verdict, area: verdict.area, file: verdict.file, line: verdict.line, col: verdict.col, message: verdict.message }));
      return json({ file: rel, diagnostics, verdicts });
    },
  );

  server.registerTool(
    "scaffold",
    {
      description:
        "The template spec-to-code result for a planned fn: target path, stub, failing tests, and what the candidate adds to check. No model call and no write. An id that is already implemented is an error naming where.",
      inputSchema: { id: z.string().min(1), into: z.string().min(1).optional() },
    },
    async ({ id, into }) => {
      const analysis = await fresh();
      try {
        const candidate = await specToCode(analysis, id, into);
        return json({
          id: candidate.id,
          file: candidate.file,
          newFile: candidate.before === null,
          diff: lineDiff(candidate.before ?? "", candidate.after),
          stub: candidate.after,
          tests: candidate.tests.map((test) => ({ file: test.file, diff: lineDiff("", test.after), text: test.after })),
          testNotes: candidate.testNotes,
          verdicts: candidate.verdicts.map((verdict) => ({ criterion: verdict.criterion, verdict: verdict.verdict, file: verdict.file, line: verdict.line, col: verdict.col, message: verdict.message })),
          diagnostics: candidate.diagnostics.map((diag) => ({
            code: diag.code,
            file: diag.file,
            line: diag.span.start.line,
            col: diag.span.start.col,
            message: diag.message,
            ...(diag.code === "K005" && diag.reason !== undefined ? { reason: diag.reason } : {}),
          })),
        });
      } catch (error) {
        return failure(errorText(error));
      }
    },
  );

  server.registerTool(
    "feature_status",
    {
      description:
        "Whether keylang/features/<slug>.md is done, and how far it got: `stage` is idea (no flow yet), behavior (a flow without a trigger or steps), structure (the spec itself has gaps), ready (only the implementation is missing) or done. Done means the file declares something to check (else an `empty` gap), keylang reads it without errors (K001-K005 in it are `diagnostic` gaps), every planned id is implemented (K202, not K201), every flow step is static ok, no rule fail of this change remains, and the plan was not weakened since the base commit: a planned removed without being implemented, or a trigger or step changed or removed, is a spec gap. The base is `since`; without it, the merge-base of HEAD with the main branch (origin/HEAD, else main, master, origin/main, origin/master), so a fail committed on a feature branch is still this change's, and the plan at HEAD is compared too; HEAD when there is no main branch or the merge-base is HEAD. A rule fail is this change's when it touches a file changed since the base (as `check --changed --since <base>` reports it) or an end of its edge is an id the feature names; any other is inherited: a `rule` hint and an entry of info.rules, not blocking. Without git (info.base unavailable) every rule fail blocks and info.rules is null. Every gap has the stage where it is fixed. `hints` (a flow without a trigger or steps, an inherited rule fail) do not block. Tests, trace, and the base (info.base: ref, state, source since|merge-base|HEAD, main) are informational and do not block.",
      inputSchema: { slug: z.string().min(1), since: z.string().min(1).optional() },
    },
    async ({ slug, since }) => {
      // The shared operation of `keylang feature` and the TUI's readiness screen, on this server's analysis.
      const result = await runOperation({ kind: "feature", root, slug, ...(since !== undefined ? { since } : {}) }, { analyze: () => fresh() });
      if (result.payload === null) return failure(result.messages.find((message) => message.level === "error")?.text ?? `no feature \`${slug}\``);
      return json(result.payload.report);
    },
  );

  server.registerTool(
    "list_entries",
    {
      description:
        "Where execution starts, as the code and its manifests write it (`keylang entries`): each entry point with kind (route, cli, main; a framework's rest, graphql, cron, consumer, observer, webhook, controller come from its adapter), label (`GET /orders`, a bin or script name, a script path), the fn or module id, file and line, framework and the source the fact is written in. Sorted by kind, label, id; `kind` narrows to one kind. Read-only; nothing calls these from inside the repository.",
      inputSchema: { kind: z.enum(ENTRY_KINDS).optional() },
    },
    async ({ kind }) => {
      const analysis = await fresh();
      const snapshot = analysis.snapshot;
      if (snapshot === null) return failure("no code to read (`languages` in keylang.json is empty)");
      return json({ snapshotId: snapshot.snapshotId, kind: kind ?? null, entries: snapshot.entries.filter((entry) => kind === undefined || entry.kind === kind) });
    },
  );

  server.registerTool(
    "discover_flows",
    {
      description:
        "A flow draft for every entry point, as `keylang flows discover --print` computes it: each flow's name, trigger fn, entry kind and label, layer, steps and the count of unresolved calls on its route (holes), with the view's file texts; triggers a hand-written flow already names are listed as specified. Read-only: nothing is written. A discovered flow is no spec and `check` does not read it; to make one a spec, ask a person to run `keylang flows adopt <name>`, or propose it with apply_diff.",
      inputSchema: { kind: z.enum(ENTRY_KINDS).optional(), layer: z.string().min(1).optional(), limit: z.number().int().min(1).optional(), depth: z.number().int().min(0).optional() },
    },
    async ({ kind, layer, limit, depth }) => {
      const result = await runOperation({ kind: "flows-discover", root, output: "print", ...(kind !== undefined ? { only: kind } : {}), ...(layer !== undefined ? { layer } : {}), ...(limit !== undefined ? { limit } : {}), ...(depth !== undefined ? { depth } : {}) });
      if (result.payload === null) return failure(result.messages[0]?.text ?? "flows discover failed");
      const { snapshotId, summary, flows, specified, files } = result.payload;
      return json({ snapshotId, summary, flows: flows.map(({ text: _text, ...flow }) => flow), specified, files });
    },
  );

  server.registerTool(
    "coverage_report",
    {
      description:
        "Where keylang does not see, as `keylang coverage --json` computes it: reach (fns reachable from at least one entry point over resolved call edges, and the share), orphans (fns no entry point reaches: dead code or an entry point keylang does not know; entry fns and test files left out), holes by module with reasons normalised (backticked names as `X`) and counted, entry points no hand-written flow starts from (with the discovered flow `flows discover` would draft and whether the view has it), and «logic in data»: calls into configuration readers (resources/data-logic.json) to check by hand. A view, not a verdict; read-only.",
      inputSchema: {},
    },
    async () => {
      const result = await runOperation({ kind: "coverage", root }, { analyze: () => fresh() });
      if (result.payload === null) return failure(result.messages[0]?.text ?? "coverage failed");
      const { text: _text, ...report } = result.payload;
      return json(report);
    },
  );

  server.registerTool(
    "list_integrations",
    {
      description:
        "What the code talks to, as `keylang integrations --json` computes it: outgoing integrations (HTTP, SOAP, SDK and queue clients of resources/integrations.json) each with its call sites (file, line, callee, enclosing fn, the host of a literal URL or `dynamic`/`n/a`) and the entry points that reach each site with their hand-written or discovered flow; the client's imports; incoming webhooks (entries of kind webhook, routes whose path names a webhook, callback, notify or IPN, `integrations.webhooks` of keylang.json); queue publishers, consumers and pairs. A view; read-only, nothing is contacted.",
      inputSchema: {},
    },
    async () => {
      const result = await runOperation({ kind: "integrations", root }, { analyze: () => fresh() });
      if (result.payload === null) return failure(result.messages[0]?.text ?? "integrations failed");
      const { text: _text, ...report } = result.payload;
      return json(report);
    },
  );

  return server;
}

export async function serveMcp(root: string, version: string): Promise<number> {
  const server = mcpServer(root, version);
  await server.connect(new StdioServerTransport());
  // The transport keeps the process alive until the client closes stdin.
  await new Promise<void>((done) => process.stdin.once("close", done));
  return 0;
}
