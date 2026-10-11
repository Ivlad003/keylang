// `keylang integrations` (business-flows/14): what the repository talks to,
// the first thing to know before a migration. A view over the snapshot (ADR
// 0014), no verdict and no network: outgoing calls into the HTTP, SOAP, SDK
// and queue clients `resources/integrations.json` lists, grouped by
// integration → call site (file:line, the enclosing fn, the host of a
// literal URL) → the entry points and flows that reach it; incoming webhooks
// (entry points of kind `webhook`, routes whose path names a webhook,
// callback, notify or IPN, and `integrations.webhooks` of keylang.json); and
// queues: publishers by topic, consumers, and the pairs a topic joins.
//
// Pipeline: a report over the snapshot (source → FileFacts → graph →
// snapshot), read by the CLI. Entry points: `loadIntegrations`,
// `findIntegrations`, `findWebhooks`, `integrationsText`; key terms:
// integration client, call site, reach, webhook, publisher/consumer, pair.

import { readFileSync } from "node:fs";
import { callGraph, callMatches, callsOf, compileMatcher, importMatches, internalCallPositions, literalArgument, resourcePath, snapshotFacts, sourceReader, urlOf, type Matcher } from "./call-sites.ts";
import type { Config } from "./config.ts";
import { discoverFlows } from "./discover.ts";
import { firstMatchingGlob } from "./glob.ts";
import { isJsonObject, parseJson, type JsonObject, type JsonValue } from "./json.ts";
import type { AnalysisSnapshot, EntryKind, EntryPoint } from "./snapshot.ts";
import { compareText } from "./span.ts";

/** What kind of external system a client talks to. */
export type IntegrationKind = "http" | "soap" | "sdk" | "payment" | "queue";

/** One client the data file names. */
export interface IntegrationClient extends Matcher {
  id: string;
  label: string;
  kind: IntegrationKind;
}

/** An entry point that reaches a call site, with the flow that starts from it. */
export interface Reach {
  kind: EntryKind;
  label: string;
  id: string;
  /** The hand-written flow whose trigger it is, else the flow `flows discover` drafts for it; null for neither. */
  flow: { name: string; source: "spec" | "discovered" } | null;
}

/** One call of a client in the code, with where it points and which entry points reach it. */
export interface IntegrationSite {
  file: string;
  line: number;
  col: number;
  callee: string;
  /** The fn (else class or module) the call is written in. */
  in: string | null;
  /** `literal`: an absolute URL written in the first two arguments (its host in `host`); `dynamic`: an expression there; `n/a`: no URL argument keylang can read. */
  url: "literal" | "dynamic" | "n/a";
  host: string | null;
  /** Entry points whose resolved calls reach `in`, in the snapshot's order. */
  reachedFrom: Reach[];
}

/** One client the repository uses: its call sites and the imports of it. */
export interface Integration {
  id: string;
  label: string;
  kind: IntegrationKind;
  /** By file and position. */
  sites: IntegrationSite[];
  /** Imports of the client, by file and line: a call through a value keylang cannot follow still shows the dependency. */
  imports: { file: string; line: number; source: string }[];
}

/** An incoming entry point treated as a webhook, with why it counts as one. */
export interface Webhook {
  /** `kind`: an entry point of kind webhook; `path`: a route whose label names a webhook; `config`: `integrations.webhooks` names its file or path. */
  via: "kind" | "path" | "config";
  kind: EntryKind | "fn";
  label: string;
  id: string;
  file: string;
  line: number;
  /** The glob of `integrations.webhooks` that names it. */
  glob?: string;
}

/** The whole `keylang integrations` report (also its JSON form). */
export interface IntegrationsReport {
  snapshotId: string;
  /** Clients with call sites or imports, in the data file's order. */
  outgoing: Integration[];
  /** By file, line, id. */
  webhooks: Webhook[];
  queues: {
    publishers: { integration: string; file: string; line: number; in: string | null; topic: string | null }[];
    consumers: { label: string; id: string; file: string; line: number }[];
    /** A publisher's literal topic that a consumer's label names. */
    pairs: { topic: string; publisher: string; consumer: string }[];
  };
  /** What the report could not see. */
  notes: string[];
}

/** `resources/integrations.json`. */
export function loadIntegrations(path = resourcePath("integrations.json")): IntegrationClient[] {
  const value = parseJson(readFileSync(path, "utf8"));
  const integrations = isJsonObject(value) ? value.integrations : undefined;

  if (!Array.isArray(integrations)) throw new Error(`${path}: \`integrations\` must be an array`);

  return integrations.map((item, i) => {
    if (!isIntegrationClient(item)) throw new Error(`${path}: \`integrations[${i}]\` needs an \`id\`, a \`label\` and a \`kind\``);

    return item;
  });
}

/**
 * A client of the data file: its `id`, `label` and `kind` are checked; the
 * matcher fields are trusted as the data file (ours, in `resources/`) writes them.
 */
function isIntegrationClient(item: JsonValue): item is JsonObject & IntegrationClient {
  return isJsonObject(item) && typeof item.id === "string" && typeof item.label === "string" && typeof item.kind === "string";
}

