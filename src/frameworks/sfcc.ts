// The Salesforce Commerce Cloud adapter (SFRA cartridges; ADR 0022 п. 2, 5):
// entry points the platform starts and the code does not call — a
// controller's `server.get|post|use|append|prepend|replace('<Action>', …)`
// (`route`, labelled `<Controller>-<Action>`), a hook of `hooks.json`
// (`observer`), a job step of `steptypes.json` (`cron`) — and the coverage
// note for a `*/cartridge` require whose answer only a guessed cartridge path
// decided. Requires themselves resolve in `src/imports.ts` through
// `src/frameworks/cartridges.ts`. Composable Storefront (PWA Kit) is plain
// TypeScript/React and needs no adapter; Apex (B2B Commerce) is not read.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import type { Config } from "../config.ts";
import { compareEntries, entryScope, fnIn, frameworkEntry, type EntryScope } from "../entries.ts";
import type { FileFacts } from "../extract/facts.ts";
import type { Gap, Graph } from "../graph.ts";
import { probeCandidates } from "../imports.ts";
import type { EntryPoint } from "../snapshot.ts";
import { cartridgeAnswers, cartridgeLayout, SUPER_MODULE, type Cartridge, type CartridgeLayout } from "./cartridges.ts";

/** What an adapter adds to a snapshot: entry points, holes, and the config files it read (path → text or null), which `snapshotId` covers. */
export interface FrameworkFacts {
  entries: EntryPoint[];
  holes: Gap[];
  inputs: [string, string | null][];
  warnings: string[];
}

export interface FrameworkInput {
  root: string;
  config: Config;
  graph: Graph;
  facts: readonly FileFacts[];
}

/** A framework adapter (ADR 0022 п. 2): whether the repository uses it, the config files it reads, and its facts. */
export interface FrameworkAdapter {
  name: string;
  detect(root: string): boolean;
  /** Globs of the configuration files the adapter reads, beside the sources. */
  files: readonly string[];
  facts(input: FrameworkInput): FrameworkFacts;
}

const NONE: FrameworkFacts = { entries: [], holes: [], inputs: [], warnings: [] };

export const sfcc: FrameworkAdapter = {
  name: "sfcc",
  detect: (root) => isFile(join(root, "dw.json")) || hasCartridgeDir(root),
  files: ["dw.json", "**/cartridges/*/package.json", "**/cartridges/*/**/hooks.json", "**/cartridges/*/steptypes.json", "**/cartridges/*/cartridge/steptypes.json"],
  facts: sfccFacts,
};

