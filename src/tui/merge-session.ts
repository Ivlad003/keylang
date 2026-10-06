// MERGE in a session: a proposal (`.keylang/proposals/<path>`, a spec or a
// source file) or a `Ctrl+G` result, compared with the file hunk by hunk and
// applied on `w`. A proposal has an identity — its text when `m` opened it —
// so a proposal an agent rewrote during the merge, or after it, is never
// applied, removed or restored as if it were the one the person decided on.
//
// `w` changes things in an order where a failure leaves a consistent state:
// the file first (a failed write changes nothing), then the proposal (what is
// left of it), then the session state, and the metrics last and best-effort.

import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadConfig, toPosix } from "../config.ts";
import { codeProposalProblem, PROPOSALS_DIR, proposalProblem } from "../proposals.ts";
import { compareText } from "../span.ts";
import { addDrafts, statusesIn, updateStats } from "../stats.ts";
import { isDirty, setText } from "./buffer.ts";
import { lf, readText, removeInside, splitEol, withEol, writeInside } from "./disk.ts";
import type { KeyEvent } from "./input.ts";
import { applyHunks, diffLines, type Decision } from "./merge.ts";
import type { Buffer, Cursor, MergeState, State } from "./state.ts";

/** What MERGE needs from the session around it. */
export interface MergeHost {
  readonly state: State;
  load(path: string): Buffer;
  open(path: string, cursor: Cursor): void;
  clampCursor(): void;
  reanalyze(): void;
  reanalyzeSoon(): void;
}

/**
 * One pending target of the proposals list: its kind, how many hunks it has
 * against the file on disk, and why it cannot be merged now (null: it can).
 * Built from disk each time the list opens or Enter is pressed; building it
 * writes nothing.
 */
export interface ProposalEntry {
  path: string;
  kind: "spec" | "code";
  /** The target does not exist on disk yet. */
  newFile: boolean;
  /** Hunks against the file on disk; null when the proposal is not read (a problem found before reading). */
  hunks: number | null;
  problem: string | null;
}

/** A proposal file is keylang's own: a link there is replaced, never written through. */
const PROPOSAL_FILE = { link: "replace" } as const;

export class MergeSession {
  private readonly host: MergeHost;

  constructor(host: MergeHost) {
    this.host = host;
  }

  private get state(): State {
    return this.host.state;
  }

  // ---------- proposals ----------

  /** Proposals that may be merged; the rest are listed with the reason they are ignored. */
  scan(): string[] {
    return this.files().filter((path) => this.problem(path) === null);
  }