/** Route paths that name an incoming notification. */
const WEBHOOK_PATH = /(webhook|callback|notify|ipn)/i;

/** Entry kinds whose label is an HTTP-style path that may name a webhook. */
const ROUTE_KINDS: readonly EntryKind[] = ["route", "rest", "graphql", "controller"];

/** The path of a route label (`POST /stripe/webhook` → `/stripe/webhook`). */
function routePath(label: string): string {
  return label.replace(/^[A-Z]+\s+/, "");
}

/** Incoming webhooks: entries of kind webhook, routes whose path names one, and what `integrations.webhooks` names. */
export function findWebhooks(snapshot: AnalysisSnapshot, globs: readonly string[]): Webhook[] {
  const out: Webhook[] = [];
  const seen = new Set<string>();

  for (const entry of snapshot.entries) {
    // A configured glob may match the entry's file or its route path (without the leading `/`).
    const glob = globs.length === 0 ? null : (firstMatchingGlob(entry.file, globs) ?? firstMatchingGlob(routePath(entry.label).replace(/^\//, ""), globs));
    // The first reason wins: the entry kind, then a webhook-like path, then the config glob.
    const via = entry.kind === "webhook" ? "kind" : ROUTE_KINDS.includes(entry.kind) && WEBHOOK_PATH.test(routePath(entry.label)) ? "path" : glob !== null ? "config" : null;

    if (via === null) continue;
    seen.add(entry.id);
    const webhook: Webhook = { via, kind: entry.kind, label: entry.label, id: entry.id, file: entry.file, line: entry.line };

    if (via === "config" && glob !== null) webhook.glob = glob;
    out.push(webhook);
  }

  // Handlers in the files the config names that nothing in the repository calls: the framework does.
  if (globs.length > 0) {
    for (const [id, node] of Object.entries(snapshot.nodes)) {
      if (node.kind !== "fn" || node.file === null || seen.has(id) || node.exported !== true || (node.callers?.length ?? 0) > 0) continue;
      const glob = firstMatchingGlob(node.file, globs);

      if (glob === null) continue;
      out.push({ via: "config", kind: "fn", label: node.name ?? id.slice(id.lastIndexOf(".") + 1), id, file: node.file, line: node.line ?? 1, glob });
    }
  }

  // By file, line and id so the list is stable.
  return out.sort((a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.id, b.id));
}

/**
 * The report. `specified`: the triggers of hand-written flows, by trigger,
 * with the flow's name. Reads the analysed files' facts and, at each matched
 * call, the source text for its first arguments.
 */
export async function findIntegrations(config: Config, snapshot: AnalysisSnapshot, clients: readonly IntegrationClient[], specified: ReadonlyMap<string, { file: string; flow: string }>): Promise<IntegrationsReport> {
  const files = callsOf(snapshot, await snapshotFacts(config, snapshot));
  const internal = internalCallPositions(snapshot);
  const read = sourceReader(config.root);
  const graph = callGraph(snapshot);
  const discovered = new Map(discoverFlows(snapshot, specified).flows.map((flow) => [flow.trigger, flow.name]));
  const entriesById = new Map<string, EntryPoint[]>();

  // Entry points by fn ID: several entries may point at the same fn.
  for (const entry of snapshot.entries) entriesById.set(entry.id, [...(entriesById.get(entry.id) ?? []), entry]);
  const reachCache = new Map<string, Reach[]>();

  // The entry points that reach a fn: walk callers backwards over the call graph,
  // then keep the snapshot's entries among them. Cached per fn, since many sites share one.
  const reachOf = (id: string | null): Reach[] => {
    if (id === null) return [];
    const known = reachCache.get(id);

    if (known !== undefined) return known;
    const seen = new Set<string>();
    const stack = [id];

    while (stack.length > 0) {
      const next = stack.pop()!;

      if (seen.has(next)) continue;
      seen.add(next);

      for (const caller of graph.in.get(next) ?? []) if (!seen.has(caller)) stack.push(caller);
    }

    const reach = snapshot.entries
      .filter((entry) => seen.has(entry.id))
      .map((entry): Reach => {
        const spec = specified.get(entry.id);
        const name = discovered.get(entry.id);

        return { kind: entry.kind, label: entry.label, id: entry.id, flow: spec !== undefined ? { name: spec.flow, source: "spec" } : name !== undefined ? { name, source: "discovered" } : null };
      });

    reachCache.set(id, reach);

    return reach;
  };

  const outgoing: Integration[] = [];
  const publishers: IntegrationsReport["queues"]["publishers"] = [];
  const claimed = new Set<string>();

  // For each client in the data file's order: its imports and its matched call sites, file by file.
  for (const client of clients) {
    const matcher = compileMatcher(client);
    const sites: IntegrationSite[] = [];
    const imports: Integration["imports"] = [];

    for (const file of files) {
      if (matcher.languages !== null && (file.language === undefined || !matcher.languages.has(file.language))) continue;

      for (const imp of file.imports) if (matcher.imports.some((pattern) => importMatches(imp.source, pattern))) imports.push({ file: file.file, line: imp.line, source: imp.source });

      for (const call of file.calls) {
        const key = `${call.file}:${call.line}:${call.col}`;

        // A call two clients match belongs to the first in the data's order.
        if (claimed.has(key) || !callMatches(matcher, call, file, internal.has(key))) continue;
        claimed.add(key);
        const source = read(call.file);
        // A queue's first argument is a topic, not a URL: its publisher row names it.
        const url = source === null || client.kind === "queue" ? { url: "n/a" as const, host: null } : urlOf(source.text, source.starts, call.line, call.col, call.callee);
        sites.push({ file: call.file, line: call.line, col: call.col, callee: call.callee, in: call.in, url: url.url, host: url.host, reachedFrom: reachOf(call.in) });

        if (client.kind === "queue") publishers.push({ integration: client.id, file: call.file, line: call.line, in: call.in, topic: source === null ? null : literalArgument(source.text, source.starts, call.line, call.col, call.callee) });
      }
    }

    if (sites.length === 0 && imports.length === 0) continue;
    outgoing.push({ id: client.id, label: client.label, kind: client.kind, sites, imports });
  }

  const consumers = snapshot.entries.filter((entry) => entry.kind === "consumer").map((entry) => ({ label: entry.label, id: entry.id, file: entry.file, line: entry.line }));
  const pairs: IntegrationsReport["queues"]["pairs"] = [];

  // Join publishers and consumers by topic: a consumer label equal to the topic, or naming it as a word.
  for (const publisher of publishers) {
    if (publisher.topic === null) continue;

    for (const consumer of consumers) if (consumer.label === publisher.topic || consumer.label.split(/[\s:]+/).includes(publisher.topic)) pairs.push({ topic: publisher.topic, publisher: `${publisher.file}:${publisher.line}`, consumer: consumer.id });
  }

  // Sorted so publishers and pairs print in a stable order.
  publishers.sort((a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.integration, b.integration));
  pairs.sort((a, b) => compareText(a.topic, b.topic) || compareText(a.publisher, b.publisher) || compareText(a.consumer, b.consumer));

  const notes = [
    "arguments are not facts of the snapshot: the host is read from the source text at the call; a URL built at run time is `dynamic`, a call without a URL argument `n/a`",
    "calls through a value keylang cannot follow (`$client = $this->factory->create(); $client->send()`) are holes, not sites; the client's imports are listed",
  ];

  if (consumers.length === 0) notes.push("no queue consumers among the entry points: a framework's consumers need its adapter");

  return { snapshotId: snapshot.snapshotId, outgoing, webhooks: findWebhooks(snapshot, config.integrations.webhooks), queues: { publishers, consumers, pairs }, notes };
}

/** What `keylang integrations` prints. */
export function integrationsText(report: IntegrationsReport): string {
  const out: string[] = [];
  const sites = report.outgoing.reduce((sum, integration) => sum + integration.sites.length, 0);
  out.push(`outgoing: ${report.outgoing.length} integration(s), ${sites} call site(s) (resources/integrations.json)`);

  for (const integration of report.outgoing) {
    out.push(`  ${integration.id} · ${integration.label} · ${integration.kind}`);

    for (const site of integration.sites) {
      out.push(`    ${site.file}:${site.line}  ${site.in ?? "-"}  ${site.callee}  ${site.host ?? (site.url === "dynamic" ? "dynamic URL" : "url n/a")}`);

      if (site.reachedFrom.length === 0) out.push("      ← no entry point reaches it");

      for (const reach of site.reachedFrom) out.push(`      ← ${reach.kind} ${reach.label} (${reach.id})${reach.flow === null ? "" : ` · flow ${reach.flow.name}${reach.flow.source === "discovered" ? " (discovered)" : ""}`}`);
    }

    if (integration.sites.length === 0) out.push(`    imported only: ${integration.imports.map((imp) => `${imp.file}:${imp.line}`).join(", ")}`);
  }

  out.push("");
  out.push(`incoming webhooks: ${report.webhooks.length}`);

  for (const hook of report.webhooks) out.push(`  ${hook.kind}  ${hook.label}  ${hook.id}  ${hook.file}:${hook.line}  (${hook.via === "kind" ? "entry kind webhook" : hook.via === "path" ? "path names a webhook" : `integrations.webhooks ${hook.glob}`})`);
  out.push("");
  out.push(`queues: ${report.queues.publishers.length} publisher(s), ${report.queues.consumers.length} consumer(s), ${report.queues.pairs.length} pair(s)`);

  for (const publisher of report.queues.publishers) out.push(`  publish ${publisher.topic ?? "(dynamic topic)"}  ${publisher.integration}  ${publisher.file}:${publisher.line}  ${publisher.in ?? "-"}`);

  for (const consumer of report.queues.consumers) out.push(`  consume ${consumer.label}  ${consumer.id}  ${consumer.file}:${consumer.line}`);

  for (const pair of report.queues.pairs) out.push(`  pair ${pair.topic}: ${pair.publisher} → ${pair.consumer}`);
  out.push("");

  for (const note of report.notes) out.push(`note: ${note}`);

  return `${out.join("\n")}\n`;
}
