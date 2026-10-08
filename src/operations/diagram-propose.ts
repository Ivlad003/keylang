// «Запропонувати зміни» of the diagram editor (business-flows/24): the
// editor's canvas against the diagram of the same view, written as
// proposals — one per spec it changes — through the gates every proposal
// passes. `POST /api/diagram-proposal` of `keylang web` and
// `keylang diagram propose <view> --from <model.json>` are this one function.
//
// The drawing is compared with the specs as they are: when the client says
// which specs it opened the view with (`specHash`) and they changed since,
// nothing is computed and the answer says so (the page reloads the view).
// The answer lists, per target, the hunks MERGE will offer, and the K108
// weakenings the proposed texts would bring (a removed step, a new allow):
// what `check --changed` would say about them after a merge. New lanes come
// back as keylang.json with the layers added — printed only, as
// `keylang draft map` prints a layout. The drawn shapes a proposal took are
// marked in the view's layout file, so the editor can tell, after a merge,
// which were not accepted.

import { isAbsolute, join } from "node:path";
import { analyze, type Analysis } from "../analyze.ts";
import { CONFIG_FILE } from "../config.ts";
import { errorText } from "../diag.ts";
import { layoutToFile, readLayout, writeLayout, type ClientLayout } from "../diagram-layout.ts";
import { diagramChanges, parseEditorModel, type DiagramChanges } from "../diagram-proposal.ts";
import { diagramOf, viewOfKey, type Diagram } from "../diagram.ts";
import { existingText, readTextOrNull } from "../files.ts";
import type { Document } from "../ir.ts";
import { diffLines } from "../line-diff.ts";
import { sourceInputs } from "../map.ts";
import { parse } from "../parser.ts";
import { lineDiff, PROPOSALS_DIR, proposalProblem } from "../proposals.ts";
import { writeProblem } from "../safe-write.ts";
import { sha256 } from "../snapshot.ts";
import { compareText } from "../span.ts";
import { specWeakenings } from "../weakening.ts";
import { discoveredSpecOf } from "./diagram-export.ts";
import { commitProposal, generatedIn, proposalRefusal, rootRelative } from "./shared.ts";
import type { OperationContext } from "./types.ts";

/**
 * The specs a diagram was drawn from, as one hash: every hand-written spec
 * (its path and the SHA-256 of its text on disk) and keylang.json. The page
 * keeps it from `/api/diagram` and sends it back with the drawing.
 */
export function specHash(root: string, docs: readonly Document[]): string {
  const files = docs
    .filter((doc) => doc.generated === null)
    .map((doc) => doc.path)
    .sort(compareText)
    .map((path) => `${path}\u0000${sha256(readTextOrNull(join(root, path)) ?? "")}`);
  return sha256([`${CONFIG_FILE}\u0000${sha256(readTextOrNull(join(root, CONFIG_FILE)) ?? "")}`, ...files].join("\n"));
}

export interface DiagramProposeRequest {
  root: string;
  /** The view key (`flow:checkout`, `layers`, "" for the empty canvas). */
  view: string;
  /** `window.keylangEditor.currentModel()`, as JSON. */
  model: unknown;
  /** The specs the drawing was opened with (`specHash` of `/api/diagram`); null or absent: not compared. */
  specHash?: string | null;
  /** Compute and answer; write nothing. */
  print?: boolean;
}

/** One hunk as MERGE offers it: the first base line (1-based), the lines it takes out and those it puts in. */
export interface ProposedHunk {
  line: number;
  removed: string[];
  added: string[];
}

export interface ProposedFile {
  target: string;
  /** `.keylang/proposals/<target>`, or null when nothing was written (`--print`). */
  proposal: string | null;
  newFile: boolean;
  hunks: ProposedHunk[];
  diff: string;
  /** The full text proposed. */
  text: string;
  /** Keys of the drawn shapes (and lines, lanes) of the model this text holds. */
  shapes: string[];
}

