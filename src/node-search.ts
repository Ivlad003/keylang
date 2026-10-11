// Finding nodes by name, ID or what their explanation says (ADR 0004): the
// TUI's node search, MCP `search` and LSP workspace symbols share one ranking.
//
// Place in the pipeline: a query over an analysis (snapshot nodes plus the
// `planned` intentions of the parsed specs) and the stored explanations.
// Entry point: `searchNodes`.

import type { Analysis } from "./analyze.ts";
import { explanationOf, type NodeExplanation, type StoredExplanation } from "./explanations.ts";
import { sectionNodes, walk } from "./ir.ts";
import { compareText } from "./span.ts";

/** One search result: a node or a planned intention, with where it lives and what matched. */
export interface NodeHit {
  id: string;
  /** `layer`, `module`, `class`, `fn`, `type`, or `planned <kind>` for an intention in a spec. */
  kind: string;
  signature: string | null;
  /** The code of a snapshot node; the spec line of a planned one; null for a layer or a package. */
  file: string | null;
  line: number | null;
  explanation: NodeExplanation | null;
  /** What matched: the ID (or the name), or only the explanation's text. */
  by: "id" | "explanation";
}

/** A search: the text, how many hits at most, and whether names match fuzzily. */
export interface NodeQuery {
  query: string;
  limit: number;
  /**
   * `true`: the name and the ID match as a subsequence too (`crtOrd` finds
   * `createOrder`), best first. `false`: the ID must contain the query.
   */
  fuzzy: boolean;
}

/**
 * Nodes of the snapshot and `planned` intentions of the specs matching the
 * query, case-insensitive: first those whose ID or name matches (for `fuzzy`,
 * the exact name, then a name prefix, a name part, an ID part, then a
 * subsequence of the name and of the ID; shorter IDs first within one rank),
 * then those whose explanation contains the query, by ID. An empty query
 * lists every node by ID.
 */
export function searchNodes(analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>, q: NodeQuery): NodeHit[] {
  const query = q.query.trim().toLowerCase();
  const byId: { hit: NodeHit; rank: number }[] = [];
  const byText: NodeHit[] = [];

    // Split the candidates in two groups: matched by ID or name (ranked), or
    // only by the explanation text (kept after every ID match).
  for (const hit of candidates(analysis, briefs)) {
    const rank = query === "" ? 0 : idRank(query, hit.id, q.fuzzy);

    if (rank !== null) byId.push({ hit, rank });
    else if (hit.explanation?.text.toLowerCase().includes(query)) byText.push({ ...hit, by: "explanation" });
  }

  // An empty query lists by ID; otherwise better ranks first, and shorter IDs within one rank.
  byId.sort((a, b) => (query === "" ? 0 : a.rank - b.rank || a.hit.id.length - b.hit.id.length) || compareText(a.hit.id, b.hit.id));
  byText.sort((a, b) => compareText(a.id, b.id));

  return [...byId.map((x) => x.hit), ...byText].slice(0, q.limit);
}

function candidates(analysis: Analysis, briefs: ReadonlyMap<string, StoredExplanation>): NodeHit[] {
  const snapshot = analysis.snapshot;
  const out = new Map<string, NodeHit>();

    // Every node of the snapshot; a class is listed as `class`, not by its
    // node kind.
  for (const [id, node] of Object.entries(snapshot?.nodes ?? {})) {
    const kind = node.class ? "class" : node.kind;
    out.set(id, { id, kind, signature: node.signature ?? null, file: node.file, line: node.line, explanation: snapshot ? explanationOf(snapshot, briefs, id) : null, by: "id" });
  }

  // Intentions: `planned` declarations the code does not have yet, at their line in the spec.
  for (const doc of analysis.docs) {
    for (const section of doc.sections) {
      for (const top of sectionNodes(section)) {
        walk(top, (node) => {
          if (node.kind !== "planned" || !node.id || out.has(node.id)) return;
          out.set(node.id, { id: node.id, kind: `planned ${node.label?.value ?? "fn"}`, signature: node.text?.value ?? null, file: doc.path, line: node.span.start.line, explanation: null, by: "id" });
        });
      }
    }
  }

  return [...out.values()];
}

/** How well the ID or its last segment matches, lower is better; null when it does not. */
function idRank(query: string, id: string, fuzzy: boolean): number | null {
  const lower = id.toLowerCase();

  if (!fuzzy) return lower.includes(query) ? 0 : null;
    // Fuzzy ranks, best first: exact name, name prefix, name part, ID part,
    // then a subsequence of the name, then of the whole ID.
  const name = lower.slice(lower.lastIndexOf(".") + 1);

  if (name === query) return 0;

  if (name.startsWith(query)) return 1;

  if (name.includes(query)) return 2;

  if (lower.includes(query)) return 3;

  if (subsequence(query, name)) return 4;

  if (subsequence(query, lower)) return 5;

  return null;
}

/** Every code point of `query` appears in `text` in order. */
function subsequence(query: string, text: string): boolean {
  const wanted = [...query];
  let at = 0;

    // Greedy scan: advance in the query on each matching code point.
  for (const ch of text) if (ch === wanted[at] && ++at === wanted.length) return true;

  return wanted.length === 0;
}
