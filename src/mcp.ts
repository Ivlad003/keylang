// `keylang mcp`: the analysis for external agents over MCP (stdio), design
// §7.3. The graph by default, code on request: `search`, `node`, `code`,
// `flows`, `check` (the same results as `check --format json`), `explain`
// (a saved explanation or the offline summary) and `apply_diff`, which only
// writes a proposal a person merges. Every call answers for the current
// inputs (`currentAnalysis`), so an answer never describes code that changed
// since. stdout carries the protocol only.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import { analyze, type Analysis } from "./analyze.ts";
import { checkResults } from "./check-results.ts";
import { CONFIG_FILE, evidenceFiles, loadConfig, toPosix } from "./config.ts";
import { isStale, readExplanation } from "./explain-llm.ts";
import { summarizeNode } from "./explain-node.ts";
import { collectMdFiles } from "./files.ts";
import { sectionNodes, walk } from "./ir.ts";
import { generateMap } from "./map.ts";
import { lineDiff, PROPOSALS_DIR, proposalProblem, writeProposal } from "./proposals.ts";

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
 */
export function currentAnalysis(root: string): () => Promise<Analysis> {
  let last: { key: string; analysis: Analysis } | null = null;
  return async () => {
    const configFile = join(root, CONFIG_FILE);
    const raw = existsSync(configFile) ? readFileSync(configFile, "utf8") : null;
    const config = loadConfig(root);
    const map = config.languages.length > 0 ? await generateMap(config) : null;
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

export function mcpServer(root: string, version: string): McpServer {
  const server = new McpServer({ name: "keylang", version });
  const fresh = currentAnalysis(root);

  server.registerTool(
    "search",
    {
      description: "Find IDs of the architecture map (layers, modules, fns, types, planned) whose ID contains the query, case-insensitive. Start here to get IDs for the other tools.",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ query, limit }) => {
      const analysis = await fresh();
      const q = query.toLowerCase();
      const found = new Map<string, { id: string; kind: string; signature: string | null; file: string | null; line: number | null }>();
      for (const [id, node] of Object.entries(analysis.snapshot?.nodes ?? {})) found.set(id, { id, kind: node.kind, signature: node.signature ?? null, file: node.file, line: node.line });
      // Intentions: `planned` declarations the code does not have yet, at their line in the spec.
      for (const doc of analysis.docs) {
        for (const section of doc.sections) {
          for (const top of sectionNodes(section)) {
            walk(top, (node) => {
              if (node.kind !== "planned" || !node.id || found.has(node.id)) return;
              found.set(node.id, { id: node.id, kind: `planned ${node.label?.value ?? "fn"}`, signature: node.text?.value ?? null, file: doc.path, line: node.span.start.line });
            });
          }
        }
      }
      const hits = [...found.values()]
        .filter((hit) => hit.id.toLowerCase().includes(q))
        .sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : 1))
        .slice(0, limit ?? 20);
      return json(hits);
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
      return json({ ...result.summary, edges, evidence, snapshotId: analysis.snapshot?.snapshotId ?? null });
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
      const saved = readExplanation(root, id);
      return json({ summary: result.summary, explanation: saved ? { text: saved.text, agent: saved.agent, date: saved.date, stale: isStale(analysis, id, saved) } : null });
    },
  );

  server.registerTool(
    "apply_diff",
    {
      description:
        "Propose the full new text of one hand-written spec (a Markdown file under the spec directory). Nothing is written to the spec: the text becomes a proposal a person merges hunk by hunk in the keylang TUI (key m). Returns the proposal path, status `pending`, and the line diff.",
      inputSchema: { path: z.string().min(1), text: z.string() },
    },
    async ({ path, text }) => {
      const analysis = await fresh();
      const target = toPosix(path);
      const specDir = toPosix(relative(root, resolve(root, analysis.config.dir)));
      const problem = proposalProblem(root, specDir, target, (p) => analysis.docs.some((doc) => doc.path === p && doc.generated !== null));
      if (problem) return failure(`${target}: ${problem}`);
      const abs = join(root, target);
      const before = existsSync(abs) ? readFileSync(abs, "utf8") : "";
      writeProposal(root, target, text);
      return json({ status: "pending", proposal: `${PROPOSALS_DIR}/${target}`, diff: lineDiff(before, text) });
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