export interface DiagramProposeResult {
  exitCode: 0 | 1 | 2;
  status: "proposed" | "printed" | "nothing" | "conflict" | "refused" | "invalid" | "failed";
  error: string | null;
  view: string;
  targets: ProposedFile[];
  /** K108 the proposed texts would bring, against the specs on disk. */
  weakenings: { file: string; line: number; col: number; message: string }[];
  config: { target: string; text: string; diff: string; note: string } | null;
  notes: string[];
  /** How to merge. */
  merge: string | null;
}

function result(view: string, status: DiagramProposeResult["status"], exitCode: 0 | 1 | 2, error: string | null = null): DiagramProposeResult {
  return { exitCode, status, error, view, targets: [], weakenings: [], config: null, notes: [], merge: null };
}

/** The diagram of a view the drawing is compared with: the specs' flow, a discovered flow, an entry, the layers; empty for the empty canvas. */
function baseDiagram(analysis: Analysis, root: string, view: string): Diagram | string {
  if (view === "") return { nodes: [], edges: [], groups: [] };
  const wanted = viewOfKey(view);
  if (wanted === null) return `unknown view \`${view}\`: flow:<name>, discovered:<name>, entry:<id>, process:<domain> or layers`;
  const spec = wanted.discovered ? discoveredSpecOf(root, rootRelative(root, analysis.config.dir)) : analysis.spec;
  if (spec === null) return { nodes: [], edges: [], groups: [] };
  return diagramOf({ snapshot: analysis.snapshot, spec, results: [], view: wanted.view });
}

/**
 * The drawing as proposals. 2: the model or the view is not one; 1: the
 * specs changed since the drawing was opened (`conflict`), or a proposal is
 * already waiting for a target, or a write was refused (`refused`); 0:
 * proposed, printed, or nothing to propose.
 */