/** `cartridges/<name>/cartridge/` at the root or one level down. */
function hasCartridgeDir(root: string): boolean {
  const under = (dir: string): boolean => {
    try {
      return readdirSync(join(root, dir), { withFileTypes: true }).some((e) => e.isDirectory() && isDir(join(root, dir, e.name, "cartridge")));
    } catch {
      return false;
    }
  };
  if (under("cartridges")) return true;
  try {
    return readdirSync(root, { withFileTypes: true }).some((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && under(`${e.name}/cartridges`));
  } catch {
    return false;
  }
}

function sfccFacts({ root, config, graph, facts }: FrameworkInput): FrameworkFacts {
  const layout = cartridgeLayout(root, facts.map((f) => f.path), config.sfcc.cartridgePath);
  if (layout === null) return NONE;
  const out: FrameworkFacts = { entries: [], holes: [], inputs: [["sfcc:cartridge-path", JSON.stringify({ source: layout.source, path: layout.path.map((c) => c.name) })]], warnings: [] };
  const scope = entryScope(graph, facts);
  const sources = new Set(facts.map((f) => f.path));
  const probe = (candidate: string): string | null => probeCandidates(candidate).find((p) => sources.has(p)) ?? null;
  const text = (path: string): string | null => {
    const read = readText(join(root, path));
    out.inputs.push([path, read]);
    return read;
  };
  if (layout.source === "guessed" && layout.cartridges.length > 1) {
    out.warnings.push(`sfcc: cartridge path guessed (by name): ${layout.path.map((c) => c.name).join(":")}; set \`sfcc.cartridgePath\` in keylang.json`);
  }
  for (const c of layout.cartridges) {
    if (layout.source !== "guessed" && !layout.path.includes(c)) out.warnings.push(`sfcc: cartridge \`${c.name}\` is not on the cartridge path (${layout.source}): \`*/cartridge/…\` never reaches it`);
  }
  out.holes.push(...guessedOrder(layout, graph, facts, probe));
  out.entries.push(...controllerEntries(graph, facts, scope));
  for (const c of layout.cartridges) {
    out.entries.push(...hookEntries(c, scope, probe, text, out.holes));
    out.entries.push(...jobEntries(c, layout, scope, probe, text, out.holes));
  }
  out.entries.sort(compareEntries);
  return out;
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
  for (const file of facts) {
    const module = graph.byPath.get(file.path);
    for (const imp of file.imports) {
      if (!imp.source.startsWith("*/") && imp.source !== SUPER_MODULE) continue;
      const answers = cartridgeAnswers(layout, file.path, imp.source, probe);
      if (!Array.isArray(answers) || answers.length === 0 || (imp.source !== SUPER_MODULE && answers.length < 2)) continue;
      const order = layout.path.map((c) => c.name).join(":");
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
 * controller module stands for it, with a note.
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

/**
 * `hooks.json` of a cartridge — the file its `package.json` names in `hooks`,
 * else `cartridge/scripts/hooks.json` or `hooks.json` — one `observer` per
 * hook: the script module, or its fn named like the hook's last segment
 * (`dw.order.calculate` → `calculate`). A script keylang does not find is a hole.
 */
function hookEntries(c: Cartridge, scope: EntryScope, probe: (candidate: string) => string | null, text: (path: string) => string | null, holes: Gap[]): EntryPoint[] {
  const manifest = parseJson(text(`${c.dir}/package.json`));
  const named = typeof field(manifest, "hooks") === "string" ? posix.normalize(posix.join(c.dir, field(manifest, "hooks") as string)) : null;
  const candidates = named !== null ? [named] : [`${c.dir}/cartridge/scripts/hooks.json`, `${c.dir}/hooks.json`];
  const out: EntryPoint[] = [];
  for (const path of candidates) {
    const source = text(path);
    if (source === null) continue;
    const hooks = field(parseJson(source), "hooks");
    for (const hook of Array.isArray(hooks) ? hooks : []) {
      const name = field(hook, "name");
      const script = field(hook, "script");
      if (typeof name !== "string" || typeof script !== "string") continue;
      const line = lineOf(source, `"${name}"`);
      // Scripts are written from the cartridge's root (`./cartridge/scripts/…`); some from the hooks file.
      const file = probe(posix.join(c.dir, script)) ?? probe(posix.join(posix.dirname(path), script));
      const module = file === null ? undefined : scope.graph.byPath.get(file);
      if (file === null || module === undefined) {
        holes.push(hole(path, line, `hook \`${name}\`: script \`${script}\` is no file of the analysis`));
        continue;
      }
      const fn = fnIn(scope, file, name.slice(name.lastIndexOf(".") + 1));
      out.push(frameworkEntry(scope, "sfcc", "observer", fn ?? module.id, name, `${path}:${line}`, { file, line: 1 }));
    }
    break;
  }
  return out;
}

/**
 * `steptypes.json` of a cartridge: one `cron` per job step type, labelled by
 * its `@type-id`. `module` names the script from the cartridges
 * (`int_x/cartridge/scripts/steps/x`); the fn is `function` (a script step)
 * or `process-function` (a chunk step), else the module.
 */
function jobEntries(c: Cartridge, layout: CartridgeLayout, scope: EntryScope, probe: (candidate: string) => string | null, text: (path: string) => string | null, holes: Gap[]): EntryPoint[] {
  const out: EntryPoint[] = [];
  for (const path of [`${c.dir}/steptypes.json`, `${c.dir}/cartridge/steptypes.json`]) {
    const source = text(path);
    if (source === null) continue;
    const kinds = field(parseJson(source), "step-types");
    for (const steps of kinds !== null && typeof kinds === "object" ? Object.values(kinds) : []) {
      for (const step of Array.isArray(steps) ? steps : []) {
        const id = field(step, "@type-id");
        const script = field(step, "module");
        if (typeof id !== "string" || typeof script !== "string") continue;
        const line = lineOf(source, `"${id}"`);
        const slash = script.indexOf("/");
        const owner = layout.cartridges.find((other) => other.name === script.slice(0, slash));
        const file = owner !== undefined ? probe(`${owner.dir}/${script.slice(slash + 1)}`) : probe(posix.join(c.dir, script));
        const module = file === null ? undefined : scope.graph.byPath.get(file);
        if (file === null || module === undefined) {
          holes.push(hole(path, line, `job step \`${id}\`: module \`${script}\` is no file of the analysis`));
          continue;
        }
        const name = field(step, "function") ?? field(step, "process-function");
        const fn = typeof name === "string" ? fnIn(scope, file, name) : null;
        out.push(frameworkEntry(scope, "sfcc", "cron", fn ?? module.id, id, `${path}:${line}`, { file, line: 1 }));
      }
    }
  }
  return out;
}

function hole(file: string, line: number, reason: string): Gap {
  return { kind: "unsupported", file, line, col: 1, endLine: line, endCol: 1, text: "", reason, source: null };
}

/** The 1-based line of the first `needle` in `text`; 1 when it is not there. */
function lineOf(text: string, needle: string): number {
  const at = text.indexOf(needle);
  return at === -1 ? 1 : text.slice(0, at).split("\n").length;
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

function readText(path: string): string | null {
  try {
    return statSync(path).isFile() ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