  private files(): string[] {
    const dir = join(this.state.root, PROPOSALS_DIR);
    if (!existsSync(dir)) return [];
    // An unreadable proposals directory means no proposals, not the end of a session with unsaved buffers.
    try {
      return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => toPosix(relative(dir, join(entry.parentPath, entry.name))))
        .sort(compareText);
    } catch {
      return [];
    }
  }

  /**
   * Every file under `.keylang/proposals/`, sorted by POSIX path, with its
   * kind, hunk count and the reason it cannot be merged. A link in the store
   * is listed but never followed: a proposal is a plain file.
   */
  entries(): ProposalEntry[] {
    const dir = join(this.state.root, PROPOSALS_DIR);
    if (!existsSync(dir)) return [];
    let links: string[];
    try {
      links = readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isSymbolicLink())
        .map((entry) => toPosix(relative(dir, join(entry.parentPath, entry.name))));
    } catch {
      links = [];
    }
    const linked = links.map((path) => ({ path, kind: proposalKind(path), newFile: false, hunks: null, problem: `a link under ${PROPOSALS_DIR}/: a proposal is a plain file` }));
    return [...this.files().map((path) => this.entry(path)), ...linked].sort((a, b) => compareText(a.path, b.path));
  }

  /** The list entry of the proposal file `path`: read fresh, compared with the file on disk. */
  private entry(path: string): ProposalEntry {
    const kind = proposalKind(path);
    const problem = this.problem(path);
    if (problem !== null) return { path, kind, newFile: false, hunks: null, problem };
    const proposal = readText(this.proposalAbs(path));
    const disk = readText(resolve(this.state.root, path));
    const newFile = disk === null;
    if (proposal === null) return { path, kind, newFile, hunks: null, problem: `${PROPOSALS_DIR}/${path} cannot be read` };
    const hunks = diffLines(splitEol(disk ?? "").text.split("\n"), lf(proposal).split("\n")).length;
    const buffer = kind === "spec" ? this.state.buffers.get(path) : undefined;
    const dirty = buffer !== undefined && isDirty(buffer) ? "unsaved changes: save (Ctrl+S) or undo them before merging" : null;
    return { path, kind, newFile, hunks, problem: dirty };
  }

  /** The spec directory relative to the root, POSIX (`keylang`). */
  specDir(): string {
    let dir = "keylang";
    try {
      dir = loadConfig(this.state.root).dir;
    } catch {
      // A broken keylang.json is reported by the analysis; the default directory still bounds proposals.
    }
    return toPosix(relative(this.state.root, resolve(this.state.root, dir)));
  }

  /**
   * Why `.keylang/proposals/<path>` may not be merged, or null. A Markdown
   * proposal replaces one hand-written spec: a file under the spec directory,
   * not a generated map file, and not reached through a link that leads out.
   * Any other replaces a source file (`spec-to-code`) under the code limits.
   */
  problem(path: string): string | null {
    try {
      if (!path.endsWith(".md")) return codeProposalProblem(this.state.root, path);
      return proposalProblem(this.state.root, this.specDir(), path, (p) => this.state.analysis?.docs.some((doc) => doc.path === p && doc.generated !== null) === true);
    } catch (error) {
      return `cannot be checked: ${errorText(error)}`;
    }
  }

  /** The directory a merge of `path` may write in: the spec directory for a spec, the repository for code. */
  private boundary(code: boolean): string {
    return code ? this.state.root : resolve(this.state.root, this.specDir());
  }

  private proposalAbs(path: string): string {
    return join(this.state.root, PROPOSALS_DIR, path);
  }

  // ---------- opening ----------

  /**
   * Opens the proposal of `wanted`, else of the current file, else the first
   * one, as a MERGE diff against the file on disk. Proposals that break the
   * format's limits are ignored with the reason.
   */
  open(wanted?: string): void {
    const state = this.state;
    const proposals = this.scan();
    state.proposals = proposals;
    const path = wanted !== undefined ? proposals.find((file) => file === wanted) : (proposals.find((file) => file === state.current) ?? proposals[0]);
    if (!path && wanted !== undefined) {
      // Checked again now: a proposal removed or broken since the list was built is not opened from memory.
      const problem = this.files().includes(wanted) ? this.problem(wanted) : null;
      state.message = problem !== null ? `proposal ignored: ${wanted} (${problem})` : `no proposal for ${wanted} under ${PROPOSALS_DIR}/ any more`;
      return;
    }
    if (!path) {
      const ignored = this.files()
        .map((file) => ({ file, problem: this.problem(file) }))
        .filter((item) => item.problem !== null);
      state.message = ignored.length > 0 ? `proposal ignored: ${ignored.map((item) => `${item.file} (${item.problem})`).join("; ")}` : `no proposals under ${PROPOSALS_DIR}/`;
      return;
    }
    const proposal = readText(this.proposalAbs(path));
    if (proposal === null) {
      state.message = `${PROPOSALS_DIR}/${path} cannot be read`;
      return;
    }
    if (!path.endsWith(".md")) {
      // Code is never a buffer here: the merge compares the proposal with the file on disk.
      const disk = readText(resolve(state.root, path));
      if (state.mode === "code") state.mode = "view";
      this.start(path, "code", splitEol(disk ?? "").text.split("\n"), lf(proposal).split("\n"), disk, proposal);
      return;
    }
    const buffer = this.host.load(path);
    if (path !== state.current) this.host.open(path, { line: 0, col: 0 });
    // The proposal changes the file on disk; unsaved edits would show up as hunks that revert them.
    if (isDirty(buffer)) {
      state.message = `${path} has unsaved changes: save (Ctrl+S) or undo them before merging its proposal`;
      return;
    }
    const disk = readText(resolve(state.root, path));
    this.start(path, "proposal", splitEol(disk ?? "").text.split("\n"), lf(proposal).split("\n"), disk, proposal);
  }

  /** A merge of `proposed` into `base`; `proposal` is the proposal file's text (null for `Ctrl+G`). */
  start(path: string, origin: MergeState["origin"], base: string[], proposed: string[], disk: string | null, proposal: string | null): void {
    const state = this.state;
    const hunks = diffLines(base, proposed);
    if (hunks.length === 0) {
      state.message = "the proposal matches the file; nothing to merge";
      if (proposal !== null) this.dropProposal(path, proposal);
      state.proposals = this.scan();
      return;
    }
    const from = state.mode === "code" || state.mode === "merge" ? "view" : state.mode;
    state.merge = { path, origin, from, base, disk, proposal, hunks, decisions: hunks.map(() => "pending"), history: [], current: 0, top: Math.max(0, hunks[0]!.baseStart - 3) };
    state.mode = "merge";
    state.hover = null;
    state.completion = null;
  }

  /** Removes the proposal of `path` while it is still `text`. */
  private dropProposal(path: string, text: string): void {
    const abs = this.proposalAbs(path);
    try {
      if (readText(abs) === text) removeInside(this.state.root, abs, PROPOSAL_FILE);
    } catch {
      // A proposal that cannot be removed stays; the next `m` finds it matches.
    }
  }

  // ---------- keys ----------

  key(event: KeyEvent): void {
    const merge = this.state.merge;
    if (!merge) return;
    const focus = (index: number): void => {
      merge.current = Math.max(0, Math.min(merge.hunks.length - 1, index));
      const hunk = merge.hunks[merge.current]!;
      // Rows before the hunk: base lines plus the added lines of earlier hunks.
      let row = hunk.baseStart;
      for (let i = 0; i < merge.current; i++) row += merge.hunks[i]!.lines.length;
      merge.top = Math.max(0, row - 3);
    };
    const nextPending = (): void => {
      const after = merge.decisions.findIndex((decision, index) => index > merge.current && decision === "pending");
      const any = merge.decisions.findIndex((decision) => decision === "pending");
      if (after !== -1) focus(after);
      else if (any !== -1) focus(any);
    };
    switch (event.name) {
      case "a":
      case "r":
        merge.history.push({ hunk: merge.current, previous: merge.decisions[merge.current]! });
        merge.decisions[merge.current] = event.name === "a" ? "accepted" : "rejected";
        nextPending();
        return;
      case "u": {
        const last = merge.history.pop();
        if (last === undefined) {
          this.state.message = "no decision to undo";
          return;
        }
        merge.decisions[last.hunk] = last.previous;
        focus(last.hunk);
        return;
      }
      case "n":
      case "down":
      case "j":
        return focus(merge.current + 1);
      case "N":
      case "up":
      case "k":
        return focus(merge.current - 1);
      case "w":
        return this.write();
      case "escape":
      case "q":
        return this.leave(merge, "merge cancelled; nothing written");
      case "?":
        this.state.help = true;
        return;
      default:
        return;
    }
  }

  private leave(merge: MergeState, message: string): void {
    this.state.merge = null;
    // The counts follow the store: an agent may have written or removed proposals during the merge.
    this.state.proposals = this.scan();
    this.state.mode = merge.from;
    this.state.message = message;
    this.host.clampCursor();
  }

  // ---------- writing ----------

  /**
   * Applies the decided hunks. A proposal file is the external change being
   * confirmed, so the result goes to disk. The proposal is removed once every
   * hunk is decided; while some are pending it keeps only those, so a
   * rejected hunk does not come back on the next `m`. A `Ctrl+G` result goes
   * to the buffer, which `Ctrl+S` saves. Nothing is written over a file, or
   * from a proposal, that changed since the merge began.
   */
  private write(): void {
    const merge = this.state.merge!;
    if (merge.origin === "text-to-spec") return this.writeBuffer(merge);
    const count = (decision: Decision): number => merge.decisions.filter((d) => d === decision).length;
    const accepted = count("accepted");
    const pending = count("pending");
    if (accepted === 0 && count("rejected") === 0) {
      this.state.message = "nothing decided yet: a accepts, r rejects; Esc leaves, the proposal stays";
      return;
    }
    const state = this.state;
    const code = merge.origin === "code";
    const abs = resolve(state.root, merge.path);
    if (readText(abs) !== merge.disk) return this.leave(merge, `${merge.path} changed on disk during the merge; nothing written — press m to compare again`);
    const buffer = code ? null : this.host.load(merge.path);
    if (buffer && isDirty(buffer)) return this.leave(merge, `${merge.path} has unsaved changes; nothing written`);
    const proposalAbs = this.proposalAbs(merge.path);
    if (readText(proposalAbs) !== merge.proposal) return this.leave(merge, `the proposal for ${merge.path} changed during the merge; nothing written — press m to see the new one`);
    const result = applyHunks(merge.base, merge.hunks, merge.decisions).join("\n");
    const before = buffer ? (accepted > 0 ? merge.base.join("\n") : buffer.text) : "";

    // 1. The file. A write that fails (no permission, a link out of bounds) throws here, and nothing has changed.
    let disk: { before: string | null; after: string } | null = null;
    if (accepted > 0) {
      const eol = buffer ? buffer.eol : merge.disk === null ? "\n" : splitEol(merge.disk).eol;
      const after = withEol(result, eol);
      writeInside(this.boundary(code), abs, after);
      disk = { before: merge.disk, after };
      if (buffer) {
        buffer.undo.push({ text: buffer.text, cursor: { ...state.cursor } });
        setText(buffer, result);
        buffer.saved = result;
        buffer.disk = after;
      }
    }

    // 2. The proposal: consumed, or reduced to its pending hunks.
    const rest = pending === 0 ? null : applyHunks(merge.base, merge.hunks, merge.decisions.map((d) => (d === "rejected" ? "rejected" : "accepted"))).join("\n");
    let note = pending === 0 ? "" : `; ${pending} pending hunk(s) stay in the proposal`;
    try {
      if (rest === null) removeInside(state.root, proposalAbs, PROPOSAL_FILE);
      else writeInside(state.root, proposalAbs, rest, PROPOSAL_FILE);
    } catch (error) {
      note = `; the proposal could not be updated (${errorText(error)})`;
    }

    // 3. The session.
    state.proposals = this.scan();
    state.lastMerge = { path: merge.path, before, after: buffer?.text ?? "", disk, proposal: merge.proposal === null ? null : { abs: proposalAbs, before: merge.proposal, after: readText(proposalAbs) }, ...(code ? { code: true as const } : {}) };
    const written = accepted > 0 ? ` and written to ${merge.path}` : "";
    this.leave(merge, `merge: ${accepted} of ${merge.hunks.length} hunk(s) applied${written}${note}; u undoes`);
    this.host.reanalyze();

    // 4. Metrics: how often model lines are taken calibrates how drafts are shown (design §5.1 p.7).
    // Browse (no keylang.json) writes only what was asked for: no `.keylang/` for a count.
    if (!code && state.config.kind !== "missing-config") {
      try {
        updateStats(state.root, (stats) => {
          merge.hunks.forEach((hunk, i) => {
            const decision = merge.decisions[i];
            if (decision === "accepted" || decision === "rejected") addDrafts(stats, statusesIn(hunk.lines), decision);
          });
        });
      } catch {
        // An unwritable `.keylang/stats.json` loses the count, never the merge.
      }
    }
  }

  /** `Ctrl+G`: the accepted hunks go into the buffer, which `Ctrl+S` saves. */
  private writeBuffer(merge: MergeState): void {
    const buffer = this.host.load(merge.path);
    const accepted = merge.decisions.filter((decision) => decision === "accepted").length;
    const base = merge.base.join("\n");
    if (buffer.text !== base) return this.leave(merge, `${merge.path} changed during the merge; nothing applied — press Ctrl+G again`);
    if (accepted === 0) return this.leave(merge, "merge: nothing accepted; the buffer is unchanged");
    const result = applyHunks(merge.base, merge.hunks, merge.decisions).join("\n");
    buffer.undo.push({ text: base, cursor: { ...this.state.cursor } });
    setText(buffer, result);
    this.state.lastMerge = { path: merge.path, before: base, after: result, disk: null, proposal: null };
    this.leave(merge, `merge: ${accepted} of ${merge.hunks.length} hunk(s) applied; u undoes`);
    this.host.reanalyzeSoon();
  }

  /**
   * `u` in the view: undoes the last merge while the file still holds its
   * result, on disk too, and brings back the proposal as it was — unless a
   * newer proposal was written since, which is kept.
   */
  undo(): void {
    const state = this.state;
    const last = state.lastMerge;
    if (!last) {
      state.message = "no merge to undo";
      return;
    }
    const abs = resolve(state.root, last.path);
    const buffer = last.code ? null : this.host.load(last.path);
    if ((buffer && buffer.text !== last.after) || (last.disk !== null && readText(abs) !== last.disk.after)) {
      state.lastMerge = null;
      state.message = `${last.path} changed after the merge; u no longer applies${buffer ? " (Ctrl+Z in edit mode undoes edits)" : ""}`;
      return;
    }
    if (last.disk) {
      const boundary = this.boundary(last.code === true);
      if (last.disk.before === null) removeInside(boundary, abs);
      else writeInside(boundary, abs, last.disk.before);
      if (buffer) {
        buffer.saved = last.before;
        buffer.disk = last.disk.before;
      }
    }
    let note = "";
    if (last.proposal) {
      if (readText(last.proposal.abs) === last.proposal.after) {
        writeInside(state.root, last.proposal.abs, last.proposal.before, PROPOSAL_FILE);
        note = "; the proposal is back";
      } else note = "; a newer proposal was written since and is kept";
    }
    if (buffer) setText(buffer, last.before);
    state.lastMerge = null;
    state.proposals = this.scan();
    state.message = `merge undone in ${last.path}${note}`;
    this.host.clampCursor();
    this.host.reanalyze();
  }
}

/** A Markdown proposal replaces a spec; any other replaces a source file (or a test). */
function proposalKind(path: string): ProposalEntry["kind"] {
  return path.endsWith(".md") ? "spec" : "code";
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
