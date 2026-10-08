// Entry points and holes the framework adapters add to a snapshot (ADR 0022
// п. 5), placed on the graph: an entry a config file names (SFCC `hooks.json`,
// `steptypes.json`) becomes the fn or module of its script, and SFCC adds the
// controllers the TypeScript extractor records (`server.get('Show', …)` →
// `route` `Cart-Show`) and a coverage note for a `*/cartridge` require that
// only a guessed cartridge path decided. The adapters themselves only parse
// (`src/frameworks/`); everything that needs the graph is here.

import type { Config } from "./config.ts";
import { compareEntries, entryScope, fnIn, frameworkEntry, type EntryScope } from "./entries.ts";
import type { FileFacts } from "./extract/facts.ts";
import type { FrameworkInput } from "./frameworks/adapter.ts";
import { cartridgeAnswers, cartridgeLayout, SUPER_MODULE, type CartridgeLayout } from "./frameworks/cartridges.ts";
import type { Gap, Graph } from "./graph.ts";
import { probeCandidates } from "./imports.ts";
import type { EntryPoint } from "./snapshot.ts";

export interface FrameworkEntryInputs {
  config: Config;
  graph: Graph;
  facts: readonly FileFacts[];
  /** The active adapters with their parsed config files. */
  frameworks: readonly FrameworkInput[];
}

export function frameworkEntries({ config, graph, facts, frameworks }: FrameworkEntryInputs): { entries: EntryPoint[]; holes: Gap[]; warnings: string[] } {
  const scope = entryScope(graph, facts);
  const sources = new Set(facts.map((f) => f.path));
  const probe = (candidate: string): string | null => probeCandidates(candidate).find((p) => sources.has(p)) ?? null;
  const entries: EntryPoint[] = [];
  const holes: Gap[] = [];
  const warnings: string[] = [];
  for (const framework of frameworks) {
    for (const { facts: file } of framework.configs) {
      for (const fact of file.entries ?? []) {
        const script = fact.files.map(probe).find((found) => found !== null) ?? null;
        const module = script === null ? undefined : graph.byPath.get(script);
        if (script === null || module === undefined) {
          const reason = `${fact.kind === "cron" ? "job step" : "hook"} \`${fact.label}\`: its script (\`${fact.files[0]}\`) is no file of the analysis`;
          holes.push({ kind: "unsupported", file: file.path, line: fact.line, col: fact.col, endLine: fact.line, endCol: fact.col, text: "", reason, source: null });
          continue;
        }
        const fn = fact.fn === null ? null : fnIn(scope, script, fact.fn);
        entries.push(frameworkEntry(scope, framework.name, fact.kind, fn ?? module.id, fact.label, `${file.path}:${fact.line}`, { file: script, line: 1 }));
      }
    }
  }
  if (frameworks.some((f) => f.name === "sfcc")) {
    const layout = cartridgeLayout(config.root, sources, config.sfcc.cartridgePath);
    if (layout !== null) {
      if (layout.source === "guessed" && layout.cartridges.length > 1) {
        warnings.push(`sfcc: cartridge path guessed (by name): ${layout.path.map((c) => c.name).join(":")}; set \`sfcc.cartridgePath\` in keylang.json`);
      }
      for (const c of layout.cartridges) {
        if (layout.source !== "guessed" && !layout.path.includes(c)) warnings.push(`sfcc: cartridge \`${c.name}\` is not on the cartridge path (${layout.source}): \`*/cartridge/…\` never reaches it`);
      }
      holes.push(...guessedOrder(layout, graph, facts, probe));
    }
    entries.push(...controllerEntries(graph, facts, scope));
  }
  return { entries: entries.sort(compareEntries), holes, warnings };
}

/**
 * A `*\/cartridge/…` require that two cartridges answer, or a
 * `module.superModule`, resolved along a guessed cartridge path: the order
 * decided the edge, and nothing the repository writes gave the order. A hole
 * (`unsupported`) of the requiring module, so a rule over it is unverified
 * rather than proven by a guess.
 */
function guessedOrder(layout: CartridgeLayout, graph: Graph, facts: readonly FileFacts[], probe: (candidate: string) => string | null): Gap[] {
  if (layout.source !== "guessed" || layout.path.length < 2) return [];
  const holes: Gap[] = [];
  const order = layout.path.map((c) => c.name).join(":");
  for (const file of facts) {
    const module = graph.byPath.get(file.path);
    for (const imp of file.imports) {
      if (!imp.source.startsWith("*/") && imp.source !== SUPER_MODULE) continue;
      const answers = cartridgeAnswers(layout, file.path, imp.source, probe);
      if (!Array.isArray(answers) || answers.length === 0 || (imp.source !== SUPER_MODULE && answers.length < 2)) continue;
      const reason = `cartridge path guessed: \`${imp.source}\` resolved to \`${answers[0]}\` by the order ${order} (cartridges by name); set \`sfcc.cartridgePath\` in keylang.json`;
      holes.push({ kind: "unsupported", file: file.path, line: imp.line, col: imp.col, endLine: imp.endLine, endCol: imp.endCol, text: imp.text, reason, source: module?.id ?? null });
    }
  }
  return holes;
}

const CONTROLLER = /^(?:.*\/)?cartridges\/[^/]+\/cartridge\/controllers\/([^/]+)\.js$/;
const HTTP_METHODS: Record<string, string> = { get: "GET", post: "POST" };

/**
 * `server.get('Show', …, handler)` in `controllers/Cart.js`: a `route`
 * labelled `Cart-Show`. The handler is the last argument when it names a fn
 * keylang resolves; a handler written in place has no fn ID, so the
 * controller module stands for it, at the registration's line, with a note.
 */
function controllerEntries(graph: Graph, facts: readonly FileFacts[], scope: EntryScope): EntryPoint[] {
  const out: EntryPoint[] = [];
  for (const file of facts) {
    const match = CONTROLLER.exec(file.path);
    const module = graph.byPath.get(file.path);
    if (match === null || module === undefined) continue;
    for (const fact of file.entries ?? []) {
      if (fact.kind !== "sfra") continue;
      const fn = fact.callee === null ? null : fnIn(scope, file.path, fact.callee);
      const notes: string[] = [];
      if (fact.method === "append" || fact.method === "prepend" || fact.method === "replace") notes.push(`server.${fact.method}: changes the route a cartridge further down the path declares`);
      if (fact.callee === null) notes.push("handler written in place: the controller module stands for it");
      else if (fn === null) notes.push(`handler \`${fact.callee}\` does not resolve to a fn: the controller module stands for it`);
      const at = { file: file.path, line: fact.line };
      const found = frameworkEntry(scope, "sfcc", "route", fn ?? module.id, `${match[1]}-${fact.label}`, `${file.path}:${fact.line}`, at);
      const method = HTTP_METHODS[fact.method ?? ""];
      out.push({ ...found, ...(fn === null ? at : {}), ...(method === undefined ? {} : { method }), ...(notes.length > 0 ? { note: notes.join("; ") } : {}) });
    }
  }
  return out;
}