export async function runDiagramPropose(request: DiagramProposeRequest, context: OperationContext = {}): Promise<DiagramProposeResult> {
  const { root, view } = request;
  if (!isAbsolute(root)) return result(view, "invalid", 2, "diagram propose: root must be an absolute path");
  const model = parseEditorModel(request.model);
  if (typeof model === "string") return result(view, "invalid", 2, model);
  if (model.view !== view && model.view !== "") return result(view, "invalid", 2, `the model draws \`${model.view}\`, not \`${view}\``);
  let analysis: Analysis;
  try {
    analysis = await (context.analyze ?? analyze)({ root, withoutEvidence: true });
  } catch (error) {
    return result(view, "failed", 2, errorText(error));
  }
  if (request.specHash !== undefined && request.specHash !== null && request.specHash !== specHash(root, analysis.docs)) {
    return result(view, "conflict", 1, "the specs changed since this diagram was opened: the view is drawn again from the specs as they are now; draw the change on it and propose again");
  }
  const diagram = baseDiagram(analysis, root, view);
  if (typeof diagram === "string") return result(view, "invalid", 2, diagram);
  const specDir = rootRelative(root, analysis.config.dir);
  const flowName = /^flow:(.+)$/.exec(view)?.[1] ?? null;
  const notes: string[] = [];
  if (view.startsWith("discovered:")) notes.push("a discovered flow is a view, not a spec: `keylang flows adopt <name>` proposes it; only rules and lanes of this drawing are proposed");
  let changes: DiagramChanges;
  try {
    changes = diagramChanges({
      model,
      diagram,
      flow: flowName,
      spec: analysis.spec,
      snapshot: analysis.snapshot,
      specDir,
      read: (path) => existingText(join(root, path)),
      config: { text: readTextOrNull(join(root, CONFIG_FILE)), layers: Object.fromEntries(analysis.config.layers) },
    });
  } catch (error) {
    return result(view, "failed", 2, errorText(error));
  }
  const out: DiagramProposeResult = { ...result(view, "nothing", 0), notes: [...notes, ...changes.notes] };
  if (changes.config !== null) {
    out.config = { target: changes.config.target, text: changes.config.text, diff: lineDiff(changes.config.before, changes.config.text), note: `${CONFIG_FILE} is not a spec: a proposal does not change it. Printed only, as \`keylang draft map\` prints a layout; a person applies the layers` };
  }
  if (changes.targets.length === 0) {
    out.notes.push("the drawing says nothing the specs do not already say: nothing to propose");
    return out;
  }
  // Each target through the gates of every proposal: a spec a proposal may change, a store that keeps the write policy, none waiting.
  const generated = generatedIn(analysis.docs);
  const candidates = [];
  for (const target of changes.targets) {
    const problem = proposalProblem(root, specDir, target.target, generated);
    const store = `${PROPOSALS_DIR}/${target.target}`;
    const pending = problem === null && writeProblem(root, store, { under: PROPOSALS_DIR, generated: true }) === null ? existingText(join(root, store)) : null;
    const refusal = proposalRefusal(root, { target: target.target, problem, pending }, "refuse", "diagram propose");
    if (refusal !== null) return { ...out, status: "refused", exitCode: refusal.exitCode, error: refusal.error };
    candidates.push({ ...target, pending });
  }
  // K108 of the proposed texts against the specs on disk.
  const docs = analysis.docs.filter((doc) => doc.generated === null);
  const baseDocs = docs.map((doc) => parse(doc.path, readTextOrNull(join(root, doc.path)) ?? ""));
  const proposed = new Map(candidates.map((c) => [c.target, c.text]));
  const nowDocs = [...baseDocs.filter((doc) => !proposed.has(doc.path)), ...[...proposed].filter(([path]) => path.endsWith(".md")).map(([path, text]) => parse(path, text))];
  out.weakenings = specWeakenings(baseDocs, nowDocs, specDir, "the specs on disk").map(({ file, line, col, message }) => ({ file, line, col, message: `K108 ${message}` }));
  const normal = (text: string): string[] => text.replace(/\r\n/g, "\n").split("\n");
  out.targets = candidates.map((c) => ({
    target: c.target,
    proposal: null,
    newFile: c.before === null,
    hunks: diffLines(normal(c.before ?? ""), normal(c.text)).map((hunk) => ({ line: hunk.baseStart + 1, removed: normal(c.before ?? "").slice(hunk.baseStart, hunk.baseStart + hunk.baseCount), added: hunk.lines })),
    diff: lineDiff(c.before ?? "", c.text),
    text: c.text,
    shapes: c.shapes,
  }));
  if (request.print === true) return { ...out, status: "printed" };
  const inputs = sourceInputs(analysis.config, analysis.snapshot?.manifest.files ?? []);
  for (const [i, c] of candidates.entries()) {
    const committed = await commitProposal({ root, specDir, generated, target: c.target, text: c.text, expected: { target: c.before, proposal: c.pending }, config: analysis.config, inputs }, context);
    if ("cancelled" in committed) return { ...out, status: "failed", exitCode: 2, error: "cancelled" };
    if ("refused" in committed) return { ...out, status: "refused", exitCode: 1, error: committed.refused.join("; ") };
    if ("failed" in committed) return { ...out, status: "failed", exitCode: 2, error: committed.failed };
    out.targets[i]!.proposal = committed.proposal;
  }
  out.status = "proposed";
  out.merge = `merge with MERGE in the TUI (\`keylang\`, m on a proposal), or a person runs ${out.targets.map((t) => `\`keylang proposals accept ${t.target}\``).join(", ")}`;
  // The drawn shapes the proposals took, in the view's layout: after a merge the editor shows which were not accepted.
  if (view !== "") {
    try {
      const marked: ClientLayout = {};
      const byKey = new Map(model.nodes.map((node) => [node.key, node]));
      for (const c of candidates) {
        for (const key of c.shapes) {
          const node = byKey.get(key);
          if (node) marked[key] = { x: node.x, y: node.y, w: node.w, h: node.h, id: node.id, kind: node.kind, label: node.label, proposed: c.target };
        }
      }
      if (Object.keys(marked).length > 0) {
        const saved = readLayout(root, specDir, view).file;
        const fresh = layoutToFile(view, marked, diagram);
        writeLayout(root, specDir, { format: fresh.format, view, shapes: { ...(saved?.shapes ?? {}), ...fresh.shapes }, edges: saved?.edges ?? {} });
      }
    } catch (error) {
      out.notes.push(`the layout of ${view} keeps no mark of the proposed shapes: ${errorText(error)}`);
    }
  }
  return out;
}
